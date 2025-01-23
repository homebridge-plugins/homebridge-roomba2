import { API } from "homebridge";

import { ACCESSORY_NAME, PLUGIN_NAME } from "./settings.js";
import RoombaAccessory from "./accessory.js";

/**
 * This method registers the platform with Homebridge
 */
export = (api: API): void => {
    api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, RoombaAccessory);
};
