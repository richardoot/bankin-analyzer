import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TAG_COLOR,
  newEditionForm,
  nextEditionName,
} from './tagFormModel'

describe('nextEditionName', () => {
  it('moves a trailing year on by one', () => {
    expect(nextEditionName('HYROX Paris 2025')).toBe('HYROX Paris 2026')
    expect(nextEditionName('2025')).toBe('2026')
  })

  it('keeps a name without a year', () => {
    expect(nextEditionName('Fêtes de Bayonne')).toBe('Fêtes de Bayonne')
  })

  it('keeps a name whose digits are not at its end', () => {
    expect(nextEditionName('HYROX 2025 Paris')).toBe('HYROX 2025 Paris')
  })

  it('reads only four digits standing on their own as a year', () => {
    expect(nextEditionName('Vol AF12345')).toBe('Vol AF12345')
    expect(nextEditionName('Concert 25')).toBe('Concert 25')
  })

  it('crosses into the next century', () => {
    expect(nextEditionName('Réveillon 2099')).toBe('Réveillon 2100')
  })
})

describe('newEditionForm', () => {
  it('fills the creation form for the next edition, window left empty', () => {
    expect(
      newEditionForm({
        name: 'HYROX Paris 2025',
        color: '#22c55e',
        icon: 'trophy',
        familyId: 'fam-r',
      })
    ).toEqual({
      name: 'HYROX Paris 2026',
      color: '#22c55e',
      isExceptional: true,
      eventStart: '',
      eventEnd: '',
      budget: null,
      familyId: 'fam-r',
      icon: 'trophy',
    })
  })

  it('falls back to the default colour', () => {
    expect(
      newEditionForm({
        name: 'Fêtes de Bayonne',
        color: null,
        icon: null,
        familyId: null,
      })
    ).toEqual(
      expect.objectContaining({
        name: 'Fêtes de Bayonne',
        color: DEFAULT_TAG_COLOR,
      })
    )
  })
})
