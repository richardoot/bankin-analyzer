import { describe, it, expect } from 'vitest'
import {
  decisionsFor,
  parseArgs,
  parseMapping,
  suggestMapping,
} from './migrate-legacy-categories'
import type { LegacyCategoryView } from '../categories/legacy-migration.apply'

describe('parseArgs', () => {
  it('reads a suggest run', () => {
    expect(parseArgs(['--email', 'me@x.io', '--suggest', 'm.json'])).toEqual({
      email: 'me@x.io',
      suggest: 'm.json',
      apply: null,
      dryRun: false,
    })
  })

  it('reads an apply run, dry or not', () => {
    expect(
      parseArgs(['--email', 'me@x.io', '--apply', 'm.json', '--dry-run'])
    ).toMatchObject({ apply: 'm.json', dryRun: true })
  })

  it('insists on an email and exactly one mode', () => {
    expect(() => parseArgs(['--suggest', 'm.json'])).toThrow(/--email/)
    expect(() => parseArgs(['--email', 'me@x.io'])).toThrow(/One of/)
    expect(() =>
      parseArgs(['--email', 'me@x.io', '--suggest', 'a', '--apply', 'b'])
    ).toThrow(/exclusive/)
    expect(() => parseArgs(['--email', 'me@x.io', '--force'])).toThrow(
      /Unknown argument/
    )
  })
})

describe('suggestMapping', () => {
  it('writes each suggestion as a line, and KEEP where there is none', () => {
    const overview: LegacyCategoryView[] = [
      {
        id: 'c1',
        name: 'Abonnements',
        type: 'EXPENSE',
        icon: null,
        transactionCount: 3,
        isHidden: false,
        budgetPlanEntryCount: 0,
        lines: [
          {
            sourceSubcategoryId: 's1',
            name: 'Téléphonie mobile',
            transactionCount: 1,
            suggestion: {
              action: 'CATALOG',
              categoryKey: 'telecom',
              categoryName: 'Télécom et numérique',
              subcategoryKey: 'telecom.phone',
              subcategoryName: 'Téléphone',
              tagName: null,
              basis: 'subcategory',
            },
          },
          {
            sourceSubcategoryId: 's2',
            name: 'Cadeaux',
            transactionCount: 1,
            suggestion: {
              action: 'CATALOG',
              categoryKey: 'shopping',
              categoryName: 'Shopping et soins',
              subcategoryKey: null,
              subcategoryName: null,
              tagName: 'Cadeaux',
              basis: 'category',
            },
          },
          {
            sourceSubcategoryId: null,
            name: null,
            transactionCount: 1,
            suggestion: null,
          },
        ],
      },
    ]

    expect(suggestMapping(overview)).toEqual({
      categories: [
        {
          name: 'Abonnements',
          type: 'EXPENSE',
          lines: [
            {
              subcategory: 'Téléphonie mobile',
              action: 'CATALOG',
              target: 'telecom.phone',
            },
            {
              subcategory: 'Cadeaux',
              action: 'CATALOG',
              target: 'shopping',
              tag: 'Cadeaux',
            },
            { subcategory: null, action: 'KEEP' },
          ],
        },
      ],
    })
  })
})

describe('parseMapping', () => {
  it('accepts the documented shape', () => {
    const mapping = parseMapping({
      categories: [
        {
          name: 'Abonnements',
          type: 'EXPENSE',
          lines: [
            {
              subcategory: 'AI',
              action: 'CUSTOM',
              target: 'telecom',
              name: 'IA',
              tag: 'Pro',
            },
            { subcategory: null, action: 'UNFILE' },
          ],
        },
      ],
    })

    expect(mapping.categories[0]?.lines[0]).toEqual({
      subcategory: 'AI',
      action: 'CUSTOM',
      target: 'telecom',
      name: 'IA',
      tag: 'Pro',
    })
  })

  it('refuses a malformed file with a message naming the spot', () => {
    expect(() => parseMapping({})).toThrow(/"categories" must be an array/)
    expect(() =>
      parseMapping({ categories: [{ name: 'X', type: 'TRANSFER', lines: [] }] })
    ).toThrow(/has no type/)
    expect(() =>
      parseMapping({
        categories: [
          {
            name: 'X',
            type: 'EXPENSE',
            lines: [{ subcategory: null, action: 'MOVE' }],
          },
        ],
      })
    ).toThrow(/unknown action "MOVE"/)
  })
})

describe('decisionsFor', () => {
  const source = {
    subcategories: [
      { id: 's-ai', name: 'AI' },
      { id: 's-phone', name: 'Téléphonie mobile' },
    ],
  }
  const tags = new Map([['pro', 'tag-pro']])

  it('resolves subcategories by name, keys by their dot, tags by name', () => {
    const decisions = decisionsFor(
      {
        name: 'Abonnements',
        type: 'EXPENSE',
        lines: [
          {
            subcategory: 'téléphonie mobile',
            action: 'CATALOG',
            target: 'telecom.phone',
          },
          {
            subcategory: 'AI',
            action: 'CUSTOM',
            target: 'telecom',
            name: 'IA',
            tag: 'Pro',
          },
          { subcategory: null, action: 'UNFILE' },
        ],
      },
      source,
      tags
    )

    expect(decisions).toEqual([
      {
        sourceSubcategoryId: 's-phone',
        action: 'CATALOG',
        categoryKey: 'telecom',
        subcategoryKey: 'telecom.phone',
      },
      {
        sourceSubcategoryId: 's-ai',
        action: 'CUSTOM',
        categoryKey: 'telecom',
        subcategoryName: 'IA',
        tagId: 'tag-pro',
      },
      { sourceSubcategoryId: null, action: 'UNFILE' },
    ])
  })

  it('refuses a subcategory the category does not have', () => {
    expect(() =>
      decisionsFor(
        {
          name: 'Abonnements',
          type: 'EXPENSE',
          lines: [{ subcategory: 'Cloud', action: 'UNFILE' }],
        },
        source,
        tags
      )
    ).toThrow(/has no subcategory "Cloud"/)
  })
})
