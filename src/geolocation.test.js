import { describe, expect, it, vi } from 'vitest'

import { requestCurrentLocation } from './geolocation.js'

describe('requestCurrentLocation', () => {
  it('resolves valid browser coordinates', async () => {
    const getCurrentPosition = vi.fn((success) => success({
      coords: { latitude: 30.4278, longitude: -9.5981 },
    }))

    await expect(requestCurrentLocation({ getCurrentPosition })).resolves.toEqual({
      latitude: 30.4278,
      longitude: -9.5981,
    })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('reports denied permission without blocking manual address entry', async () => {
    const getCurrentPosition = vi.fn((_, failure) => failure({ code: 1 }))

    await expect(requestCurrentLocation({ getCurrentPosition }))
      .rejects.toThrow(/permission was denied/i)
  })

  it('reports unavailable and timed-out location services', async () => {
    await expect(requestCurrentLocation(null)).rejects.toThrow(/unavailable/i)

    const getCurrentPosition = vi.fn((_, failure) => failure({ code: 3 }))
    await expect(requestCurrentLocation({ getCurrentPosition })).rejects.toThrow(/timed out/i)
  })

  it('rejects invalid browser coordinates', async () => {
    const getCurrentPosition = vi.fn((success) => success({
      coords: { latitude: 91, longitude: -9.5981 },
    }))

    await expect(requestCurrentLocation({ getCurrentPosition })).rejects.toThrow(/invalid coordinates/i)
  })
})
