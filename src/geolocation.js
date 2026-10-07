export function requestCurrentLocation(geolocation = globalThis.navigator?.geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
      reject(new Error('Location is unavailable in this browser. Enter your address manually.'))
      return
    }

    try {
      geolocation.getCurrentPosition(
        (position) => {
          const latitude = position?.coords?.latitude
          const longitude = position?.coords?.longitude

          if (
            typeof latitude !== 'number'
            || !Number.isFinite(latitude)
            || latitude < -90
            || latitude > 90
            || typeof longitude !== 'number'
            || !Number.isFinite(longitude)
            || longitude < -180
            || longitude > 180
          ) {
            reject(new Error('The browser returned invalid coordinates. Enter your address manually.'))
            return
          }

          resolve({ latitude, longitude })
        },
        (error) => {
          const message = error?.code === 1
            ? 'Location permission was denied. Enter your address manually.'
            : error?.code === 3
              ? 'Location request timed out. Enter your address manually or try again.'
              : 'Unable to get your current location. Enter your address manually or try again.'

          reject(new Error(message))
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      )
    } catch {
      reject(new Error('Unable to get your current location. Enter your address manually or try again.'))
    }
  })
}
