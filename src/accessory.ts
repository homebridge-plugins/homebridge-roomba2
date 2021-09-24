import dorita980, { RobotState, Roomba } from "dorita980";
import { AccessoryConfig, AccessoryPlugin, API, Logging, Service, Characteristic, CharacteristicValue, CharacteristicGetCallback, CharacteristicSetCallback } from "homebridge";

/**
 * How long to wait to connect to Roomba.
 */
const CONNECT_TIMEOUT = 60_000;

/**
 * When actively watching Roomba's status, how often to query Roomba and update HomeKit.
 */
const WATCH_INTERVAL_MILLIS = 30_000;

/**
 * After starting to actively watch Roomba's status, how long should we watch for after
 * the last status enquiry from HomeKit? This lets us stop checking on Roomba when no
 * one is interested.
 */
const WATCH_IDLE_TIMEOUT_MILLIS = 600_000;

/**
 * How old a cached status can be before we ignore it.
 */
const MAX_CACHED_STATUS_AGE_MILLIS = 60_000;

/**
 * How long will we wait for the Roomba to send status before giving up?
 */
const MAX_WAIT_FOR_STATUS_MILLIS = 60_000;

/**
 * Coalesce refreshState requests into one when they're less than this many millis apart.
 */
const REFRESH_STATE_COALESCE_MILLIS = 10_000;

/**
 * Whether to output debug logging at info level. Useful during debugging to be able to
 * see debug logs from this plugin.
 */
const DEBUG = true;

interface Status {
    timestamp: number
    error?: Error
    running?: boolean
    docking?: boolean
    charging?: boolean
    batteryLevel?: number
    binFull?: boolean
}

const EMPTY_STATUS: Status = {
    timestamp: 0,
};

type CharacteristicGetter = (callback: CharacteristicGetCallback, context: unknown, connection?: unknown) => void

type CharacteristicValueExtractor = (status: Status) => CharacteristicValue | undefined

const NO_VALUE = new Error("No value");

