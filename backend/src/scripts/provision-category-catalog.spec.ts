import { describe, it, expect } from 'vitest'
import { describePlan, parseArgs } from './provision-category-catalog'
import type { ProvisioningPlan } from '../categories/category-catalog.plan'

describe('parseArgs', () => {
  it('defaults to a real run over every user', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, email: null })
  })

  it('reads --dry-run and --email', () => {
    expect(parseArgs(['--dry-run', '--email', 'me@example.com'])).toEqual({
      dryRun: true,
      email: 'me@example.com',
    })
  })

  it('refuses an unknown flag or a bare --email', () => {
    expect(() => parseArgs(['--force'])).toThrow(/Unknown argument/)
    expect(() => parseArgs(['--email'])).toThrow(/needs a value/)
  })
})

describe('describePlan', () => {
  it('prints one line per decision', () => {
    const plan: ProvisioningPlan = {
      adoptCategories: [
        {
          id: 'c1',
          catalogKey: 'housing',
          icon: '🏠',
          defaultNature: 'ESSENTIAL',
          defaultRhythm: 'VARIABLE',
        },
      ],
      adoptSubcategories: [
        {
          id: 's1',
          catalogKey: 'housing.rent',
          nature: 'ESSENTIAL',
          rhythm: 'COMMITTED',
        },
      ],
      createCategories: [
        {
          key: 'food',
          type: 'EXPENSE',
          label: 'Alimentation',
          icon: '🛒',
          description: 'Manger.',
          subcategories: [],
        },
      ],
      createSubcategories: [
        {
          categoryId: 'c1',
          subcategory: {
            key: 'housing.other',
            label: 'Autre',
            nature: 'ESSENTIAL',
            rhythm: 'VARIABLE',
            description: null,
          },
        },
      ],
      retireCategories: [],
      retireSubcategories: [
        {
          id: 's9',
          name: 'Train et avion',
          catalogKey: 'transport.train-plane',
          action: 'release',
        },
      ],
    }

    expect(describePlan(plan)).toEqual([
      '  adopt category    housing ← c1',
      '  adopt subcategory housing.rent ← s1',
      '  create category   food (Alimentation, 0 subcategories)',
      '  create subcategory housing.other under c1',
      '  retire (release) transport.train-plane "Train et avion"',
    ])
  })

  it('prints nothing for an empty plan', () => {
    expect(
      describePlan({
        adoptCategories: [],
        adoptSubcategories: [],
        createCategories: [],
        createSubcategories: [],
        retireCategories: [],
        retireSubcategories: [],
      })
    ).toEqual([])
  })
})
