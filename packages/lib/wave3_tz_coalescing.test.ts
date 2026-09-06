import { describe, it, expect } from 'vitest'

describe('Wave 3: Timezone Normalization and Date Coalescing', () => {
  it('should format ISO dates into standard UTC day timestamps', () => {
    const normalizeToUtcDate = (isoStr: string) => {
      const d = new Date(isoStr)
      return d.toISOString().split('T')[0]
    }

    expect(normalizeToUtcDate('2026-09-04T18:00:00Z')).toBe('2026-09-04')
    expect(normalizeToUtcDate('2026-09-04T23:59:59Z')).toBe('2026-09-04')
  })

  it('should correctly coalesce conflicting event duration constraints', () => {
    const coalesceDuration = (requestedMin: number, minAllowed: number, maxAllowed: number) => {
      if (requestedMin < minAllowed) return minAllowed
      if (requestedMin > maxAllowed) return maxAllowed
      return requestedMin
    }

    expect(coalesceDuration(10, 15, 60)).toBe(15)
    expect(coalesceDuration(45, 15, 60)).toBe(45)
    expect(coalesceDuration(90, 15, 60)).toBe(60)
  })
})