async function delay(duration: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, duration);
    });
}

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
    private dockOnStop: boolean


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
    private cachedStatus = EMPTY_STATUS;

    private lastUpdatedStatus = EMPTY_STATUS;

    private lastRefreshState = 0;

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
        this.dockOnStop = config.dockOnStop !== undefined ? config.dockOnStop : true;

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

    private refreshState() {
        const now = Date.now();
        if (now - this.lastRefreshState < REFRESH_STATE_COALESCE_MILLIS) {
            return false;
        }
        this.lastRefreshState = now;
        
        this.connect(async(error, roomba) => {
            if (error || !roomba) {
                this.log("Failed to connect to Roomba to refresh state: %s", error ? error.message : "Unknown");
                return;
            }
            
            const startedWaitingForStatus = Date.now();

            /* Wait until we've received a state with all of the information we desire */
            return new Promise((resolve) => {
                let receivedState: RobotState | undefined = undefined;

                const timeout = setTimeout(() => {
                    this.log.debug(
                        "Timeout waiting for full state from Roomba ({}ms). Last state received was: %s",
                        Date.now() - startedWaitingForStatus,
                        receivedState ? JSON.stringify(receivedState) : "<none>",
                    );
                    resolve();
                }, MAX_WAIT_FOR_STATUS_MILLIS);

                const updateState = (state: RobotState) => {
                    receivedState = state;

                    if (this.receivedRobotStateIsComplete(state)) {
                        clearTimeout(timeout);
                        
                        /* NB: the actual state is received and updated in the listener in connect() */
                        this.log.debug(
                            "Refreshed Roomba's state in %ims: %s",
                            Date.now() - now,
                            JSON.stringify(state)
                        );

                        roomba.off("state", updateState);
                        resolve();
                    }
                };
                roomba.on("state", updateState);
                roomba.on("close", () => resolve());
                roomba.on("error", () => resolve());
            });
        });
        return true;
    }

    private receivedRobotStateIsComplete(state: RobotState) {
        return (state.batPct != undefined && state.bin !== undefined && state.cleanMissionStatus !== undefined);
    }

    private receiveRobotState(state: RobotState) {
        const parsed = this.parseState(state);
        this.mergeCachedStatus(parsed);
        return true;
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

            roomba.on("close", () => {
                if (roomba == this._currentlyConnectedRoomba) {
                    this.log.debug("Connection close received");
                    this._currentlyConnectedRoomba = undefined;
                } else {
                    this.log.debug("Connection close received from old connection");
                }
            });
            roomba.on("error", (error) => {
                if (roomba == this._currentlyConnectedRoomba) {
                    this.log.debug("Connection received error: %s", error.message);
                    this._currentlyConnectedRoomba = undefined;
                } else {
                    this.log.debug("Old connection received error: %s", error.message);
                }
            });
            roomba.on("state", (state) => {
                this.receiveRobotState(state);
            });
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

        const startConnecting = Date.now();

        const timeout = setTimeout(async() => {
            timedOut = true;

            this.log.warn("Timed out after %ims trying to connect to Roomba", Date.now() - startConnecting);

            await stopUsingRoomba(roomba, true);
            await callback(new Error("Connect timed out"));
        }, CONNECT_TIMEOUT);
    
        this.log.debug("Connecting to Roomba (%i others waiting)...", this._currentlyConnectedRoombaRequests - 1);

        roomba.on("connect", async() => {
            if (timedOut) {
                this.log.debug("Connection established to Roomba after timeout");
                return;
            }

            clearTimeout(timeout);

            this.log.debug("Connected to Roomba in %ims", Date.now() - startConnecting);
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
            this.log("Stopping Roomba");

            this.connect(async(error, roomba) => {
                if (error || !roomba) {
                    callback(error || new Error("Unknown error"));
                    return;
                }

                try {
                    const response = await roomba.getRobotState(["cleanMissionStatus"]);
                    const state = this.parseState(response);

                    if (state.running) {
                        this.log("Roomba is pausing");

                        await roomba.pause();

                        callback();
                        
                        this.mergeCachedStatus({
                            running: false,
                            charging: false,
                            docking: false,
                        });

                        if (this.dockOnStop) {
                            this.log("Roomba paused, returning to Dock");
                            await this.dockWhenStopped(roomba, 3000);
                        } else {
                            this.log("Roomba is paused");
                        }
                    } else if (state.docking) {
                        this.log("Roomba is docking");
                        await roomba.pause();

                        callback();

                        this.mergeCachedStatus({
                            running: false,
                            charging: false,
                            docking: false,
                        });

                        this.log("Roomba paused");
                    } else if (state.charging) {
                        this.log("Roomba is already docked");
                        callback();
                    } else {
                        this.log("Roomba is not running");
                        callback();
                    }

                    this.startWatching();
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

                    await delay(pollingInterval);

                    this.log.debug("Trying to dock again...");
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
    private createCharacteristicGetter(name: string, extractValue: CharacteristicValueExtractor): CharacteristicGetter {
        return (callback: CharacteristicGetCallback) => {
            const returnCachedStatus = (cachedStatus: Status) => {
                if (cachedStatus.error) {
                    this.log("%s: Returning error %s (%ims old)", name, cachedStatus.error.message, Date.now() - cachedStatus.timestamp);
                    callback(cachedStatus.error);
                } else {
                    const value = extractValue(cachedStatus);
                    if (value === undefined) {
                        this.log("%s: Returning no value (%ims old)", name, Date.now() - cachedStatus.timestamp!);
                        callback(NO_VALUE);
                    } else {
                        this.log("%s: Returning %s (%ims old)", name, String(value), Date.now() - cachedStatus.timestamp!);
                        callback(null, value);
                    }
                }
            };

            this.refreshState();
            this.startWatching();

            if (Date.now() - this.cachedStatus.timestamp < MAX_CACHED_STATUS_AGE_MILLIS) {
                returnCachedStatus(this.cachedStatus);
            } else {
                /* Wait a short period of time (not too long for Homebridge) for a value */
                setTimeout(() => {
                    if (Date.now() - this.cachedStatus.timestamp < MAX_CACHED_STATUS_AGE_MILLIS) {
                        returnCachedStatus(this.cachedStatus);
                    } else {
                        this.log("%s: Returning no value due to timeout", name);
                        callback(NO_VALUE);
                    }
                }, 500);
            }
        };
    }

    /**
     * Merge in changes to the cached status, and update our characteristics so the plugin
     * preemptively reports state back to Homebridge.
     */
    private mergeCachedStatus(status: Partial<Status>) {
        if (this.cachedStatus && !this.cachedStatus.error) {
            this.setCachedStatus({
                ...this.cachedStatus,
                timestamp: Date.now(),
                ...status,
            });
        }
    }

    /**
     * Update the cached status and update our characteristics so the plugin preemptively
     * reports state back to Homebridge.
     */
    private setCachedStatus(status: Status) {
        this.cachedStatus = status;
        if (!status.error) {
            this.updateCharacteristics(status);
        }
    }

    private parseState(state: RobotState) {
        const status: Status = {
            ...EMPTY_STATUS,
            timestamp: Date.now(),
        };

        if (state.batPct !== undefined) {
            status.batteryLevel = state.batPct;
        }
        if (state.bin !== undefined) {
            status.binFull = state.bin.full;
        }

        if (state.cleanMissionStatus !== undefined) {
            /* See https://www.openhab.org/addons/bindings/irobot/ for a list of phases */
            switch (state.cleanMissionStatus.phase) {
                case "run":
                    status.running = true;
                    status.charging = false;
                    status.docking = false;

                    break;
                case "charge":
                case "recharge":
                    status.running = false;
                    status.charging = true;
                    status.docking = false;

                    break;
                case "hmUsrDock":
                case "hmMidMsn":
                case "hmPostMsn":
                    status.running = false;
                    status.charging = false;
                    status.docking = true;
                    
                    break;
                case "stop":
                case "stuck":
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
        }

        return status;
    }

    private updateCharacteristics(status: Status) {
        // this.log.debug("Updating characteristics for status: %s", JSON.stringify(status));

        const updateCharacteristic = (service: Service, characteristicId: typeof Characteristic.On, extractValue: CharacteristicValueExtractor) => {
            const value = extractValue(status);
            if (value !== undefined) {
                const previousValue = extractValue(this.lastUpdatedStatus);
                if (value !== previousValue) {
                    const characteristic = service.getCharacteristic(characteristicId);
                    this.log.debug(
                        "Updating %s %s from %s to %s",
                        service.displayName,
                        characteristic.displayName,
                        String(previousValue),
                        String(value),
                    );
                    characteristic.updateValue(value);
                }
            }
        };

        const Characteristic = this.api.hap.Characteristic;

        updateCharacteristic(this.switchService, Characteristic.On, this.runningStatus);
        updateCharacteristic(this.batteryService, Characteristic.ChargingState, this.chargingStatus);
        updateCharacteristic(this.batteryService, Characteristic.BatteryLevel, this.batteryLevelStatus);
        updateCharacteristic(this.batteryService, Characteristic.StatusLowBattery, this.batteryStatus);
        updateCharacteristic(this.filterMaintenance, Characteristic.FilterChangeIndication, this.binStatus);
        if (this.dockService) {
            updateCharacteristic(this.dockService, Characteristic.ContactSensorState, this.dockedStatus);
        }
        if (this.runningService) {
            updateCharacteristic(this.runningService, Characteristic.ContactSensorState, this.runningStatus);
        }
        if (this.binService) {
            updateCharacteristic(this.binService, Characteristic.ContactSensorState, this.binStatus);
        }
        if (this.dockingService) {
            updateCharacteristic(this.dockingService, Characteristic.ContactSensorState, this.dockingStatus);
        }

        this.lastUpdatedStatus = {
            ...this.lastUpdatedStatus,
            ...status,
        };
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

        const checkStatus = () => {
            const timeSinceLastWatchingRequest = Date.now() - (this.lastWatchingRequestTimestamp || 0);
            if (timeSinceLastWatchingRequest > WATCH_IDLE_TIMEOUT_MILLIS) {
                this.log.debug("Stopped watching Roomba due to idle timeout");
                this.stopWatching();
                return;
            }
            
            this.log.debug(
                "Refreshing Roomba's status (repeating in %is, idle timeout in %is)",
                WATCH_INTERVAL_MILLIS / 1000, 
                (WATCH_IDLE_TIMEOUT_MILLIS - timeSinceLastWatchingRequest) / 1000
            );

            this.refreshState();
            this.watching = setTimeout(checkStatus, WATCH_INTERVAL_MILLIS);
        };
        
        this.watching = setTimeout(checkStatus, WATCH_INTERVAL_MILLIS);
    }

    private stopWatching() {
        if (this.watching !== undefined) {
            clearTimeout(this.watching);
            this.watching = undefined;
        }
    }

    private runningStatus = (status: Status) => status.running === undefined
        ? undefined
        : status.running
            ? this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED;
    private chargingStatus = (status: Status) => status.charging === undefined
        ? undefined
        : status.charging
            ? this.api.hap.Characteristic.ChargingState.CHARGING
            : this.api.hap.Characteristic.ChargingState.NOT_CHARGING;
    private dockingStatus = (status: Status) => status.docking === undefined
        ? undefined
        : status.docking
            ? this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED;
    private dockedStatus = (status: Status) => status.charging === undefined
        ? undefined
        : status.charging
            ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
            : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    private batteryLevelStatus = (status: Status) => status.batteryLevel === undefined
        ? undefined
        : status.batteryLevel;
    private binStatus = (status: Status) => status.binFull === undefined
        ? undefined
        : status.binFull
            ? this.api.hap.Characteristic.FilterChangeIndication.CHANGE_FILTER
            : this.api.hap.Characteristic.FilterChangeIndication.FILTER_OK;
    private batteryStatus = (status: Status) => status.batteryLevel === undefined
        ? undefined
        : status.batteryLevel <= 20
            ? this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            : this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;

}
