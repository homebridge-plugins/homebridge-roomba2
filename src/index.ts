import type { API } from 'homebridge'

import RoombaAccessory from './accessory.js'
import { ACCESSORY_NAME, PLUGIN_NAME } from './settings.js'

/**
 * This method registers the platform with Homebridge
 */
export default (api: API): void => {
  api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, RoombaAccessory)
}
