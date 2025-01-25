import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, Service } from 'homebridge'

import type { Robot } from './roomba.js'
import type { DeviceConfig, RoombaPlatformConfig } from './settings.js'

import { readFileSync } from 'node:fs'

import RoombaAccessory from './accessory.js'
import { getRoombas } from './roomba.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

export default class RoombaPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service
  public readonly Characteristic: typeof Characteristic
  private api: API
  private log!: Logging
  private config: RoombaPlatformConfig
  private readonly accessories: Map<string, PlatformAccessory> = new Map()
  version!: string

  public constructor(log: Logging, config: RoombaPlatformConfig, api: API) {
    this.Service = api.hap.Service
    this.Characteristic = api.hap.Characteristic
    this.api = api
    this.config = config
    const debug = !!config.debug

    try {
      this.verifyConfig()
      log.debug('Configuration:', JSON.stringify(this.config, null, 2))
    } catch (e: any) {
      log.error('Error in configuration:', e.message ?? e)
      return
    }

    this.log = !debug
      ? log
      : Object.assign(log, { debug: (message: string, ...parameters: unknown[]) => { log.info(`DEBUG: ${message}`, ...parameters) } })

    this.version = this.getVersion()

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices()
    })
  }

  private verifyConfig() {
    if (this.config.disableDiscovery === undefined) {
      this.config.disableDiscovery = false
    }
  }

  public configureAccessory(accessory: PlatformAccessory): void {
    this.log(`Configuring accessory: ${accessory.displayName}`)
    this.accessories.set(accessory.UUID, accessory)
  }

  private async discoveryMethod(): Promise<DeviceConfig[]> {
    if (this.config.email && this.config.password) {
      const robots: Robot[] = await getRoombas(this.config.email, this.config.password, this.log, this.config)
      return robots.map((robot) => {
        const deviceConfig = this.config.devices?.find(device => device.blid === robot.blid) || {}
        return {
          ...robot,
          ...deviceConfig,
          cleanBehaviour: this.config.cleanBehaviour,
          stopBehaviour: this.config.stopBehaviour,
          idleWatchInterval: this.config.idleWatchInterval,
        } as any
      })
    } else if (this.config.devices) {
      return this.config.devices.map(device => ({
        ...device,
        cleanBehaviour: this.config.cleanBehaviour,
        stopBehaviour: this.config.stopBehaviour,
        idleWatchInterval: this.config.idleWatchInterval,
      }))
    } else {
      this.log.error('No configuration provided for devices.')
      return []
    }
  }

  private async discoverDevices(): Promise<void> {
    const devices: Robot[] = await this.discoveryMethod()
    const configuredAccessoryUUIDs = new Set<string>()

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.blid)
      const existingAccessory = this.accessories.get(uuid)

      if (existingAccessory) {
        this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName)
        existingAccessory.context.device = device
        new RoombaAccessory(this, existingAccessory, this.log, {
          ...device,
          cleanBehaviour: this.config.cleanBehaviour,
          stopBehaviour: this.config.stopBehaviour,
          idleWatchInterval: this.config.idleWatchInterval,
        } as any, this.config, this.api)
      } else {
        this.log.info('Adding new accessory:', device.name)
        const accessory = new this.api.platformAccessory(device.name, uuid)
        accessory.context.device = device
        new RoombaAccessory(this, accessory, this.log, {
          ...device,
          cleanBehaviour: this.config.cleanBehaviour,
          stopBehaviour: this.config.stopBehaviour,
          idleWatchInterval: this.config.idleWatchInterval,
        } as any, this.config, this.api)
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
      }
      configuredAccessoryUUIDs.add(uuid)
    }

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

  private getVersion(): string {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
    this.log.debug(`Plugin Version: ${version}`)
    return version
  }
}
