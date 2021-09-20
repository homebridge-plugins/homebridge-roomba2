<span align="center">



# Homebridge-Roomba2

<a href="https://www.npmjs.com/package/homebridge-roomba2"><img title="npm version" src="https://badgen.net/npm/v/homebridge-roomba2" ></a>
<a href="https://www.npmjs.com/package/homebridge-roomba2"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge-roomba2" ></a>
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)


</span>

## Features

- Roomba start on demand
- Roomba stop and dock on demand
- Roomba charging status 
- Roomba battery level (with low battery warning)
- Roomba docked notifcation 
- Roomba running notification
- Roomba bin full notification

## Installation

### Automatic Installation

1) Install Homebridge:   ```sudo npm i -g homebridge --unsafe-perm```
2) Download this plugin: ```sudo npm i -g homebridge-roomba2```
3) Follow [Setup](#setup) to get Roomba credentials 
4) Add an Accessory for your Roomba and configure it using [Config-Ui-X](https://github.com/oznu/homebridge-config-ui-x)
5) Restart Homebridge

### Manual Installation

1) Install Homebridge:   ```sudo npm i -g homebridge --unsafe-perm```
2) Download this plugin: ```sudo npm i -g homebridge-roomba2``` 
3) Follow [Setup](#setup) to get Roomba credentials 
4) Enter Roomba's credentials in your `config.json` file.
5) Restart Homebridge

## Setup

1) `cd` into where the plugin is installed: ```cd $(npm root -g)/homebridge-roomba2```
2) Type ```sudo npm run getrobotpwd 192.168.x.xxx``` (find your Roomba's IP address and enter it at the end of this command replacing 192.168.x.xxx with the actual IP)
3) Follow the instructions on screen to obtain your Roomba's `blid` and password.

## Configuration

This plugin supports GUI-based configuration using [Config-Ui-X](https://github.com/oznu/homebridge-config-ui-x). You can also
configure your accessory using JSON:

```json
{
  "accessory": "Roomba2",
  "name": "Roomba",
  "model": "960",
  "blid": "1234567890",
  "robotpwd": "aPassword",
  "ipaddress": "192.168.x.xxx",
  "autoRefreshEnabled": true,
  "keepAliveEnabled": false, 
  "dockContactSensor": true,
  "runningContactSensor": true,
  "binContactSensor": true,
  "cacheTTL": 30
}
```

|Key|Description|
|---|-----------|
|`accessory`|Loads this plugin. Must be set to `Roomba2`|
|`name`|The name of your Roomb as it should appear in Homebridge and HomeKit|
|`model`|The model of your Roomba as you'd like it to appear in HomeKit|
|`blid`|The `blid` of your Roomba, obtained during setup|
|`robotpwd`|The password for your Roomba, obtained during setup|
|`ipaddress`|The IP address of your Roomba on your network|
|`keepAliveEnabled`|See _Refresh modes_ below|
|`autoRefreshEnabled`|See _Refresh modes_ below|
|`dockContactSensor`|Add a contact sensor to HomeKit that's _closed_ when Roomba is docked|
|`runningContactSensor`|Add a contact sensor to HomeKit that's _closed_ when Roomba is running|
|`binContactSensor`|Add a contact sensor to HomeKit that's _open_ when Roomba's bin is full|
|`cacheTTL`|How long to cache Roomba's status (in seconds) before contacting Roomba again|

### Refresh modes

This plugins supports three modes for refreshing the state of your Roomba:

#### Keep alive

With `keepAlive` set to `true` the plugin will keep a connection to your Roomba, which will deliver more immediate status changes and commands. However, this will cause the Roomba app to fail to connect to your Roomba in local network mode (cloud mode will work fine) and it will increase Roomba's energy consumption.

#### Auto refresh

With `autoRefreshEnabled` set to `true` the plugin will connect to Roomba every `cacheTTL` seconds to check its status, and then cache the status so HomeKit always shows Roomba's status immediately.

#### None

With `autoRefreshEnabled` and `keepAlive` both set to `false` the plugin connects to Roomba when its status is requested by HomeKit. This will cause HomeKit to show an "Updating" status for your Roomba until its status is returned.

## Credits

STVMallen  - [Original plugin](https://github.com/stvmallen/homebridge-roomba-stv) 

ncovercash - [Dock status](https://github.com/stvmallen/homebridge-roomba-stv/pull/63)
