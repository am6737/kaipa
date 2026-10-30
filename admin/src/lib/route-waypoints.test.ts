import { describe, expect, it } from 'vitest'
import {
  parseWaypoints,
  serializeWaypoints,
  withHighlight,
  withPhoto,
  waypointEle,
} from './route-waypoints'

describe('parseWaypoints', () => {
  it('reads the jsonb array and a JSON string of it', () => {
    expect(parseWaypoints([{ name: '垭口', km: 1 }])).toEqual([
      { name: '垭口', km: 1 },
    ])
    expect(parseWaypoints('[{"name":"垭口","km":1}]')).toEqual([
      { name: '垭口', km: 1 },
    ])
  })

  it('treats missing or unusable values as no waypoints', () => {
    expect(parseWaypoints(null)).toEqual([])
    expect(parseWaypoints(undefined)).toEqual([])
    expect(parseWaypoints('not json')).toEqual([])
    expect(parseWaypoints({ name: '垭口', km: 1 })).toEqual([])
    expect(parseWaypoints(['垭口', null, 3, { name: '营地', km: 2 }])).toEqual([
      { name: '营地', km: 2 },
    ])
  })
})

describe('serializeWaypoints', () => {
  it('keeps every other key and the walking order', () => {
    const list = [
      {
        name: '起点',
        km: 0,
        at: '2026-05-01T08:00:00Z',
        lng: 100.1,
        lat: 27.2,
      },
      { name: '垭口', km: 4.2, elevationMeters: 3200 },
    ]

    expect(JSON.parse(serializeWaypoints(list))).toEqual(list)
  })

  it('stores highlight as true or not at all', () => {
    expect(
      JSON.parse(serializeWaypoints([{ name: 'A', km: 1, highlight: false }]))
    ).toEqual([{ name: 'A', km: 1 }])
    expect(
      JSON.parse(serializeWaypoints([{ name: 'A', km: 1, highlight: true }]))
    ).toEqual([{ name: 'A', km: 1, highlight: true }])
  })

  it('never stores an empty photo', () => {
    expect(
      JSON.parse(serializeWaypoints([{ name: 'A', km: 1, photo: '  ' }]))
    ).toEqual([{ name: 'A', km: 1 }])
  })

  it('does not mutate the list it serialises', () => {
    const list = [{ name: 'A', km: 1, photo: '', highlight: false }]

    serializeWaypoints(list)

    expect(list).toEqual([{ name: 'A', km: 1, photo: '', highlight: false }])
  })
})

describe('waypoint edits', () => {
  it('adds and removes the highlight key', () => {
    const on = withHighlight({ name: 'A', km: 1 }, true)
    expect(on).toEqual({ name: 'A', km: 1, highlight: true })
    expect(withHighlight(on, false)).toEqual({ name: 'A', km: 1 })
  })

  it('adds and removes the photo key', () => {
    const withUrl = withPhoto({ name: 'A', km: 1 }, 'https://x/a.jpg')
    expect(withUrl).toEqual({ name: 'A', km: 1, photo: 'https://x/a.jpg' })
    expect(withPhoto(withUrl, null)).toEqual({ name: 'A', km: 1 })
    expect(withPhoto(withUrl, '  ')).toEqual({ name: 'A', km: 1 })
  })

  it('reads either elevation spelling', () => {
    expect(waypointEle({ ele: 3200 })).toBe(3200)
    expect(waypointEle({ elevationMeters: 1500 })).toBe(1500)
    expect(waypointEle({ ele: null })).toBeNull()
  })
})
