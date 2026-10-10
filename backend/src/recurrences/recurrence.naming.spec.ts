import { describe, it, expect } from 'vitest'
import { serviceName } from './recurrence.naming'

describe('serviceName', () => {
  // Labels as production carries them, read on 2026-10-08.
  it.each([
    ['CB Strava Ireland Li', 'Strava'],
    ['Prlv Sepa Paypal Europe S.a.r.l', 'Paypal'],
    ['Prlv Sepa Paypal Europe S.a.r.l. Et Cie Rum', 'Paypal'],
    ['Prlv Sepa Orange Sa Votre Abonnement Mobile: (Fac Ture: Rum', 'Orange'],
    ['Prlv Sepa Orange Sa Votre Abonnement Fibre (Facture: Rum', 'Orange'],
    ['CB Apple.com/bill', 'Apple'],
    ['Prlv Sepa Amv', 'AMV'],
    ['Prlv Sepa Bouygues Telecom Rum', 'Bouygues Telecom'],
    ['Prlv Sepa Basic Fit France Rum', 'Basic Fit'],
    ['CB Anthropic* Claude', 'Anthropic'],
    ['CB Openai *Chatgpt S Usd Euro', 'Openai'],
    ['CB Claude.ai Subscri', 'Claude'],
    ['CB Amazon Prime Fr', 'Amazon Prime'],
    [
      'Prlv Sepa Amnesty International Amnesty International France: Merci',
      'Amnesty International',
    ],
    ['Prlv Sepa Edf Clients Particuliers Peder Martine Numero', 'EDF'],
    ['Vir Corner Strava Qwertys Billeterie Réf', 'Strava Qwertys'],
    ['CARTE 06/08/26 FITNESS PARK CB*7962', 'Fitness Park'],
    ['Prlv Sepa Aksport Fit Prlv Fitness Park Merignac Fit', 'Fitness Park'],
    [
      'Prlv Sepa Isafitness Fp Borde Fit Prlv Fitness Park Bordeaux',
      'Fitness Park',
    ],
    ['F Tenue De Compte', 'Tenue de Compte'],
    [
      'Prlv Sepa Direction Generale De Solde Impot Revenus',
      'Direction Generale',
    ],
    ['Vir Corner - Auchan The Corner', 'Auchan'],
    ['*Interets Debiteurs', 'Interets Debiteurs'],
  ])('reads %s as %s', (label, name) => {
    expect(serviceName([label])).toBe(name)
  })

  it('names a series paid under several labels by the words they share', () => {
    expect(
      serviceName([
        'CB Strava Ireland Li',
        'Vir Corner Strava Qwertys Billeterie Réf',
      ])
    ).toBe('Strava')
  })

  it('reads a rent transfer by the landlord every label names', () => {
    expect(
      serviceName([
        'Vir Sepa Martin Paul',
        'Vir Inst Martin Paul Virement De Claire Durand',
        'Vir Sepa Martin Paul Virement De Claire Durand Réf',
      ])
    ).toBe('Martin Paul')
  })

  it('falls back on the latest label when the labels share nothing', () => {
    expect(
      serviceName(['CB Strava Ireland Li', 'Prlv Sepa Paypal Europe'])
    ).toBe('Strava')
  })

  it('keeps a label made of noise as it is rather than inventing a name', () => {
    expect(serviceName(['CB 12/09/26'])).toBe('CB 12/09/26')
  })
})
