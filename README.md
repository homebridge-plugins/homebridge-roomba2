<span align="center">



# Homebridge-Roomba2

<a href="https://www.npmjs.com/package/homebridge-roomba2"><img title="npm version" src="https://badgen.net/npm/v/homebridge-roomba2" ></a>
<a href="https://www.npmjs.com/package/homebridge-roomba2"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge-roomba2" ></a>
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)


</span>

### Features

- Roomba start on demand
- Roomba stop and dock on demand
- Roomba charging status 
- Roomba battery level (with low battery warning)
- Roomba docked notifcation 
- Roomba running notification
- Roomba bin full notification


<span align="center">



# Installation
</span>


### Automatic Installation
1) Install Homebridge:   ```sudo npm i -g homebridge --unsafe-perm```
2) Download this plugin: ```sudo npm i -g homebridge-roomba2```
3) Follow [Setup](https://github.com/iRayanKhan/homebridge-roomba2#setup), to get Roomba credentials 
4) Continue setup using [Config-Ui-X](https://github.com/oznu/homebridge-config-ui-x)
5) Restart Homebridge


### Manual Installation 
1) Install Homebridge:   ```sudo npm i -g homebridge --unsafe-perm```
2) Download this plugin: ```sudo npm i -g homebridge-roomba2``` 
3) Follow [Setup](https://github.com/iRayanKhan/homebridge-roomba2#setup), to get Roomba credentials 
4) Enter Roomba credentials to your config.json file.
5) Restart Homebridge


### Setup
1) CD into where your plugins are installed. You can find this by typing ```npm root -g```
2) Type ```sudo npm run getrobotpwd 192.168.x.xxx``` (find your iRobot's IP address and enter it at the end of this command replacing 192.168.x.xxx with your actual IP)
3) Follow the instructions on screen
4) Use the credentials from above, to fill into Homebridge. (Config template below):
```
"accessories": [
  {
    "accessory": "Roomba2",
    "name": "Roomba",
    "model": "960",
    "blid": "1234567890",
    "robotpwd": "aPassword",
    "ipaddress": "192.168.x.xxx",
    "autoRefreshEnabled": true,
    "keepAliveEnabled": true, 
    "dockContactSensor": true,
    "runningContactSensor": true,
    "cacheTTL": 30 //in seconds
  }
]
```
Refresh mode

This plugins supports these refresh modes:

NONE (autoRefreshEnabled and keepAlive both set to false) - no auto refresh, we will connect to roomba and poll status when requested by home app. Please note that this will cause "Updating" status for all homebridge accessories.

AUTO REFRESH (autoRefreshEnabled set to true) - we will connect to roomba, every pollingInterval seconds, and store the status in cache. if pollingInterval = cacheTTL - 10 (or more), this will make sure we will always have a valid status.

KEEP ALIVE (keepAlive set to true) - we will keep a connection to roomba, this will cause app to fail to connect to roomba in local network mode (cloud mode will work just fine, even in your home wifi). This will lead to better performance (status will refresh faster, and toggle will work faster as well). Keep in mind this will increase the Roomba battery consumption.

Source: https://github.com/stvmallen/homebridge-roomba-stv#refresh-mode


### Credits:
STVMallen  - [Original plugin](https://github.com/stvmallen/homebridge-roomba-stv) 

ncovercash - [Dock status](https://github.com/stvmallen/homebridge-roomba-stv/pull/63)
