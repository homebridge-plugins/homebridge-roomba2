import type { API } from 'homebridge'

import { describe, expect, it, vi } from 'vitest'

import registerPlatform from './index.js'
import RoombaPlatform from './platform.js'
import { PLATFORM_NAME } from './settings.js'

describe('index.ts', () => {
  it('should register the platform with homebridge', () => {
    const api = {
      registerPlatform: vi.fn(),
    } as unknown as API

    registerPlatform(api)

    expect(api.registerPlatform).toHaveBeenCalledWith(PLATFORM_NAME, RoombaPlatform)
  })
})
