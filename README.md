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

The homebridge-roomba2 plugin polls Roomba for its status when requested by HomeKit, so when you first open
the Home app you may see an old status, or no status, until Roomba has had time to respond (which may take
a few seconds).

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
  "dockContactSensor": true,
  "runningContactSensor": true,
  "binContactSensor": true
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
|`dockContactSensor`|Add a contact sensor to HomeKit that's _closed_ when Roomba is docked|
|`runningContactSensor`|Add a contact sensor to HomeKit that's _open_ when Roomba is running|
|`binContactSensor`|Add a contact sensor to HomeKit that's _open_ when Roomba's bin is full|
|`dockingContactSensor`|Add a contact sensor to HomeKit that's _open_ when Roomba is docking|

### Deprecated configuration

The homebridge-roomba2 plugin used to support keep-alive and auto refresh modes for obtaining Roomba's status.
Both of these modes required more resources from Homebridge and Roomba than were necessary.

Now the plugin efficiently queries Roomba's status on demand so as not to slow down Homebridge and so
as to provide HomeKit with Roomba's status only when it requests it.

## Building

The homebridge-roomba2 plugin uses [TypeScript](https://www.typescriptlang.org), [`pnpm`](https://pnpm.io) and
[`nvm`](https://github.com/nvm-sh/nvm).

`nvm` is used to control the version of node used. You can skip the `nvm` step if you manage your own
node versions.

Use `nvm` to select the required node version:

```shell
nvm use
```

or, if you don't have the required node version installed:

```shell
nvm install
```

Install `pnpm`, if you haven't already:

```shell
npm -g install pnpm
```

Prepare the project:

```shell
pnpm install
```

Build the project:

```shell
pnpm build
```

or

```shell
pnpm watch
```

## Contributing

The homebridge-roomba2 plugin uses [Changesets](https://github.com/atlassian/changesets) to maintain the [CHANGELOG.md](./CHANGELOG.md) and to bump the package's version number according to [semer](https://semver.org).

If you are preparing a PR, please consider using Changesets to include a summary of your change for the [CHANGELOG.md](./CHANGELOG.md), following the example of existing changelog entries (but feel free to provide more detail).

To create a new changeset:

```shell
pnpm changeset
```

That will prompt you to indicate whether your change is a patch (a bug fix) or a minor or major change. If you are adding a feature it is a minor change, not a patch.

Changesets will create a new file in the `.changeset` directory that you can commit as part of your PR.

## Credits

STVMallen  - [Original plugin](https://github.com/stvmallen/homebridge-roomba-stv) 

ncovercash - [Dock status](https://github.com/stvmallen/homebridge-roomba-stv/pull/63)
