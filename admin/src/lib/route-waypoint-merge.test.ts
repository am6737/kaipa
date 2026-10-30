import { describe, expect, it } from 'vitest'
import { mergeWaypointCuration } from './route-waypoint-merge'
import type { Waypoint } from './route-waypoints'

describe('mergeWaypointCuration', () => {
  it('carries photo and highlight onto the waypoint with the same name and km', () => {
    const previous: Waypoint[] = [
      { name: '垭口', km: 4.2, highlight: true, photo: 'https://x/a.jpg' },
    ]
    const next: Waypoint[] = [
      { name: '垭口', km: 4.31, elevationMeters: 3200 },
      { name: '营地', km: 9 },
    ]

    const merged = mergeWaypointCuration(next, previous)

    expect(merged.waypoints[0]).toEqual({
      name: '垭口',
      km: 4.31,
      elevationMeters: 3200,
      highlight: true,
      photo: 'https://x/a.jpg',
    })
    expect(merged.waypoints[1]).toEqual({ name: '营地', km: 9 })
    expect(merged.lost).toEqual([])
  })

  it('trims names when matching', () => {
    const merged = mergeWaypointCuration(
      [{ name: ' 山顶 ', km: 1.0 }],
      [{ name: '山顶', km: 1.05, highlight: true }]
    )

    expect(merged.waypoints[0].highlight).toBe(true)
    expect(merged.lost).toEqual([])
  })

  it('does not match the same name beyond 0.3 km', () => {
    const previous: Waypoint[] = [{ name: '水源', km: 2, highlight: true }]
    const merged = mergeWaypointCuration([{ name: '水源', km: 2.35 }], previous)

    expect(merged.waypoints[0].highlight).toBeUndefined()
    expect(merged.lost).toEqual(previous)
  })

  it('falls back to the nearest coordinates within 150 m', () => {
    const previous: Waypoint[] = [
      {
        name: 'Lake',
        km: 12,
        lng: 100.123456,
        lat: 27.654321,
        photo: 'https://x/lake.jpg',
      },
    ]
    const next: Waypoint[] = [
      { name: '湖', km: 1, lng: 100.123956, lat: 27.654321 },
    ]

    const merged = mergeWaypointCuration(next, previous)

    expect(merged.waypoints[0].photo).toBe('https://x/lake.jpg')
    expect(merged.lost).toEqual([])
  })

  it('does not match coordinates further apart than 150 m', () => {
    const previous: Waypoint[] = [
      { name: 'A', km: 1, lng: 100, lat: 27, highlight: true },
    ]
    const merged = mergeWaypointCuration(
      [{ name: 'B', km: 1, lng: 100.01, lat: 27 }],
      previous
    )

    expect(merged.waypoints[0].highlight).toBeUndefined()
    expect(merged.lost).toEqual(previous)
  })

  it('uses one curated waypoint for at most one new waypoint', () => {
    const previous: Waypoint[] = [{ name: '岔口', km: 3, highlight: true }]
    const merged = mergeWaypointCuration(
      [
        { name: '岔口', km: 3.1 },
        { name: '岔口', km: 3.2 },
      ],
      previous
    )

    expect(merged.waypoints[0].highlight).toBe(true)
    expect(merged.waypoints[1].highlight).toBeUndefined()
    expect(merged.lost).toEqual([])
  })

  it('keeps uncured old waypoints out of the lost list', () => {
    const merged = mergeWaypointCuration(
      [{ name: '新点', km: 5 }],
      [
        { name: '消失的营地', km: 8, highlight: true },
        { name: '普通点', km: 20 },
      ]
    )

    expect(merged.lost).toEqual([
      { name: '消失的营地', km: 8, highlight: true },
    ])
  })

  it('ignores old waypoints that were never curated', () => {
    const merged = mergeWaypointCuration(
      [{ name: '垭口', km: 4 }],
      [
        { name: '垭口', km: 4 },
        { name: '旧点', km: 9 },
      ]
    )

    expect(merged.waypoints).toEqual([{ name: '垭口', km: 4 }])
    expect(merged.lost).toEqual([])
  })

  it('returns the new list untouched when nothing was curated', () => {
    const next: Waypoint[] = [{ name: '起点', km: 0 }]

    expect(mergeWaypointCuration(next, [{ name: '起点', km: 0 }])).toEqual({
      waypoints: next,
      lost: [],
    })
  })
})
