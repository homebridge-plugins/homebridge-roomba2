import type { API } from 'homebridge'

import { describe, expect, it, vi } from 'vitest'

import registerPlatform from '../src/index.js'
import RoombaPlatform from '../src/platform.js'
import { PLATFORM_NAME, PLUGIN_NAME } from '../src/settings.js'

describe('registerPlatform', () => {
  it('should call registerPlatform once', () => {
    const api = {
      registerPlatform: vi.fn(),
    } as unknown as API

    registerPlatform(api)

    expect(api.registerPlatform).toHaveBeenCalledTimes(1)
  })

  it('should not call registerPlatform with incorrect arguments', () => {
    const api = {
      registerPlatform: vi.fn(),
    } as unknown as API

    registerPlatform(api)

    expect(api.registerPlatform).not.toHaveBeenCalledWith('wrongPluginName', PLATFORM_NAME, RoombaPlatform)
    expect(api.registerPlatform).not.toHaveBeenCalledWith(PLUGIN_NAME, 'wrongPlatformName', RoombaPlatform)
    expect(api.registerPlatform).not.toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, {})
  })
})
