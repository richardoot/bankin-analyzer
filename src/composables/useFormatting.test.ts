import { describe, it, expect, beforeEach } from 'vitest'
import { useFormatting } from './useFormatting'

describe('useFormatting', () => {
  let formatting: ReturnType<typeof useFormatting>

  beforeEach(() => {
    formatting = useFormatting()
  })

  describe('formatAmount', () => {
    it('devrait formater un montant positif', () => {
      const result = formatting.formatAmount(123.45)
      expect(result).toContain('123,45')
      expect(result).toContain('€')
    })

    it('devrait formater un montant négatif', () => {
      const result = formatting.formatAmount(-123.45)
      expect(result).toContain('-123,45')
      expect(result).toContain('€')
    })

    it('devrait formater zéro', () => {
      const result = formatting.formatAmount(0)
      expect(result).toContain('0,00')
      expect(result).toContain('€')
    })

    it('devrait gérer NaN', () => {
      expect(formatting.formatAmount(NaN)).toBe('0,00 €')
    })

    it('devrait formater un grand nombre', () => {
      const result = formatting.formatAmount(1234567.89)
      expect(result).toContain('567,89')
      expect(result).toContain('€')
      expect(result).toMatch(/1.234.567,89/)
    })

    it('devrait respecter la précision', () => {
      const customFormatting = useFormatting({ precision: 3 })
      const result = customFormatting.formatAmount(123.456)
      expect(result).toContain('123,456')
      expect(result).toContain('€')
    })
  })

  describe('formatAmountSimple', () => {
    it('devrait formater un montant sans symbole de devise', () => {
      expect(formatting.formatAmountSimple(123.45)).toBe('123,45')
    })

    it('devrait formater un montant négatif sans symbole', () => {
      expect(formatting.formatAmountSimple(-123.45)).toBe('-123,45')
    })

    it('devrait gérer NaN', () => {
      expect(formatting.formatAmountSimple(NaN)).toBe('0,00')
    })
  })

  describe('formatAmountForPdf', () => {
    it('devrait formater pour PDF avec notation anglaise', () => {
      expect(formatting.formatAmountForPdf(123.45)).toBe('123.45 EUR')
    })

    it('devrait formater un montant négatif pour PDF', () => {
      expect(formatting.formatAmountForPdf(-123.45)).toBe('-123.45 EUR')
    })

    it('devrait gérer NaN pour PDF', () => {
      expect(formatting.formatAmountForPdf(NaN)).toBe('0.00 EUR')
    })
  })

  describe('formatPercentage', () => {
    it('devrait formater un pourcentage', () => {
      const result = formatting.formatPercentage(25)
      expect(result).toContain('25,0')
      expect(result).toContain('%')
    })

    it('devrait formater un pourcentage avec précision personnalisée', () => {
      const result = formatting.formatPercentage(25.456, 2)
      expect(result).toContain('25,46')
      expect(result).toContain('%')
    })

    it('devrait gérer zéro', () => {
      const result = formatting.formatPercentage(0)
      expect(result).toContain('0,0')
      expect(result).toContain('%')
    })

    it('devrait gérer NaN', () => {
      expect(formatting.formatPercentage(NaN)).toBe('0%')
    })
  })

  describe('formatNumber', () => {
    it('devrait formater un nombre entier', () => {
      const result = formatting.formatNumber(1234567)
      expect(result).toContain('1')
      expect(result).toContain('234')
      expect(result).toContain('567')
      expect(result).toMatch(/1.234.567/)
    })

    it('devrait formater zéro', () => {
      expect(formatting.formatNumber(0)).toBe('0')
    })

    it('devrait gérer NaN', () => {
      expect(formatting.formatNumber(NaN)).toBe('0')
    })
  })

  describe('formatDate', () => {
    it('devrait formater une date string', () => {
      const result = formatting.formatDate('2023-12-25')
      expect(result).toMatch(/25\/12\/2023/)
    })

    it('devrait formater un objet Date', () => {
      const date = new Date('2023-12-25')
      const result = formatting.formatDate(date)
      expect(result).toMatch(/25\/12\/2023/)
    })

    it('devrait retourner "Non défini" pour une date vide', () => {
      expect(formatting.formatDate('')).toBe('Non défini')
    })

    it('devrait gérer une date invalide', () => {
      const result = formatting.formatDate('invalid-date')
      expect(result).toBe('invalid-date')
    })

    it('devrait formater avec format court', () => {
      const result = formatting.formatDate('2023-12-25', { format: 'short' })
      expect(result).toMatch(/25\/12\/23/)
    })

    it('devrait formater avec format long', () => {
      const result = formatting.formatDate('2023-12-25', { format: 'long' })
      expect(result).toContain('décembre')
      expect(result).toContain('2023')
    })

    it('devrait inclure le temps si demandé', () => {
      const date = new Date('2023-12-25T14:30:00')
      const result = formatting.formatDate(date, { includeTime: true })
      expect(result).toMatch(/14:30/)
    })
  })

  describe('formatDateShort', () => {
    it('devrait formater une date courte', () => {
      const result = formatting.formatDateShort('2023-12-25')
      expect(result).toMatch(/25\/12\/2023/)
    })
  })

  describe('formatDateLong', () => {
    it('devrait formater une date longue', () => {
      const result = formatting.formatDateLong('2023-12-25')
      expect(result).toContain('décembre')
    })
  })

  describe('formatDateForPdf', () => {
    it('devrait formater une date pour PDF', () => {
      const date = new Date('2023-12-25T14:30:00')
      const result = formatting.formatDateForPdf(date)
      expect(result).toContain('décembre')
      expect(result).toContain('2023')
      expect(result).toMatch(/14:30/)
    })
  })

  describe('cleanStringForPdf', () => {
    it('devrait nettoyer une chaîne pour PDF', () => {
      const input = 'Café français avec € et caractères étranges 🚀'
      const result = formatting.cleanStringForPdf(input)
      expect(result).toContain('Caf')
      expect(result).toContain('franais')
      expect(result).not.toContain('🚀')
      expect(result).not.toContain('é')
      expect(result).not.toContain('ç')
    })

    it('devrait gérer une chaîne vide', () => {
      expect(formatting.cleanStringForPdf('')).toBe('')
    })

    it('devrait supprimer les espaces multiples', () => {
      const input = 'Texte   avec    espaces     multiples'
      const result = formatting.cleanStringForPdf(input)
      expect(result).toBe('Texte avec espaces multiples')
    })
  })

  describe('formatAmountWithColor', () => {
    it('devrait identifier un montant positif', () => {
      const result = formatting.formatAmountWithColor(123.45)
      expect(result.value).toContain('123,45')
      expect(result.value).toContain('€')
      expect(result.isNegative).toBe(false)
    })

    it('devrait identifier un montant négatif', () => {
      const result = formatting.formatAmountWithColor(-123.45)
      expect(result.value).toContain('-123,45')
      expect(result.value).toContain('€')
      expect(result.isNegative).toBe(true)
    })

    it('devrait identifier zéro comme positif', () => {
      const result = formatting.formatAmountWithColor(0)
      expect(result.value).toContain('0,00')
      expect(result.value).toContain('€')
      expect(result.isNegative).toBe(false)
    })
  })

  describe('formatDuration', () => {
    it('devrait formater les minutes seulement', () => {
      expect(formatting.formatDuration(45)).toBe('45min')
    })

    it('devrait formater les heures seulement', () => {
      expect(formatting.formatDuration(120)).toBe('2h')
    })

    it('devrait formater heures et minutes', () => {
      expect(formatting.formatDuration(125)).toBe('2h 5min')
    })

    it('devrait gérer zéro', () => {
      expect(formatting.formatDuration(0)).toBe('0min')
    })

    it('devrait gérer des valeurs négatives', () => {
      expect(formatting.formatDuration(-30)).toBe('0min')
    })

    it('devrait gérer NaN', () => {
      expect(formatting.formatDuration(NaN)).toBe('0min')
    })
  })

  describe('formatFileSize', () => {
    it('devrait formater les bytes', () => {
      expect(formatting.formatFileSize(512)).toBe('512 B')
    })

    it('devrait formater les kilobytes', () => {
      expect(formatting.formatFileSize(1536)).toBe('1.5 KB')
    })

    it('devrait formater les megabytes', () => {
      expect(formatting.formatFileSize(2097152)).toBe('2.0 MB')
    })

    it('devrait gérer zéro', () => {
      expect(formatting.formatFileSize(0)).toBe('0 B')
    })

    it('devrait gérer NaN', () => {
      expect(formatting.formatFileSize(NaN)).toBe('0 B')
    })

    it('devrait formater de très gros fichiers', () => {
      expect(formatting.formatFileSize(1099511627776)).toBe('1.0 TB')
    })
  })

  describe('Validation helpers', () => {
    describe('isValidAmount', () => {
      it('devrait valider un montant correct', () => {
        expect(formatting.isValidAmount(123.45)).toBe(true)
      })

      it('devrait invalider NaN', () => {
        expect(formatting.isValidAmount(NaN)).toBe(false)
      })

      it('devrait invalider Infinity', () => {
        expect(formatting.isValidAmount(Infinity)).toBe(false)
      })

      it('devrait valider zéro', () => {
        expect(formatting.isValidAmount(0)).toBe(true)
      })

      it('devrait valider les nombres négatifs', () => {
        expect(formatting.isValidAmount(-123.45)).toBe(true)
      })
    })

    describe('isValidDate', () => {
      it('devrait valider une date string correcte', () => {
        expect(formatting.isValidDate('2023-12-25')).toBe(true)
      })

      it('devrait valider un objet Date correct', () => {
        expect(formatting.isValidDate(new Date('2023-12-25'))).toBe(true)
      })

      it('devrait invalider une date string incorrecte', () => {
        expect(formatting.isValidDate('invalid-date')).toBe(false)
      })

      it('devrait invalider une valeur vide', () => {
        expect(formatting.isValidDate('')).toBe(false)
      })

      it('devrait invalider null', () => {
        expect(formatting.isValidDate(null as never)).toBe(false)
      })
    })
  })

  describe('Options personnalisées', () => {
    it('devrait utiliser une devise personnalisée', () => {
      const customFormatting = useFormatting({ currency: 'USD' })
      const result = customFormatting.formatAmount(123.45)
      expect(result).toContain('$')
    })

    it('devrait utiliser une locale personnalisée', () => {
      const customFormatting = useFormatting({
        locale: 'en-US',
        currency: 'USD',
      })
      const result = customFormatting.formatAmount(1234.56)
      expect(result).toContain('$1,234.56')
    })

    it('devrait utiliser une précision personnalisée', () => {
      const customFormatting = useFormatting({ precision: 0 })
      const result = customFormatting.formatAmount(123.99)
      expect(result).toContain('124')
      expect(result).toContain('€')
    })
  })
})
