import { describe, expect, it } from 'vitest'

import { ACCESSORY_NAME, PLUGIN_NAME } from '../src/settings.js'

describe('settings', () => {
  it('should have the correct accessory name', () => {
    expect(ACCESSORY_NAME).toBe('Roomba2')
  })

  it('should have the correct plugin name', () => {
    expect(PLUGIN_NAME).toBe('homebridge-roomba2')
  })
})
