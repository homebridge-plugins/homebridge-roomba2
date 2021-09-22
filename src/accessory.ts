import dorita980, { RobotState, Roomba } from "dorita980";
import { AccessoryConfig, AccessoryPlugin, NodeCallback, API, Logging, Service, CharacteristicValue, CharacteristicGetCallback, CharacteristicSetCallback } from "homebridge";

/**
 * The window of time in which status requests to Roomba are coalesced.
 */
const STATUS_COALLESCE_WINDOW_MILLIS = 5_000;

/**
 * How long to wait to connect to Roomba.
 */
const CONNECT_TIMEOUT = 60_000;

/**
 * When actively watching Roomba's status, how often to query Roomba and update HomeKit.
 */
const WATCH_INTERVAL_MILLIS = 10_000;

/**
 * After starting to actively watch Roomba's status, how long should we watch for after
 * the last status enquiry from HomeKit? This lets us stop checking on Roomba when no
 * one is interested.
 */
const WATCH_IDLE_TIMEOUT_MILLIS = 600_000;

/**
 * Whether to output debug logging at info level. Useful during debugging to be able to
 * see debug logs from this plugin.
 */
const DEBUG = true;

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

    /**
     * The currently connected Roomba instance _only_ used in the connect() method.
     */
    private _currentlyConnectedRoomba?: Roomba;

    /**
     * How many requests are currently using the connected Roomba instance.
     */
    private _currentlyConnectedRoombaRequests = 0;

    /**
     * Whether the plugin is actively watching Roomba's state and updating HomeKit
     */
    private watching?: NodeJS.Timeout
    private lastWatchingRequestTimestamp?: number

    public constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.api = api;
        this.log = !DEBUG
            ? log
            : Object.assign(log, {
                debug: (message: string, ...parameters: unknown[]) => {
                    log.info(`DEBUG: ${message}`, ...parameters);
                },
            });
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
        this.batteryService = new Service.Battery(this.name);
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

    private async connect(callback: (error: Error | null, roomba?: Roomba) => Promise<void>) {
        const getRoomba = () => {
            if (this._currentlyConnectedRoomba) {
                this._currentlyConnectedRoombaRequests++;
                return this._currentlyConnectedRoomba;
            }

            const roomba = new dorita980.Local(this.blid, this.robotpwd, this.ipaddress);
            this._currentlyConnectedRoomba = roomba;
            this._currentlyConnectedRoombaRequests = 1;
            return roomba;
        };
        const stopUsingRoomba = async(roomba: Roomba, force = false) => {
            if (force) {
                this._currentlyConnectedRoomba = undefined;
                await roomba.end();
                return;
            }

            if (roomba !== this._currentlyConnectedRoomba) {
                this.log.warn("Releasing an unexpected Roomba instance");
                await roomba.end();
                return;
            }
    
            this._currentlyConnectedRoombaRequests--;
            if (this._currentlyConnectedRoombaRequests === 0) {
                this._currentlyConnectedRoomba = undefined;

                this.log.debug("Releasing Roomba instance");
                await roomba.end();
            } else {
                this.log.debug("Leaving Roomba instance with %i ongoing requests", this._currentlyConnectedRoombaRequests);
            }
        };

        const roomba = getRoomba();
        if (roomba.connected) {
            this.log.debug("Reusing connected Roomba");

            await callback(null, roomba);
            await stopUsingRoomba(roomba);
            return;
        }

        let timedOut = false;

        const timeout = setTimeout(async() => {
            timedOut = true;

            this.log.warn("Timed out after %is trying to connect to Roomba", CONNECT_TIMEOUT / 1000);

            await stopUsingRoomba(roomba, true);
            await callback(new Error("Connect timed out"));
        }, CONNECT_TIMEOUT);
    
        const now = Date.now();
        this.log.debug("Connecting to Roomba…");

        roomba.on("connect", async() => {
            if (timedOut) {
                this.log.debug("Connection established to Roomba after timeout");
                return;
            }

            clearTimeout(timeout);

            this.log.debug("Connected to Roomba in %ims", Date.now() - now);
            await callback(null, roomba);
            await stopUsingRoomba(roomba);
        });
    }

    private setRunningState(powerOn: CharacteristicValue, callback: CharacteristicSetCallback) {
        if (powerOn) {
            this.log("Starting Roomba");

            this.connect(async(error, roomba) => {
                if (error || !roomba) {
                    callback(error || new Error("Unknown error"));
                    return;
                }

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

                    /* After sending an action to Roomba, we start watching to ensure HomeKit has up to date status */
                    this.startWatching();
                } catch (error) {
                    this.log("Roomba failed: %s", (error as Error).message);

                    callback(error as Error);
                }
            });
        } else {
            this.log("Roomba pause and dock");

            this.connect(async(error, roomba) => {
                if (error || !roomba) {
                    callback(error || new Error("Unknown error"));
                    return;
                }

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

                    this.startWatching();
                    await this.dockWhenStopped(roomba, 3000);
                } catch (error) {
                    this.log("Roomba failed: %s", (error as Error).message);

                    callback(error as Error);
                }
            });
        }
    }

    private async dockWhenStopped(roomba: Roomba, pollingInterval: number) {
        try {
            const state = await roomba.getRobotState(["cleanMissionStatus"]);

            switch (state.cleanMissionStatus!.phase) {
                case "stop":
                    this.log("Roomba has stopped, issuing dock request");

                    await roomba.dock();

                    this.log("Roomba docking");
                    
                    this.mergeCachedStatus({
                        running: false,
                        charging: false,
                        docking: true,
                    });

                    break;
                case "run":
                    this.log("Roomba is still running. Will check again in %is", pollingInterval / 1000);

                    await setTimeout(() => this.log.debug("Trying to dock again..."), pollingInterval);
                    await this.dockWhenStopped(roomba, pollingInterval);

                    break;
                default:
                    this.log("Roomba is not running");

                    break;
            }
        } catch (error) {
            this.log.warn("Roomba failed to dock: %s", (error as Error).message);
        }
    }
    
    /**
     * Creates as a Characteristic getter function that derives the CharacteristicValue from Roomba's status.
     */
    private createCharacteristicGetter(name: string, extractValue: (status: Status) => CharacteristicValue | null): CharacteristicGetter {
        return (callback: CharacteristicGetCallback) => {
            this.log.debug("%s requested", name);

            let timeoutResponded = false;

            /* Ensure we respond to Homebridge within a short time to avoid slowing down Homebridge */
            const timeout = setTimeout(() => {
                timeoutResponded = true;
                if (this.cachedStatus) {
                    this.log.debug("%s: timeout returning last result: %s", name, JSON.stringify(this.cachedStatus));
                    callback(this.cachedStatus.error, !this.cachedStatus.error ? extractValue(this.cachedStatus!) : undefined);
                } else {
                    this.log.debug("%s: timeout returning no result", name);
                    callback(new Error("Device slow to respond"));
                }
            }, 500);

            this.getStatus((error, status) => {
                if (!timeoutResponded) {
                    clearTimeout(timeout);
                    this.log.debug("%s: returning result %s %s", name, error, status ? JSON.stringify(status) : undefined);
                    callback(error, status ? extractValue(status) : undefined);
                }

                /* After HomeKit has queried a characteristic, we start watching to keep HomeKit updated
                   of any changes.
                 */
                this.startWatching();
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
            this.log.debug("Queueing status request with status request that's been running for %ims", now - this.currentGetStatusTimestamp);
            return;
        }
        this.currentGetStatusTimestamp = now;

        this.connect(async(error, roomba) => {
            const handleError = (error: Error | null) => {
                for (const aCallback of this.pendingStatusRequests) {
                    aCallback(error || new Error("Unknown error"));
                }

                this.setCachedStatus({ error: error as Error });
            };

            try {
                if (error || !roomba) {
                    this.log.debug("getStatus failed to connect to Roomba after %ims", Date.now() - now);
                    handleError(error);
                    return;
                }

                try {
                    const response = await roomba.getRobotState(["cleanMissionStatus", "batPct", "bin"]);
                    const status = this.parseState(response);
                    this.log.debug("getStatus got status in %ims: %s => %s", Date.now() - now, JSON.stringify(response), JSON.stringify(status));

                    for (const aCallback of this.pendingStatusRequests) {
                        aCallback(null, status);
                    }

                    this.setCachedStatus(status);
                } catch (error) {
                    this.log.warn("Unable to determine state of Roomba: %s", (error as Error).message);

                    handleError(error as Error);
                }
            } finally {
                this.currentGetStatusTimestamp = undefined;
                this.pendingStatusRequests = [];
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
                this.log.info("Unsupported phase: %s", state.cleanMissionStatus!.phase);

                status.running = false;
                status.charging = false;
                status.docking = false;

                break;
        }
        return status;
    }

    private updateCharacteristics(status: Status) {
        this.log.debug("Updating characteristics for status: %s", JSON.stringify(status));

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

    /**
     * Start actively watching Roomba's status and reporting updates to HomeKit.
     * We start watching whenever an event occurs, so we update HomeKit promptly
     * when the status changes.
     */
    private startWatching() {
        this.lastWatchingRequestTimestamp = Date.now();

        if (this.watching !== undefined) {
            return;
        }

        let errors = 0;

        const checkStatus = () => {
            const timeSinceLastWatchingRequest = Date.now() - (this.lastWatchingRequestTimestamp || 0);
            if (timeSinceLastWatchingRequest > WATCH_IDLE_TIMEOUT_MILLIS) {
                this.log.debug("Stopping watching Roomba due to idle timeout");
                this.stopWatching();
                return;
            }
            
            this.getStatus((error, status) => {
                if (error || !status) {
                    errors++;
                    if (errors > 10) {
                        this.log.warn("Stopped watching Roomba's status due to too many errors");
                        this.stopWatching();
                    } else {
                        this.watching = setTimeout(checkStatus, WATCH_INTERVAL_MILLIS);
                    }
                } else {
                    errors = 0;

                    const timeSinceLastWatchingRequest = Date.now() - (this.lastWatchingRequestTimestamp || 0);
                    this.log.debug(
                        "Will check Roomba's status again in %is (idle timeout in %is)",
                        WATCH_INTERVAL_MILLIS / 1000, 
                        (WATCH_IDLE_TIMEOUT_MILLIS - timeSinceLastWatchingRequest) / 1000
                    );
                    this.watching = setTimeout(checkStatus, WATCH_INTERVAL_MILLIS);
                }
            });
        };
        
        this.watching = setTimeout(checkStatus, WATCH_INTERVAL_MILLIS);
    }

    private stopWatching() {
        if (this.watching !== undefined) {
            clearTimeout(this.watching);
            this.watching = undefined;
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
