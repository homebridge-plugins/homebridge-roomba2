import dorita980, { RobotState, Roomba } from "dorita980";
import { AccessoryConfig, AccessoryPlugin, NodeCallback, API, Logging, Service, CharacteristicValue, CharacteristicGetCallback, CharacteristicSetCallback } from "homebridge";

/**
 * The window of time in which status requests to Roomba are coalesced.
 */
const STATUS_COALLESCE_WINDOW_MILLIS = 5_000;

interface Status {
    error: null
    running: boolean
    docking: boolean
    charging: boolean
    batteryLevel: number | null
    binFull: boolean
}

interface StatusError {
    error: Error
}

type CachedStatus = Status | StatusError;

type CharacteristicGetter = (callback: CharacteristicGetCallback, context: unknown, connection?: unknown) => void

export default class RoombaAccessory implements AccessoryPlugin {

    private api: API
    private log: Logging
    private name: string
    private model: string
    private serialnum: string
    private blid: string
    private robotpwd: string
    private ipaddress: string
    private firmware: string

    private accessoryInfo: Service
    private filterMaintenance: Service
    private switchService: Service
    private batteryService: Service
    private dockService?: Service
    private runningService?: Service
    private binService?: Service
    private dockingService?: Service

    /**
     * The last known state from Roomba, if any.
     */
    private cachedStatus?: CachedStatus

    /**
     * The epoch time in millis when the current status request to Roomba
     * started, or undefined if there is no current status request.
     */
    private currentGetStatusTimestamp?: number

    /**
     * An array of the status callbacks waiting for the current status request.
     */
    private pendingStatusRequests: NodeCallback<Status>[]

    public constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.api = api;
        this.log = log;
        this.name = config.name;
        this.model = config.model;
        this.serialnum = config.serialnum;
        this.blid = config.blid;
        this.robotpwd = config.robotpwd;
        this.ipaddress = config.ipaddress;
        this.firmware = "N/A";
        const showDockAsContactSensor = config.dockContactSensor === undefined ? true : config.dockContactSensor;
        const showRunningAsContactSensor = config.runningContactSensor;
        const showBinStatusAsContactSensor = config.binContactSensor;
        const showDockingAsContactSensor = config.dockingContactSensor;

        const Service = api.hap.Service;

        this.accessoryInfo = new Service.AccessoryInformation();
        this.filterMaintenance = new Service.FilterMaintenance(this.name);
        this.switchService = new Service.Switch(this.name);
        this.batteryService = new Service.BatteryService(this.name);
        if (showDockAsContactSensor) {
            this.dockService = new Service.ContactSensor(this.name + " Dock", "docked");
        }
        if (showRunningAsContactSensor) {
            this.runningService = new Service.ContactSensor(this.name + " Running", "running");
        }
        if (showBinStatusAsContactSensor) {
            this.binService = new Service.ContactSensor(this.name + " Bin Full", "Full"); 
        }
        if (showDockingAsContactSensor) {
            this.dockingService = new Service.ContactSensor(this.name + " Docking", "docking"); 
        }

