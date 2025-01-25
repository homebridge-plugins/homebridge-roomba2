import type { API } from 'homebridge'

import RoombaPlatform from './platform.js'
import { PLATFORM_NAME } from './settings.js'

// Register our platform with homebridge.
export default (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, RoombaPlatform)
}
