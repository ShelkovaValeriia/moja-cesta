import { useEffect, useState } from 'react'
import { pointKey } from './model'
import type { AddressResult, GeocodingService, MapPoint } from './types'

interface Lookup<T> {
  key: string
  provider: GeocodingService
  value: T
  error: string | null
}
/** Associate responses with their input and abort stale work, even for slow providers. */
export function useAddressSearch(query: string, provider?: GeocodingService) {
  const [result, setResult] = useState<Lookup<readonly AddressResult[]> | null>(null)
  const key = query.trim()
  useEffect(() => {
    if (!provider || key.length < 3) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      provider
        .search(key, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setResult({ key, provider, value, error: null })
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              provider,
              value: [],
              error: error instanceof Error ? error.message : 'Adresy sa nepodarilo vyhľadať.',
            })
        })
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [key, provider])
  return {
    results: result?.key === key && result.provider === provider ? result.value : [],
    loading: !!provider && key.length >= 3 && (result?.key !== key || result.provider !== provider),
    error: result?.key === key && result.provider === provider ? result.error : null,
  }
}
export function useReverseAddress(point: MapPoint | undefined, provider?: GeocodingService) {
  const [result, setResult] = useState<Lookup<AddressResult | null> | null>(null)
  const key = point ? pointKey(point) : ''
  const latitude = point?.latitude,
    longitude = point?.longitude
  useEffect(() => {
    if (!provider || latitude === undefined || longitude === undefined) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      provider
        .reverse({ latitude, longitude }, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setResult({ key, provider, value, error: null })
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              provider,
              value: null,
              error: error instanceof Error ? error.message : 'Adresu sa nepodarilo zistiť.',
            })
        })
    }, 450)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [key, latitude, longitude, provider])
  return {
    result: result?.key === key && result.provider === provider ? result.value : null,
    loading: !!provider && !!key && (result?.key !== key || result.provider !== provider),
    error: result?.key === key && result.provider === provider ? result.error : null,
  }
}
