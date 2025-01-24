import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge'

import type { DeviceConfig, RoombaPlatformConfig } from './types.js'

import { readFileSync } from 'node:fs'

import RoombaAccessory from './accessory.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

export default class RoombaPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service
  public readonly Characteristic: typeof Characteristic

  private api: API
  private log: Logging
  private config: RoombaPlatformConfig
  private readonly accessories: Map<string, PlatformAccessory> = new Map()
  version: any

  public constructor(log: Logging, config: RoombaPlatformConfig, api: API) {
    this.Service = api.hap.Service
    this.Characteristic = api.hap.Characteristic

    this.api = api
    this.config = config
    const debug = !!config.debug

    this.log = !debug
      ? log
      : Object.assign(log, { debug: (message: string, ...parameters: unknown[]) => { log.info(`DEBUG: ${message}`, ...parameters) } })

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices()
    })
  }

  public configureAccessory(accessory: PlatformAccessory): void {
    this.log(`Configuring accessory: ${accessory.displayName}`)

    this.accessories.set(accessory.UUID, accessory)
  }

  private discoverDevices(): void {
    const devices: DeviceConfig[] = this.getDevicesFromConfig()
    const configuredAccessoryUUIDs = new Set<string>()

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.blid)

      const existingAccessory = this.accessories.get(uuid)
      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName)

        // TODO when should we update the device config

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
        existingAccessory.context.device = device
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RoombaAccessory(this, existingAccessory, this.log, device, this.config, this.api)

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.name)

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid)

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        new RoombaAccessory(this, accessory, this.log, device, this.config, this.api)

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
      }
      configuredAccessoryUUIDs.add(uuid)
    }

    // you can also deal with accessories from the cache which are no longer present by removing them from Homebridge
    // for example, if your plugin logs into a cloud account to retrieve a device list, and a user has previously removed a device
    // from this cloud account, then this device will no longer be present in the device list but will still be in the Homebridge cache
    const accessoriesToRemove: PlatformAccessory[] = []
    for (const [uuid, accessory] of this.accessories) {
      if (!configuredAccessoryUUIDs.has(uuid)) {
        accessoriesToRemove.push(accessory)
      }
    }

    if (accessoriesToRemove.length) {
      this.log.info('Removing existing accessories from cache:', accessoriesToRemove.map(a => a.displayName).join(', '))
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove)
    }
  }

  private getDevicesFromConfig(): DeviceConfig[] {
    return this.config.devices || []
  }

  /**
   * Asynchronously retrieves the version of the plugin from the package.json file.
   *
   * This method reads the package.json file located in the parent directory,
   * parses its content to extract the version, and logs the version using the debug logger.
   * The extracted version is then assigned to the `version` property of the class.
   *
   * @returns {Promise<void>} A promise that resolves when the version has been retrieved and logged.
   */
  async getVersion(): Promise<void> {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
    this.log.debug(`Plugin Version: ${version}`)
    this.version = version
  }
}
