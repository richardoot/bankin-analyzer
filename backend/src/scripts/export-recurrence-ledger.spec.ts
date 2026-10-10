import { describe, it, expect } from 'vitest'
import { anonymizeLabel, pseudonymizer } from './export-recurrence-ledger'

const key = Buffer.alloc(32, 7)

describe('anonymizeLabel', () => {
  it('replaces the merchant and the people, keeps what the bank writes', () => {
    const pseudonym = pseudonymizer(key)
    const label = anonymizeLabel(
      'Vir Sepa Begon Patrice Virement De Chloe Torres Réf',
      pseudonym
    )

    expect(label).toMatch(/^Vir Sepa \w+ \w+ Virement De \w+ \w+ Réf$/)
    expect(label).not.toMatch(/Begon|Patrice|Chloe|Torres/)
  })

  it('gives a word the same pseudonym everywhere, of the same length', () => {
    const pseudonym = pseudonymizer(key)

    const first = anonymizeLabel('CB Netflix.com', pseudonym)
    const second = anonymizeLabel('PRLV NETFLIX', pseudonym)

    expect(first.split(' ')[1]?.split('.')[0]?.toLowerCase()).toBe(
      second.split(' ')[1]?.toLowerCase()
    )
    expect(first).toMatch(/^CB [A-Z][a-z]{6}\.com$/)
  })

  it('keeps digits and card patterns untouched', () => {
    const pseudonym = pseudonymizer(key)

    expect(
      anonymizeLabel('CARTE 06/08/26 FITNESS PARK CB*7962', pseudonym)
    ).toMatch(/^CARTE 06\/08\/26 [A-Z]{7} [A-Z]{4} CB\*7962$/)
  })

  it('never gives two words the same pseudonym', () => {
    const pseudonym = pseudonymizer(key)
    const words = Array.from(
      { length: 400 },
      (_, i) =>
        `w${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`
    ).map(w => w.replace(/\d/g, ''))
    const pseudonyms = new Set(words.map(pseudonym))

    expect(pseudonyms.size).toBe(new Set(words).size)
  })
})
