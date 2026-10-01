import { describe, it, expect } from 'vitest'
import { suggestFiling } from './legacy-migration.dictionary'

describe('suggestFiling', () => {
  it('knows the pair when the subcategory alone would mislead', () => {
    expect(suggestFiling('Abonnements', 'Sport', 'EXPENSE')).toMatchObject({
      action: 'CATALOG',
      categoryKey: 'leisure',
      subcategoryKey: 'leisure.gym',
      basis: 'pair',
    })
    expect(
      suggestFiling('Loisirs & Sorties', 'Sport', 'EXPENSE')
    ).toMatchObject({ subcategoryKey: 'leisure.sports', basis: 'pair' })
  })

  it("knows Bankin's subcategory names on their own", () => {
    expect(
      suggestFiling(
        'Alimentation & Restau.',
        'Supermarché / Epicerie',
        'EXPENSE'
      )
    ).toMatchObject({
      subcategoryKey: 'food.supermarket',
      basis: 'subcategory',
    })
    expect(
      suggestFiling('Auto & Transports', "Billets d'avion", 'EXPENSE')
    ).toMatchObject({ subcategoryKey: 'transport.plane' })
    expect(suggestFiling('Logement', 'Loyer', 'EXPENSE')).toMatchObject({
      subcategoryKey: 'housing.rent',
    })
  })

  it('recognises a catalogue label used as a legacy subcategory name', () => {
    expect(
      suggestFiling('Santé', 'optique et dentaire', 'EXPENSE')
    ).toMatchObject({
      subcategoryKey: 'health.optical-dental',
      basis: 'catalog-label',
    })
  })

  it('falls back to the category when the subcategory is unknown', () => {
    expect(
      suggestFiling('Auto & Transports', 'Trottinette', 'EXPENSE')
    ).toMatchObject({
      action: 'CATALOG',
      categoryKey: 'transport',
      subcategoryKey: null,
      basis: 'category',
    })
  })

  it('sends a heading that names no purpose back to the categoriser', () => {
    expect(suggestFiling('Erreurs', 'Erreurs - Autres', 'EXPENSE')).toEqual({
      action: 'UNFILE',
      categoryKey: null,
      subcategoryKey: null,
      tagName: null,
      basis: 'category',
    })
    expect(suggestFiling('Divers', null, 'EXPENSE')?.action).toBe('UNFILE')
  })

  it('carries a context heading over as a tag', () => {
    expect(
      suggestFiling('Cadeaux', 'Cadeaux - Autres', 'EXPENSE')
    ).toMatchObject({ subcategoryKey: 'shopping.other', tagName: 'Cadeaux' })
    expect(suggestFiling('Vacances', 'Restaurant', 'EXPENSE')).toMatchObject({
      subcategoryKey: 'dining.restaurant',
      tagName: 'Vacances',
    })
    expect(
      suggestFiling('Vacances', 'Vacances - Autres', 'EXPENSE')
    ).toMatchObject({ action: 'UNFILE', tagName: 'Vacances' })
  })

  it('keeps the tag of a context subcategory even when only the category is known', () => {
    expect(
      suggestFiling('Loisirs & Sorties', 'Voyages / Vacances', 'EXPENSE')
    ).toMatchObject({
      categoryKey: 'leisure',
      basis: 'category',
      tagName: 'Vacances',
    })
  })

  it('unfiles a subcategory that names no purpose inside a known category', () => {
    expect(
      suggestFiling('Retraits, Chq. et Vir.', 'Virements', 'EXPENSE')
    ).toMatchObject({ action: 'UNFILE', basis: 'subcategory' })
  })

  it('files the refunds Bankin prefixes with "R"', () => {
    expect(suggestFiling('Remboursements', 'R Santé', 'INCOME')).toMatchObject({
      subcategoryKey: 'refunds.health',
    })
    expect(
      suggestFiling('Remboursements', 'R Achats et Shopping', 'INCOME')
    ).toMatchObject({ subcategoryKey: 'refunds.merchant' })
    expect(
      suggestFiling('Remboursements', 'R Vacances', 'INCOME')
    ).toMatchObject({ subcategoryKey: 'refunds.person' })
  })

  it('sends the transports en commun of an export to the tickets, not the pass', () => {
    expect(
      suggestFiling('Auto & Transports', 'Transports en commun', 'EXPENSE')
    ).toMatchObject({ subcategoryKey: 'transport.transit-tickets' })
  })

  it('knows a loan to someone goes with the family, and a show is a show', () => {
    expect(suggestFiling('Prêts', 'Prêts', 'EXPENSE')).toMatchObject({
      categoryKey: 'family',
      subcategoryKey: 'family.loan',
    })
    expect(
      suggestFiling('Loisirs & Sorties', 'Festival', 'EXPENSE')
    ).toMatchObject({ subcategoryKey: 'leisure.shows' })
    expect(suggestFiling('Divers', 'Dons', 'EXPENSE')).toMatchObject({
      subcategoryKey: 'donations.associations',
    })
  })

  it('reaches transfers from either side', () => {
    expect(suggestFiling('Banque', 'Epargne', 'EXPENSE')).toMatchObject({
      categoryKey: 'emergency-savings',
    })
    expect(suggestFiling('Virements internes', null, 'INCOME')).toMatchObject({
      categoryKey: 'internal-transfer',
    })
    expect(
      suggestFiling('Alimenter Compte Joint', null, 'EXPENSE')
    ).toMatchObject({ subcategoryKey: 'joint-contribution.mine' })
  })

  it('never crosses the sign', () => {
    // "Salaires" is an income heading; as an expense it means nothing.
    expect(suggestFiling('Salaires', null, 'EXPENSE')).toBeNull()
    expect(suggestFiling('Logement', 'Loyer', 'INCOME')).toBeNull()
  })

  it('answers null, not a default, for a heading it has never seen', () => {
    expect(suggestFiling('Cheval', 'Pension', 'EXPENSE')).toBeNull()
  })
})
