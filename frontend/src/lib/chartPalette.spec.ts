import { describe, it, expect } from 'vitest'
import {
  assignCategoryColors,
  CATEGORY_PALETTE,
  OTHERS_COLOR_DARK,
  OTHERS_COLOR_LIGHT,
} from './chartPalette'

describe('assignCategoryColors', () => {
  it('hands the palette out by descending value, the rest muted', () => {
    const colors = assignCategoryColors(
      ['Petit', 'Grand', 'Moyen', 'Minuscule'],
      [10, 100, 50, 1],
      2,
      false
    )
    expect(colors.get('Grand')).toBe(CATEGORY_PALETTE[0])
    expect(colors.get('Moyen')).toBe(CATEGORY_PALETTE[1])
    expect(colors.get('Petit')).toBe(OTHERS_COLOR_LIGHT)
    expect(colors.get('Minuscule')).toBe(OTHERS_COLOR_LIGHT)
  })

  it('caps nothing with topN 0 and keeps ties in their incoming order', () => {
    const colors = assignCategoryColors(['A', 'B', 'C'], [5, 5, 5], 0, true)
    expect([colors.get('A'), colors.get('B'), colors.get('C')]).toEqual([
      CATEGORY_PALETTE[0],
      CATEGORY_PALETTE[1],
      CATEGORY_PALETTE[2],
    ])
  })

  it('mutes « Autres » in the dark tone on a dark theme', () => {
    const colors = assignCategoryColors(['A', 'B'], [2, 1], 1, true)
    expect(colors.get('B')).toBe(OTHERS_COLOR_DARK)
  })
})
