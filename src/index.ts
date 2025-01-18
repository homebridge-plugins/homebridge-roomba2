/*
 * index.ts: homebridge-roomba2.
 */
import type { API } from 'homebridge'

import RoombaAccessory from './accessory.js'
import { ACCESSORY_NAME, PLUGIN_NAME } from './settings.js'

// Register our platform with homebridge.
export default (api: API): void => {
  api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, RoombaAccessory)
}
