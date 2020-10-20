<span align="center">



# Homebridge-Roomba2

<a href="https://www.npmjs.com/package/homebridge-roomba2"><img title="npm version" src="https://badgen.net/npm/v/homebridge-roomba2" ></a>
<a href="https://www.npmjs.com/package/homebridge-roomba2"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge-roomba2" ></a>


</span>

### Automatic Installation
1) Install Homebridge:   ```sudo npm i -g homebridge --unsafe-perm```
2) Download this plugin: ```sudo npm i -g homebridge-roomba2```
3) Follow Setup, to get Roomba credentials 
4) Setup using [Config-Ui-X](https://github.com/oznu/homebridge-config-ui-x)
5) Restart Homebridge


### Manual Installation 
1) Install Homebridge:   ```sudo npm i -g homebridge --unsafe-perm```
2) Download this plugin: ```sudo npm i -g homebridge-roomba2``` 
3) Follow Setup, to get Roomba credentials 
4) Enter Roomba credentials to your config.json file.
5) Restart Homebridge


### Setup
1) CD into where your plugins are installed. On a Pi it is: ```/usr/local/lib/node_modules/homebridge-roomba2```
2) Type ```sudo npm run getrobotpwd 192.168.x.xxx```
3) Follow the instructions
4) Use these credentials to fill into Homebridge. 
5) Config template:
```
"accessories": [
  {
    "accessory": "Roomba",
    "name": "Roomba",
    "model": "960",
    "blid": "1234567890",
    "robotpwd": "aPassword",
    "ipaddress": "192.168.x.xxx",
    "autoRefreshEnabled": true,
    "keepAliveEnabled": true, 
    "cacheTTL": 30 //in seconds
  }
]
```


### Features

- Roomba start on demand
- Roomba stop and dock on demand
- Roomba charging status 
- Roomba battery level (with low battery warning)
- Roomba docked notifcation 
- Roomba running notification


### Credits:
STVMallen  - [Original plugin](https://github.com/stvmallen/homebridge-roomba-stv) 
ncovercash - [Dock status](https://github.com/stvmallen/homebridge-roomba-stv/pull/63)
