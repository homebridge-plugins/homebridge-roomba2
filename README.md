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
1) Navigate to the Homebridge Terminal (`•••` in the top right > `Terminal`)
1) Change directories to the `homebridge-roomba2` package is installed by running: `` cd `npm root -g` ``
1) Type ```sudo npm run getrobotpwd 192.168.x.xxx```
1) Follow the instructions on screen
1) Use the output from the command (example below) to configure the plugin using the Homebridge UI for `homebridge-roomba2`
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




### Credits:
STVMallen  - [Original plugin](https://github.com/stvmallen/homebridge-roomba-stv) 

ncovercash - [Dock status](https://github.com/stvmallen/homebridge-roomba-stv/pull/63)
