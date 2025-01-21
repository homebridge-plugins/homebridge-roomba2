/*
 * index.ts: homebridge-roomba2.
 */
import type { API } from 'homebridge'

import RoombaAccessory from './accessory.js'
import { ACCESSORY_NAME, PLUGIN_NAME } from './settings.js'

/**
 * This method registers the platform with Homebridge
 */
export default function (api: API): void {
  api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, RoombaAccessory)
}
