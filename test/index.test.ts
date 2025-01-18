import type { API } from 'homebridge'

import { describe, expect, it, vi } from 'vitest'

import RoombaAccessory from '../src/accessory.js'
import registerAccessory from '../src/index.js'
import { ACCESSORY_NAME, PLUGIN_NAME } from '../src/settings.js'

describe('registerAccessory', () => {
  it('should register the accessory with homebridge', () => {
    const api = {
      registerAccessory: vi.fn(),
    } as unknown as API

    registerAccessory(api)

    expect(api.registerAccessory).toHaveBeenCalledWith(PLUGIN_NAME, ACCESSORY_NAME, RoombaAccessory)
  })
})
