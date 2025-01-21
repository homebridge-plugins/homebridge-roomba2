import type { API } from 'homebridge'

import RoombaAccessory from './accessory'
import { ACCESSORY_NAME, PLUGIN_NAME } from './settings'

/**
 * This method registers the platform with Homebridge
 */
export = (api: API): void => {
  api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, RoombaAccessory)
}
