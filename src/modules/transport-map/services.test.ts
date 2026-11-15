import { describe, expect, it, vi } from 'vitest'
import { createGeoapifyGeocoder, createGeoapifyRouting } from './services'
import { PRESOVSKY_KRAJ } from './config'

describe('replaceable geographic service adapters', () => {
  it('uses Slovak autocomplete with regional bias and forwards the abort signal', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            { properties: { lat: 49.3, lon: 20.4, formatted: 'Jezersko', result_type: 'city' } },
          ],
        }),
      ),
    )
    const service = createGeoapifyGeocoder({
      apiKey: 'test-key',
      area: PRESOVSKY_KRAJ,
      fetch: fetcher,
    })
    const signal = new AbortController().signal
    const results = await service.search('Jezersko', signal)
    const url = new URL(String(fetcher.mock.calls[0][0]))
    expect(url.hostname).toBe('api.geoapify.com')
    expect(url.searchParams.get('lang')).toBe('sk')
    expect(url.searchParams.get('filter')).toBe('countrycode:sk')
    expect(fetcher.mock.calls[0][1]?.signal).toBe(signal)
    expect(results[0].position).toEqual({ latitude: 49.3, longitude: 20.4 })
    expect(results[0].precision).toBe('city')
  })
  it('keeps an empty reverse lookup as unknown and reports rate limits', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"features":[]}'))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
    const service = createGeoapifyGeocoder({ apiKey: 'test', area: PRESOVSKY_KRAJ, fetch: fetcher })
    const signal = new AbortController().signal
    expect(await service.reverse({ latitude: 49, longitude: 20 }, signal)).toBeNull()
    await expect(service.search('Havka', signal)).rejects.toThrow('limit')
  })
  it('preserves GeoJSON road geometry and uses seconds/metres from routing', async () => {
    const geometry = {
      type: 'MultiLineString',
      coordinates: [
        [
          [20, 49],
          [20.1, 49.1],
        ],
      ],
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ features: [{ geometry, properties: { distance: 1200, time: 300 } }] }),
        ),
      )
    const result = await createGeoapifyRouting({ apiKey: 'test', fetch: fetcher }).route(
      [
        { latitude: 49, longitude: 20 },
        { latitude: 49.1, longitude: 20.1 },
      ],
      'drive',
      new AbortController().signal,
    )
    expect(result).toEqual({ geometry, distanceMeters: 1200, durationSeconds: 300 })
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('waypoints')).toBe(
      '49,20|49.1,20.1',
    )
  })
})