        this.pendingStatusRequests = [];
    }

    public identify(): void {
        this.log.debug("Identify requested. Not supported yet.");
    }

    public getServices(): Service[] {
        const services: Service[] = [];

        const Characteristic = this.api.hap.Characteristic;

        const version: string = require("../package.json").version;

        this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "iRobot");
        this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, this.serialnum);
        this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
        this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);
        this.accessoryInfo.setCharacteristic(Characteristic.Model, this.model);
        this.accessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, version);
        services.push(this.accessoryInfo);

        this.switchService
            .getCharacteristic(Characteristic.On)
            .on("set", this.setRunningState.bind(this))
            .on("get", this.createCharacteristicGetter("Running status", this.runningStatus));
        services.push(this.switchService);

        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .on("get", this.createCharacteristicGetter("Battery level", this.batteryLevelStatus));
        this.batteryService
            .getCharacteristic(Characteristic.ChargingState)
            .on("get", this.createCharacteristicGetter("Charging status", this.chargingStatus));
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .on("get", this.createCharacteristicGetter("Low Battery status", this.batteryStatus));
        services.push(this.batteryService);

        this.filterMaintenance
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .on("get", this.createCharacteristicGetter("Bin status", this.binStatus));
        services.push(this.filterMaintenance);

        if (this.dockService) {
            this.dockService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.createCharacteristicGetter("Dock status", this.dockedStatus));
            services.push(this.dockService);
        }
        if (this.runningService) {
            this.runningService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.createCharacteristicGetter("Running status", this.runningStatus));
            services.push(this.runningService);
        }
        if (this.binService) {
            this.binService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.createCharacteristicGetter("Bin status", this.binStatus));
            services.push(this.binService);
        }
        if (this.dockingService) {
            this.dockingService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.createCharacteristicGetter("Docking status", this.dockingStatus));
            services.push(this.dockingService);
        }

        return services;
    }

    private getRoomba() {
        return new dorita980.Local(this.blid, this.robotpwd, this.ipaddress);
    }

    private onConnected(roomba: Roomba, callback: () => void) {
        roomba.on("connect", () => {
            this.log.debug("Connected to Roomba");
            callback();
        });
    }

    private setRunningState(powerOn: CharacteristicValue, callback: CharacteristicSetCallback) {
        const roomba = this.getRoomba();

        if (powerOn) {
            this.log("Starting Roomba");

            this.onConnected(roomba, async() => {
                try {
                    /* To start Roomba we signal both a clean and a resume, as if Roomba is paused in a clean cycle,
                       we need to instruct it to resume instead.
                     */
                    await roomba.clean();
                    await roomba.resume();

                    this.mergeCachedStatus({
                        running: true,
                        charging: false,
                        docking: false,
                    });

                    this.log("Roomba is running");

                    callback();
                } catch (error) {
                    this.log("Roomba failed: %s", (error as Error).message);

                    callback(error as Error);
                } finally {
                    this.endRoombaIfNeeded(roomba);
                }
            });
        } else {
            this.log("Roomba pause and dock");

            this.onConnected(roomba, async() => {
                try {
                    this.log("Roomba is pausing");

                    await roomba.pause();

                    callback();
                    
                    this.mergeCachedStatus({
                        running: false,
                        charging: false,
                        docking: false,
                    });

                    this.log("Roomba paused, returning to Dock");

                    this.dockWhenStopped(roomba, 3000);
                } catch (error) {
                    this.log("Roomba failed: %s", (error as Error).message);

                    this.endRoombaIfNeeded(roomba);

                    callback(error as Error);
                }
            });
        }
    }

    private endRoombaIfNeeded(roomba: Roomba) {
        roomba.end();
    }

    private async dockWhenStopped(roomba: Roomba, pollingInterval: number) {
        try {
            const state = await roomba.getRobotState(["cleanMissionStatus"]);

            switch (state.cleanMissionStatus!.phase) {
                case "stop":
                    this.log("Roomba has stopped, issuing dock request");

                    await roomba.dock();
                    this.endRoombaIfNeeded(roomba);

                    this.log("Roomba docking");
                    
                    this.mergeCachedStatus({
                        running: false,
                        charging: false,
                        docking: true,
                    });

                    break;
                case "run":
                    this.log("Roomba is still running. Will check again in 3 seconds");

                    await setTimeout(() => this.log.debug("Trying to dock again..."), pollingInterval);
                    this.dockWhenStopped(roomba, pollingInterval);

                    break;
                default:
                    this.endRoombaIfNeeded(roomba);

                    this.log("Roomba is not running");

                    break;
            }
        } catch (error) {
            this.log.warn(`Roomba failed to dock: ${(error as Error).message}`);
            this.endRoombaIfNeeded(roomba);
        }
    }
    
    /**
     * Creates as a Characteristic getter function that derives the CharacteristicValue from Roomba's status.
     */
    private createCharacteristicGetter(name: string, extractValue: (status: Status) => CharacteristicValue | null): CharacteristicGetter {
        return (callback: CharacteristicGetCallback) => {
            this.log.debug(`${name} requested`);

            let timeoutResponded = false;

            /* Ensure we respond to Homebridge within a short time to avoid slowing down Homebridge */
            const timeout = setTimeout(() => {
                timeoutResponded = true;
                if (this.cachedStatus) {
                    this.log.debug(`${name}: timeout returning last result: ${JSON.stringify(this.cachedStatus)}`);
                    callback(this.cachedStatus.error, !this.cachedStatus.error ? extractValue(this.cachedStatus!) : undefined);
                } else {
                    this.log.debug(`${name}: timeout returning no result`);
                    callback(new Error("Device slow to respond"));
                }
            }, 500);

            this.getStatus((error, status) => {
                if (!timeoutResponded) {
                    clearTimeout(timeout);
                    this.log.debug(`${name}: returning result ${error} ${status}`);
                    callback(error, status ? extractValue(status) : undefined);
                }
            });
        };
    }

    /**
     * Get the current status from Roomba. Coalesces status requests into one status request
     * to Roomba at a time.
     * @param callback 
     * @returns 
     */
    private getStatus(callback: NodeCallback<Status>) {
        this.pendingStatusRequests.push(callback);

        const now = Date.now();
        if (this.currentGetStatusTimestamp !== undefined && now - this.currentGetStatusTimestamp < STATUS_COALLESCE_WINDOW_MILLIS) {
            return;
        }
        this.currentGetStatusTimestamp = now;

        const roomba = this.getRoomba();

        this.onConnected(roomba, async() => {
            try {
                const response = await roomba.getRobotState(["cleanMissionStatus", "batPct", "bin"]);
                const status = this.parseState(response);
                this.log.debug("Roomba status: %s => %s", JSON.stringify(response), JSON.stringify(status));

                for (const aCallback of this.pendingStatusRequests) {
                    aCallback(null, status);
                }

                this.setCachedStatus(status);
            } catch (error) {
                this.log.warn(`Unable to determine state of Roomba: ${(error as Error).message}`);

                for (const aCallback of this.pendingStatusRequests) {
                    aCallback(error as Error);
                }

                this.setCachedStatus({ error: error as Error });
            } finally {
                this.currentGetStatusTimestamp = undefined;
                this.pendingStatusRequests = [];

                this.endRoombaIfNeeded(roomba);
            }
        });
    }

    /**
     * Merge in changes to the cached status, and update our characteristics so the plugin
     * preemptively reports state back to Homebridge.
     */
    private mergeCachedStatus(status: Partial<Status>) {
        if (this.cachedStatus && !this.cachedStatus.error) {
            this.setCachedStatus({
                ...this.cachedStatus,
                ...status,
            });
        }
    }

    /**
     * Update the cached status and update our characteristics so the plugin preemptively
     * reports state back to Homebridge.
     */
    private setCachedStatus(status: CachedStatus) {
        this.cachedStatus = status;
        if (!status.error) {
            this.updateCharacteristics(status);
        }
    }

    private parseState(state: RobotState) {
        const status: Status = {
            error: null,
            running: false,
            docking: false,
            charging: false,
            batteryLevel: null,
            binFull: false,
        };

        status.batteryLevel = state.batPct!;
        status.binFull = state.bin!.full;

        switch (state.cleanMissionStatus!.phase) {
            case "run":
                status.running = true;
                status.charging = false;
                status.docking = false;

                break;
            case "charge":
                status.running = false;
                status.charging = true;
                status.docking = false;

                break;
            case "hmUsrDock":
                status.running = false;
                status.charging = false;
                status.docking = true;
                
                break;
            case "stop":
                status.running = false;
                status.charging = false;
                status.docking = false;

                break;
            default:
                this.log.info(`Unsupported phase: ${state.cleanMissionStatus!.phase}`);

                status.running = false;
                status.charging = false;
                status.docking = false;

                break;
        }
        return status;
    }

    private updateCharacteristics(status: Status) {
        const Characteristic = this.api.hap.Characteristic;

        this.switchService
            .getCharacteristic(Characteristic.On)
            .updateValue(this.runningStatus(status));
        this.batteryService
            .getCharacteristic(Characteristic.ChargingState)
            .updateValue(this.chargingStatus(status));
        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .updateValue(this.batteryLevelStatus(status));
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .updateValue(this.batteryStatus(status));
        this.filterMaintenance
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .updateValue(this.binStatus(status));
        if (this.dockService) {
            this.dockService
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(this.dockedStatus(status));
        }
        if (this.runningService) {
            this.runningService
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(this.runningStatus(status));
        }
        if (this.binService) {
            this.binService
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(this.binStatus(status));
        }
        if (this.dockingService) {
            this.dockingService
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(this.dockingStatus(status));
        }
    }

    private runningStatus = (status: Status) => status.running
        ? this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED;
    private chargingStatus = (status: Status) => status.charging
        ? this.api.hap.Characteristic.ChargingState.CHARGING
        : this.api.hap.Characteristic.ChargingState.NOT_CHARGING;
    private dockingStatus = (status: Status) => status.docking
        ? this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED;
    private dockedStatus = (status: Status) => status.charging
        ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
        : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    private batteryLevelStatus = (status: Status) => status.batteryLevel;
    private binStatus = (status: Status) => status.binFull
        ? this.api.hap.Characteristic.FilterChangeIndication.CHANGE_FILTER
        : this.api.hap.Characteristic.FilterChangeIndication.FILTER_OK;
    private batteryStatus = (status: Status) => status.batteryLevel === null
        ? null
        : status.batteryLevel <= 20
            ? this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            : this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;

}
