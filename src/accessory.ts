import dorita980, { RobotState, Roomba } from "dorita980";
import { AccessoryConfig, AccessoryPlugin, NodeCallback, API, Logging, Service, CharacteristicValue, CharacteristicGetCallback, CharacteristicSetCallback } from "homebridge";
import NodeCache from "node-cache";
import { timeout } from "promise-timeout";

const STATUS = "status";
const OLD_STATUS = "oldStatus";

interface Status {
    error: null
    running: 0 | 1
    charging: number
    batteryLevel: string | number
    batteryStatus: string | 0 | 1
    binFull: boolean
    binStatus: 0 | 1
}

interface StatusError {
    error: Error
}

type CachedStatus = Status | StatusError;

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
    private keepAliveEnabled: boolean
    private autoRefreshEnabled: boolean
    private showDockAsContactSensor: boolean
    private showRunningAsContactSensor: boolean
    private showBinStatusAsContactSensor: boolean
    private cacheTTL: number
    private roomba: Roomba | null

    private accessoryInfo: Service
    private filterMaintenance: Service
    private switchService: Service
    private batteryService: Service
    private dockService?: Service
    private runningService?: Service
    private binService?: Service
    private cache: NodeCache

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
        this.keepAliveEnabled = config.keepAliveEnabled;
        this.autoRefreshEnabled = config.autoRefreshEnabled;
        this.showDockAsContactSensor = config.dockContactSensor === undefined ? true : config.dockContactSensor;
        this.showRunningAsContactSensor = config.runningContactSensor;
        this.showBinStatusAsContactSensor = config.binContactSensor;
        this.cacheTTL = config.cacheTTL || 5;
        this.roomba = null;

        const Service = api.hap.Service;

        this.accessoryInfo = new Service.AccessoryInformation();
        this.filterMaintenance = new Service.FilterMaintenance(this.name);
        this.switchService = new Service.Switch(this.name);
        this.batteryService = new Service.BatteryService(this.name);
        if (this.showDockAsContactSensor) {
            this.dockService = new Service.ContactSensor(this.name + " Docked", "docked");
        }
        if (this.showRunningAsContactSensor) {
            this.runningService = new Service.ContactSensor(this.name + " Running", "running");
        }
        if (this.showBinStatusAsContactSensor) {
            this.binService = new Service.ContactSensor(this.name + " Bin Full", "Full"); 
        }

        this.cache = new NodeCache({
            stdTTL: this.cacheTTL,
            checkperiod: 1,
            useClones: false,
        });

        if (this.keepAliveEnabled) {
            this.registerStateUpdate();
        } else if (this.autoRefreshEnabled) {
            this.enableAutoRefresh();
        }
    }

    public identify(): void {
        this.log.debug("Identify requested. Not supported yet.");
    }

    public getServices(): Service[] {
        const services: Service[] = [];

        const Characteristic = this.api.hap.Characteristic;

        const version: string = require("../package.json").version;

        this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "iRayanKhan");
        this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, this.serialnum);
        this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
        this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);
        this.accessoryInfo.setCharacteristic(Characteristic.Model, this.model);
        this.accessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, version);
        services.push(this.accessoryInfo);

        this.switchService
            .getCharacteristic(Characteristic.On)
            .on("set", this.setState.bind(this))
            .on("get", this.getRunningStatus.bind(this));
        services.push(this.switchService);

        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .on("get", this.getBatteryLevel.bind(this));
        this.batteryService
            .getCharacteristic(Characteristic.ChargingState)
            .on("get", this.getIsCharging.bind(this));
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .on("get", this.getLowBatteryStatus.bind(this));
        services.push(this.batteryService);
        this.filterMaintenance
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .on("get", this.getFilterStatus.bind(this));
        services.push(this.filterMaintenance);

        if (this.showDockAsContactSensor) {
            this.dockService!
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.getDockedState.bind(this));
            services.push(this.dockService!);
        }
        if (this.showRunningAsContactSensor) {
            this.runningService!
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.getRunningStatus.bind(this));
            services.push(this.runningService!);
        }
        if (this.showBinStatusAsContactSensor) {
            this.binService!
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.getFilterStatus.bind(this));
            services.push(this.binService!);
        }

        return services;
    }

    private getRoomba() {
        if (this.keepAliveEnabled) {
            if (this.roomba == null) {
                this.roomba = new dorita980.Local(this.blid, this.robotpwd, this.ipaddress);
            }
            return this.roomba;
        } else {
            return new dorita980.Local(this.blid, this.robotpwd, this.ipaddress);
        }
    }

    private onConnected(roomba: Roomba, callback: () => void, silent = false) {
        if (this.keepAliveEnabled && roomba.connected) {
            callback();
        } else {
            roomba.on("connect", () => {
                if (!silent) {
                    this.log("Connected to Roomba");
                } else {
                    this.log.debug("Connected to Roomba");
                }
                callback();
            });
        }
    }

    private setState(powerOn: CharacteristicValue, callback: CharacteristicSetCallback) {
        const roomba = this.getRoomba();

        this.cache.del(STATUS);

        if (powerOn) {
            this.log("Starting Roomba");

            this.onConnected(roomba, async() => {
                try {
                    this.log("Roomba is running");

                    await roomba.clean();

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
        if (!this.keepAliveEnabled) {
            roomba.end();
        }
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

    private getRunningStatus(callback: CharacteristicGetCallback) {
        this.log.debug("Running status requested");

        this.getStatus((error, status) => {
            this.log.debug(`Received status: ${JSON.stringify(status)} -- error: ${JSON.stringify(error)}`);
            if (error) {
                callback(error);
            } else {
                callback(null, status!.running);
            }
        });
    }

    private getIsCharging(callback: CharacteristicGetCallback) {
        this.log.debug("Charging status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status!.charging);
            }
        });
    }

    private getDockedState(callback: CharacteristicGetCallback) {
        this.log.debug("Docked status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status!.charging === this.api.hap.Characteristic.ChargingState.CHARGING);
            }
        });
    }

    private getBatteryLevel(callback: CharacteristicGetCallback) {
        this.log.debug("Battery level requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status!.batteryLevel);
            }
        });
    }

    private getFilterStatus(callback: CharacteristicGetCallback) {
        this.log.debug("Bin status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status!.binStatus);
            }
        });
    }

    private getLowBatteryStatus(callback: CharacteristicGetCallback) {
        this.log.debug("Battery status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status!.batteryStatus);
            }
        });
    }

    private getStatus(callback: NodeCallback<Status>, silent = false) {
        let status: CachedStatus | undefined = this.cache.get<CachedStatus>(STATUS);

        // cache hit, shortcircuit
        if (status) {
            return callback(status.error, status.error ? undefined : status);
        }

        // no cache hit, query status from roomba if autorefresh isn't enabled
        // if autorefresh is enabled, this step isn't needed because it'll get handled automatically in this.enableAutoRefresh()
        if (!this.autoRefreshEnabled) {
            return this.getStatusFromRoomba(callback, silent);
        }

        if (this.cache.get(OLD_STATUS)) {
            this.log.warn("Using expired status");

            status = this.cache.get<CachedStatus>(OLD_STATUS);
            if (status) {
                return callback(status.error, status.error ? undefined : status);
            }
        }

        // roomba is dead
        return callback(new Error("Failed getting status"));
    }

    private getStatusFromRoomba(callback: NodeCallback<Status>, silent = false) {
        const roomba = this.getRoomba();

        this.onConnected(roomba, async() => {
            try {
                const response = await timeout(roomba.getRobotState(["cleanMissionStatus", "batPct", "bin"]), 5000);
                const status = this.parseState(response);

                if (this.autoRefreshEnabled) {
                    this.cache.set(STATUS, status);
                }

                callback(null, status);

                if (!silent) {
                    this.log("Roomba[%s]", JSON.stringify(status));
                } else {
                    this.log.debug("Roomba[%s]", JSON.stringify(status));
                }
            } catch (error) {
                if (!silent) {
                    this.log("Unable to determine state of Roomba");
                } else {
                    this.log.debug("Unable to determine state of Roomba");
                }

                this.log.debug((error as Error).message);

                callback(error as Error);

                this.cache.set<CachedStatus>(STATUS, { error: error as Error });
            } finally {
                this.endRoombaIfNeeded(roomba);
            }
        }, silent);
    }

    private parseState(state: RobotState) {
        const status: Status = {
            error: null,
            running: 0,
            charging: 0,
            batteryLevel: "N/A",
            batteryStatus: "N/A",
            binFull: false,
            binStatus: 0,
        };

        status.batteryLevel = state.batPct!;
        status.binFull = state.bin!.full;

        const Characteristic = this.api.hap.Characteristic;

        if (status.binFull) {
            status.binStatus = Characteristic.FilterChangeIndication.CHANGE_FILTER;
        } else {
            status.binStatus = Characteristic.FilterChangeIndication.FILTER_OK;
        }

        if (status.batteryLevel <= 20) {
            status.batteryStatus = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
        } else {
            status.batteryStatus = Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
        }

        switch (state.cleanMissionStatus!.phase) {
            case "run":
                status.running = 1;
                status.charging = Characteristic.ChargingState.NOT_CHARGING;

                break;
            case "charge":
                status.running = 0;
                status.charging = Characteristic.ChargingState.CHARGING;

                break;
            default:
                status.running = 0;
                status.charging = Characteristic.ChargingState.NOT_CHARGING;

                break;
        }
        return status;
    }

    private registerStateUpdate() {
        this.log("Enabling keepAlive");

        const roomba = this.getRoomba();

        roomba.on("state", state => {
            const status = this.parseState(state);

            if (this.autoRefreshEnabled) {
                this.cache.set(STATUS, status);
            }

            this.updateCharacteristics(status);
        });
    }

    private updateCharacteristics(status: Status) {
        const Characteristic = this.api.hap.Characteristic;

        this.switchService
            .getCharacteristic(Characteristic.On)
            .updateValue(status.running);
        this.batteryService
            .getCharacteristic(Characteristic.ChargingState)
            .updateValue(status.charging);
        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .updateValue(status.batteryLevel);
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .updateValue(status.batteryStatus);
        this.filterMaintenance
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .updateValue(status.binStatus);
        if (this.showDockAsContactSensor) {
            this.dockService!
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(!status.charging);
        }
        if (this.showRunningAsContactSensor) {
            this.runningService!
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(status.running);
        }
        if (this.showBinStatusAsContactSensor) {
            this.binService!
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(status.binStatus);
        }
    }

    /**
     * Enables automatic refresh
     * This works by listening on the cache 'expired' event - when the cache expires (set by user TTL),
     * the event triggers and automatically pulls fresh state from the robot
     */
    private enableAutoRefresh() {
        this.log("Enabling autoRefresh every %s seconds", this.cache.options.stdTTL);

        this.cache.on("expired", (key, value) => {
            this.log.debug(key + " expired");

            this.cache.set<CachedStatus>(OLD_STATUS, value, 0);

            this.getStatusFromRoomba((error, status) => {
                if (!error) this.updateCharacteristics(status!);
            }, true);
        });

        this.getStatusFromRoomba((error, status) => {
            if (!error) this.updateCharacteristics(status!);
        }, true);
    }
}
