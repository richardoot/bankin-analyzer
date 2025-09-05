/**
 * Composable pour le formatage centralisé
 * Centralise toutes les fonctions de formatage utilisées dans l'application
 */

export interface FormattingOptions {
  locale?: string
  currency?: string
  precision?: number
  showSymbol?: boolean
}

export interface DateFormattingOptions {
  locale?: string
  format?: 'short' | 'medium' | 'long' | 'full' | 'custom'
  timeZone?: string
  includeTime?: boolean
}

/**
 * Composable principal pour le formatage
 */
export const useFormatting = (options: FormattingOptions = {}) => {
  const {
    locale = 'fr-FR',
    currency = 'EUR',
    precision = 2,
    // showSymbol = true, // Réservé pour usage futur
  } = options

  /**
   * Formate un montant en devise
   */
  const formatAmount = (amount: number): string => {
    if (isNaN(amount)) return '0,00 €'

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(amount)
  }

  /**
   * Formate un montant simple sans symbole de devise (pour les calculs ou affichages spéciaux)
   */
  const formatAmountSimple = (amount: number): string => {
    if (isNaN(amount)) return '0,00'

    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(amount)
  }

  /**
   * Formate un montant pour l'export PDF (évite les caractères Unicode)
   */
  const formatAmountForPdf = (amount: number): string => {
    if (isNaN(amount)) return '0.00 EUR'

    // Formatage simple évitant Intl qui génère des caractères Unicode
    const absAmount = Math.abs(amount)
    const integerPart = Math.floor(absAmount)
    const decimalPart = Math.round((absAmount - integerPart) * 100)

    const sign = amount < 0 ? '-' : ''
    const formattedNumber = `${sign}${integerPart}.${decimalPart.toString().padStart(2, '0')}`

    return `${formattedNumber} EUR`
  }

  /**
   * Formate un pourcentage
   */
  const formatPercentage = (value: number, decimals: number = 1): string => {
    if (isNaN(value)) return '0%'

    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value / 100)
  }

  /**
   * Formate un nombre entier avec séparateurs de milliers
   */
  const formatNumber = (value: number): string => {
    if (isNaN(value)) return '0'

    return new Intl.NumberFormat(locale).format(value)
  }

  /**
   * Formate une date
   */
  const formatDate = (
    date: string | Date,
    options: DateFormattingOptions = {}
  ): string => {
    const {
      locale: dateLocale = locale,
      format = 'medium',
      timeZone = 'Europe/Paris',
      includeTime = false,
    } = options

    if (!date) return 'Non défini'

    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date

      if (isNaN(dateObj.getTime())) {
        // Fallback pour les dates string qui ne parsent pas bien
        return typeof date === 'string' ? date : 'Date invalide'
      }

      const formatOptions: Intl.DateTimeFormatOptions = {
        timeZone,
      }

      // Configuration selon le format
      switch (format) {
        case 'short':
          formatOptions.day = '2-digit'
          formatOptions.month = '2-digit'
          formatOptions.year = '2-digit'
          break
        case 'medium':
          formatOptions.day = '2-digit'
          formatOptions.month = '2-digit'
          formatOptions.year = 'numeric'
          break
        case 'long':
          formatOptions.day = 'numeric'
          formatOptions.month = 'long'
          formatOptions.year = 'numeric'
          break
        case 'full':
          formatOptions.weekday = 'long'
          formatOptions.day = 'numeric'
          formatOptions.month = 'long'
          formatOptions.year = 'numeric'
          break
        case 'custom':
          // Format par défaut personnalisable
          formatOptions.day = 'numeric'
          formatOptions.month = 'short'
          formatOptions.year = 'numeric'
          break
      }

      // Ajout de l'heure si demandé
      if (includeTime) {
        formatOptions.hour = '2-digit'
        formatOptions.minute = '2-digit'
      }

      return new Intl.DateTimeFormat(dateLocale, formatOptions).format(dateObj)
    } catch (error) {
      console.warn('Erreur lors du formatage de date:', error)
      return typeof date === 'string' ? date : 'Date invalide'
    }
  }

  /**
   * Formate une date pour l'export PDF
   */
  const formatDateForPdf = (date: Date = new Date()): string => {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  /**
   * Formate une date courte (DD/MM/YYYY)
   */
  const formatDateShort = (date: string | Date): string => {
    return formatDate(date, { format: 'medium' })
  }

  /**
   * Formate une date longue avec le jour de la semaine
   */
  const formatDateLong = (date: string | Date): string => {
    return formatDate(date, { format: 'full' })
  }

  /**
   * Nettoie une chaîne pour la compatibilité PDF jsPDF
   */
  const cleanStringForPdf = (text: string): string => {
    if (!text) return ''

    return (
      text
        // Supprimer tous les caractères non-ASCII (> 127)
        .replace(/[\u0080-\uFFFF]/g, '')
        // Supprimer les caractères étranges spécifiques qui apparaissent dans PDF
        .replace(
          /[ØÜÞÒÄÅÆÇÐÈÉÊËÌÍÎÏÑÓÔÕÖÙÚÛÝàáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ]/g,
          ''
        )
        // Garder seulement les caractères alphanumériques, espaces et ponctuation de base
        .replace(/[^\w\s\-.,()[\]{}:;!?'"/\\€$£¥¢]+/g, '')
        // Supprimer les espaces multiples
        .replace(/\s+/g, ' ')
        // Trim les espaces
        .trim()
    )
  }

  /**
   * Formate un montant avec des couleurs conditionnelles (positif/négatif)
   */
  const formatAmountWithColor = (
    amount: number
  ): { value: string; isNegative: boolean } => {
    return {
      value: formatAmount(amount),
      isNegative: amount < 0,
    }
  }

  /**
   * Formate une durée en heures et minutes
   */
  const formatDuration = (minutes: number): string => {
    if (isNaN(minutes) || minutes < 0) return '0min'

    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (hours === 0) {
      return `${remainingMinutes}min`
    } else if (remainingMinutes === 0) {
      return `${hours}h`
    } else {
      return `${hours}h ${remainingMinutes}min`
    }
  }

  /**
   * Formate une taille de fichier
   */
  const formatFileSize = (bytes: number): string => {
    if (isNaN(bytes) || bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const factor = 1024
    let index = 0

    let size = bytes
    while (size >= factor && index < units.length - 1) {
      size /= factor
      index++
    }

    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
  }

  /**
   * Utilitaires de validation
   */
  const isValidAmount = (amount: number): boolean => {
    return !isNaN(amount) && isFinite(amount)
  }

  const isValidDate = (date: string | Date): boolean => {
    if (!date) return false
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return !isNaN(dateObj.getTime())
  }

  return {
    // Formatage des montants
    formatAmount,
    formatAmountSimple,
    formatAmountForPdf,
    formatAmountWithColor,

    // Formatage des nombres
    formatNumber,
    formatPercentage,

    // Formatage des dates
    formatDate,
    formatDateForPdf,
    formatDateShort,
    formatDateLong,

    // Formatage spécialisé
    formatDuration,
    formatFileSize,

    // Utilitaires
    cleanStringForPdf,

    // Validation
    isValidAmount,
    isValidDate,
  }
}
