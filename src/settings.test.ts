import { describe, expect, it } from 'vitest'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

describe('settings', () => {
  it('should have the correct platform name', () => {
    expect(PLATFORM_NAME).toBe('Roomba')
  })

  it('should have the correct plugin name', () => {
    expect(PLUGIN_NAME).toBe('@homebridge-plugins/homebridge-roomba')
  })
})
