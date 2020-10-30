let Service;
let Characteristic;

const dorita980 = require("dorita980");
const nodeCache = require("node-cache");
const timeout = require('promise-timeout').timeout;
const STATUS = "status";
const OLD_STATUS = 'oldStatus';

const roombaAccessory = function (log, config) {
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
    this.showDockAsContactSensor = config.dockContactSensor == undefined ? true : config.dockContactSensor;
    this.showRunningAsContactSensor = config.runningContactSensor;
    this.showBinStatusAsContactSensor = config.binContactSensor;
    this.cacheTTL = config.cacheTTL || 5;
    this.disableWait = config.disableWait;
    this.roomba = null;

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
        this.binService = new Service.ContactSensor(this.name + " BinFull", "Full"); 
    }
    this.cache = new nodeCache({
        stdTTL: this.cacheTTL,
        checkperiod: 1,
        useClones: false
    });

    if (this.keepAliveEnabled) {
        this.registerStateUpdate();
    } else if (this.autoRefreshEnabled) {
        this.enableAutoRefresh();
    }
};

roombaAccessory.prototype = {
    getRoomba() {
        if (this.keepAliveEnabled) {
            if (this.roomba == null) {
                this.roomba = new dorita980.Local(this.blid, this.robotpwd, this.ipaddress);
            }
            return this.roomba;
        } else {
            return new dorita980.Local(this.blid, this.robotpwd, this.ipaddress);
        }
    },

    onConnected(roomba, callback, silent) {
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
    },

    setState(powerOn, callback) {
        let roomba = this.getRoomba();

        this.cache.del(STATUS);

        if (powerOn) {
            this.log("Starting Roomba");

            this.onConnected(roomba, async () => {
                try {
                    this.log("Roomba is running");

                    await roomba.clean();

                    callback();
                } catch (error) {
                    this.log("Roomba failed: %s", error.message);

                    callback(error);
                } finally {
                    await setTimeout(() => this.log.debug('Trying to dock again...'), 2000);

                    this.endRoombaIfNeeded(roomba);
                }
            });
        } else {
            this.log("Roomba pause and dock");

            this.onConnected(roomba, async () => {
                try {
                    this.log("Roomba is pausing");

                    await roomba.pause();

                    callback();

                    this.log("Roomba paused, returning to Dock");

                    this.dockWhenStopped(roomba, 3000);
                } catch (error) {
                    this.log("Roomba failed: %s", error.message);

                    this.endRoombaIfNeeded(roomba);

                    callback(error);
                }
            });
        }
    },

    endRoombaIfNeeded(roomba) {
        if (!this.keepAliveEnabled) {
            roomba.end();
        }
    },

    async dockWhenStopped(roomba, pollingInterval) {
        try {
            const state = await roomba.getRobotState(["cleanMissionStatus"]);

            switch (state.cleanMissionStatus.phase) {
                case "stop":
                    this.log("Roomba has stopped, issuing dock request");

                    await roomba.dock();
                    this.endRoombaIfNeeded(roomba);

                    this.log("Roomba docking");

                    break;
                case "run":
                    this.log("Roomba is still running. Will check again in 3 seconds");

                    await setTimeout(() => this.log.debug('Trying to dock again...'), pollingInterval);
                    this.dockWhenStopped(roomba, pollingInterval);

                    break;
                default:
                    this.endRoombaIfNeeded(roomba);

                    this.log("Roomba is not running");

                    break;
            }
        } catch (error) {
            this.log(error);
            this.endRoombaIfNeeded(roomba);
        }
    },

    getRunningStatus(callback) {
        this.log("Running status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.running);
            }
        });
    },

    getIsCharging(callback) {
        this.log("Charging status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.charging);
            }
        });
    },

    getDockedState(callback) {
        this.log("Docked status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, !status.charging);
            }
        });
    },

    getBatteryLevel(callback) {
        this.log("Battery level requested");

        

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.batteryLevel);
            }
        });
    },
    getFilterStatus(callback) {
        this.log("Bin status requested");

         this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.binStatus);
            }
        });
    },

    getLowBatteryStatus(callback) {
        this.log("Battery status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.batteryStatus);
            }
        });
    },

    

    identify(callback) {
        this.log("Identify requested. Not supported yet.");

        callback();
    },

    getStatus(callback, silent) {
        let status = this.cache.get(STATUS);

        if (status) {
            callback(status.error, status);
        } else if (!this.autoRefreshEnabled) {
            this.getStatusFromRoomba(callback, silent);
        } else {
            if (!this.disableWait) {
                setTimeout(() => this.getStatus(callback, silent), 10);
            } else if (this.cache.get(OLD_STATUS)) {
                this.log.warn('Using expired status');

                status = this.cache.get(OLD_STATUS);
                callback(status.error, status);
            } else {
                callback('Failed getting status');
            }
        }
    },

    getStatusFromRoomba(callback, silent) {
        let roomba = this.getRoomba();

        this.onConnected(roomba, async () => {
            try {
                let response = await timeout(roomba.getRobotState(["cleanMissionStatus", "batPct", "bin"]), 5000);
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

                this.log.debug(error);

                callback(error);

                this.cache.set(STATUS, {error: error});
            } finally {
                this.endRoombaIfNeeded(roomba);
            }
        }, silent);
    },

    parseState(state) {
        let status = {
            running: 0,
            charging: 0,
            batteryLevel: "N/A",
            batteryStatus: "N/A",
            binFull: false
        };

        status.batteryLevel = state.batPct;
        status.binFull = state.bin.full;

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

        switch (state.cleanMissionStatus.phase) {
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
    },

    getServices() {
        const services = [];

        this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "iRayanKhan");
        this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, this.serialnum);
        this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
        this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);
        this.accessoryInfo.setCharacteristic(Characteristic.Model, this.model);
        this.accessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, "1.1.0");
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

        if (this.showDockAsContactSensor) {
            this.dockService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.getDockedState.bind(this));
            services.push(this.dockService);
        }
        if (this.showRunningAsContactSensor) {
            this.runningService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on("get", this.getRunningStatus.bind(this));
            services.push(this.runningService);
        }
        if (this.showBinStatusAsContactSensor) {
            this.binService
            .getCharacteristic(Characteristic.ContactSensorState)
            .on("get", this.getFilterStatus.bind(this)) ;
            services.push(this.binService);
        }

        return services;
    },

    registerStateUpdate() {
        this.log("Enabling keepAlive");

        const roomba = this.getRoomba();

        roomba.on("state", state => {
            const status = this.parseState(state);

            if (this.autoRefreshEnabled) {
                this.cache.set(STATUS, status);
            }

            this.updateCharacteristics(status);
        });
    },

    updateCharacteristics(status) {
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
            this.dockService
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(!status.charging);
        }
        if (this.showRunningAsContactSensor) {
            this.runningService
                .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(status.running);
        }
        if (this.showBinStatusAsContactSensor) {
            this.binService
            .getCharacteristic(Characteristic.ContactSensorState)
                .updateValue(status.binStatus);
        }
    },

    enableAutoRefresh() {
        this.log("Enabling autoRefresh every %s seconds", this.cache.options.stdTTL);

        let that = this;
        this.cache.on('expired', (key, value) => {
            that.log.debug(key + " expired");

            that.cache.set(OLD_STATUS, value, 0);

            that.getStatusFromRoomba((error, status) => {
                if (!error) that.updateCharacteristics(status);
            }, true);
        });

        this.getStatusFromRoomba((error, status) => {
            if (!error) that.updateCharacteristics(status);
        }, true);
    }
};

module.exports = homebridge => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-roomba2", "Roomba2", roombaAccessory);
};
