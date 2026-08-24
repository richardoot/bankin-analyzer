import { describe, it, expect } from 'vitest'
import { parseCsvRecords } from './csv'

const fieldsOf = (text: string): string[][] =>
  parseCsvRecords(text).map(r => r.fields)

describe('parseCsvRecords', () => {
  it('reads a plain row', () => {
    expect(fieldsOf('a;b;c')).toEqual([['a', 'b', 'c']])
  })

  it('strips the quotes around a field', () => {
    expect(fieldsOf('"a";"b"')).toEqual([['a', 'b']])
  })

  it('keeps a delimiter that sits inside quotes', () => {
    expect(fieldsOf('"a;b";c')).toEqual([['a;b', 'c']])
  })

  it('reads a doubled quote as one literal quote', () => {
    expect(fieldsOf('"say ""hi""";b')).toEqual([['say "hi"', 'b']])
  })

  it('keeps an empty field between two delimiters', () => {
    expect(fieldsOf('a;;c')).toEqual([['a', '', 'c']])
  })

  it('keeps a trailing empty field', () => {
    expect(fieldsOf('a;b;')).toEqual([['a', 'b', '']])
  })

  describe('records spanning several lines', () => {
    it('keeps a newline that sits inside quotes', () => {
      // The bug this module exists for: an export wrote a two-line note, the
      // record became two short fragments, and both were dropped in silence.
      const text = '"a";"line one\nline two";"c"'

      expect(fieldsOf(text)).toEqual([['a', 'line one\nline two', 'c']])
    })

    it('still ends the record at the newline that follows', () => {
      const text = '"a";"one\ntwo";"c"\n"d";"e";"f"'

      expect(fieldsOf(text)).toEqual([
        ['a', 'one\ntwo', 'c'],
        ['d', 'e', 'f'],
      ])
    })

    it('handles several newlines in the same field', () => {
      expect(fieldsOf('"a";"one\ntwo\nthree"')).toEqual([
        ['a', 'one\ntwo\nthree'],
      ])
    })

    it('reports the line the record starts on, not where it ends', () => {
      const records = parseCsvRecords('h1;h2\n"a";"one\ntwo"\n"b";"c"')

      expect(records.map(r => r.line)).toEqual([1, 2, 4])
    })
  })

  describe('line endings and blanks', () => {
    it('reads CRLF as one break', () => {
      expect(fieldsOf('a;b\r\nc;d')).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ])
    })

    it('normalises a CRLF inside a quoted field to a single newline', () => {
      expect(fieldsOf('"a";"one\r\ntwo"')).toEqual([['a', 'one\ntwo']])
    })

    it('ignores a trailing newline rather than inventing a row', () => {
      expect(fieldsOf('a;b\n')).toEqual([['a', 'b']])
    })

    it('ignores blank lines between records', () => {
      expect(fieldsOf('a;b\n\nc;d')).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ])
    })

    it('returns nothing for an empty text', () => {
      expect(fieldsOf('')).toEqual([])
    })
  })

  it('reads the Bankin export that exposed the bug', () => {
    const text = [
      'Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée',
      '"08/10/2025";"Prlv Sepa Amnesty";"Perso CIC";"-15.0";"Divers";"Dons";"";"Oui"',
      '"08/10/2025";"Prlv Sepa Paypal";"Perso CIC";"-126.0";"Vacances";"Vacances - Autres";"Logement Hyrox Paris (2/2)',
      'Attente Remb. Chloé";"Oui"',
      '"07/10/2025";"Vir Filhet Allard";"Perso CIC";"6.65";"Entrées d\'argent";"Remboursements";"";"Oui"',
    ].join('\n')

    const records = parseCsvRecords(text)

    // Header plus three transactions — the two-line note is one record.
    expect(records).toHaveLength(4)
    expect(records.every(r => r.fields.length === 8)).toBe(true)
    expect(records[2]?.fields[6]).toBe(
      'Logement Hyrox Paris (2/2)\nAttente Remb. Chloé'
    )
  })

  it('accepts another delimiter', () => {
    expect(parseCsvRecords('a,b,c', ',').map(r => r.fields)).toEqual([
      ['a', 'b', 'c'],
    ])
  })
})
