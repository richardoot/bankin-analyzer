/**
 * Composable pour l'export PDF des remboursements
 * Fournit les fonctions utilitaires pour generer des PDF a partir des donnees de remboursement
 */

import jsPDF from 'jspdf'

export interface ReimbursementData {
  person: string
  amount: number
  status: 'valide' | 'en_attente'
  personId: string
}

export interface TransactionDetail {
  date: string
  description: string
  note?: string
  baseAmount: number
  reimbursementAmount: number
}

export interface DetailedReimbursementData {
  personId: string
  personName: string
  categories: Array<{
    categoryName: string
    amount: number
    transactions?: TransactionDetail[]
  }>
  totalAmount: number
  status: 'valide' | 'en_attente'
}

export interface CategoryReimbursementData {
  category: string
  total: number
  persons: Array<{
    person: string
    amount: number
    personId: string
  }>
}

/**
 * Hook principal pour l'export PDF
 */
export const usePdfExport = () => {
  /**
   * Formate une date pour l'affichage
   */
  const formatDate = (date: Date = new Date()): string => {
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  /**
   * Nettoie une chaîne de caractères pour la compatibilité PDF jsPDF
   */
  const cleanStringForPdf = (text: string): string => {
    if (!text) return ''

    try {
      return (
        text
          // Remplacer les caractères accentués par leurs équivalents
          .replace(/[àáâãäå]/g, 'a')
          .replace(/[èéêë]/g, 'e')
          .replace(/[ìíîï]/g, 'i')
          .replace(/[òóôõö]/g, 'o')
          .replace(/[ùúûü]/g, 'u')
          .replace(/[ç]/g, 'c')
          .replace(/[ñ]/g, 'n')
          // Supprimer les caractères non-ASCII restants
          .replace(/[^\u0020-\u007F]/g, '')
          // Garder seulement les caractères sûrs
          .replace(/[^\w\s\-.,()€$]/g, ' ')
          // Supprimer les espaces multiples
          .replace(/\s+/g, ' ')
          // Trim les espaces
          .trim()
      )
    } catch (error) {
      console.error('Erreur dans cleanStringForPdf:', error, 'Text:', text)
      return String(text).substring(0, 50) // Fallback sécurisé
    }
  }

  /**
   * Formate un montant en euros (compatible PDF)
   */
  const formatAmount = (amount: number): string => {
    try {
      if (typeof amount !== 'number' || isNaN(amount)) {
        console.warn('formatAmount: montant invalide', amount)
        return '0.00 EUR'
      }

      // Formatage simple en évitant Intl qui génère des caractères Unicode
      const absAmount = Math.abs(amount)
      const integerPart = Math.floor(absAmount)
      const decimalPart = Math.round((absAmount - integerPart) * 100)

      const sign = amount < 0 ? '-' : ''
      const formattedNumber = `${sign}${integerPart}.${decimalPart.toString().padStart(2, '0')}`

      return cleanStringForPdf(`${formattedNumber} EUR`)
    } catch (error) {
      console.error('Erreur dans formatAmount:', error, 'Amount:', amount)
      return '0.00 EUR'
    }
  }

  /**
   * Exporte les donnees de remboursement en PDF multipages
   */
  const exportToPdf = async (
    reimbursementData: ReimbursementData[],
    detailedData: DetailedReimbursementData[],
    categoryData: Map<string, CategoryReimbursementData>,
    filename = 'remboursements-bankin-analyzer'
  ): Promise<void> => {
    try {
      console.log('=== DEBUT EXPORT PDF ===')
      console.log('reimbursementData:', reimbursementData)
      console.log('detailedData:', detailedData)
      console.log('categoryData:', categoryData)

      // Validation des données d'entrée
      if (!reimbursementData || reimbursementData.length === 0) {
        console.warn('Aucune donnée de remboursement à exporter')
        throw new Error('Aucune donnée de remboursement à exporter')
      }

      if (!detailedData || detailedData.length === 0) {
        console.warn('Aucune donnée détaillée à exporter')
        throw new Error('Aucune donnée détaillée à exporter')
      }

      // Calculer les totaux
      const totalAmount = reimbursementData.reduce(
        (sum, item) => sum + item.amount,
        0
      )
      console.log('Total amount:', totalAmount)

      const exportDate = new Date()

      // Créer le PDF multipages avec jsPDF - version stable
      await createMultiPagePdfStable(
        reimbursementData,
        detailedData,
        categoryData,
        totalAmount,
        exportDate,
        filename
      )

      console.log('=== EXPORT PDF REUSSI ===')
    } catch (error) {
      console.error('=== ERREUR EXPORT PDF ===')
      console.error('Error details:', error)
      console.error(
        'Stack trace:',
        error instanceof Error ? error.stack : 'No stack trace'
      )

      // Re-throw avec message plus informatif
      if (error instanceof Error) {
        throw new Error(`Erreur PDF: ${error.message}`)
      } else {
        throw new Error('Erreur inconnue lors de la génération du PDF')
      }
    }
  }

  /**
   * Previsualise le contenu qui sera exporte en PDF
   */
  const previewPdfContent = (
    reimbursementData: ReimbursementData[],
    detailedData: DetailedReimbursementData[],
    categoryData: Map<string, CategoryReimbursementData>
  ): void => {
    console.log('Preview PDF Content:', {
      reimbursementData,
      detailedData,
      categoryData,
    })
  }

  /**
   * Version stable du PDF multipages basée sur les principes qui fonctionnent
   */
  const createMultiPagePdfStable = async (
    reimbursementData: ReimbursementData[],
    detailedData: DetailedReimbursementData[],
    categoryData: Map<string, CategoryReimbursementData>,
    totalAmount: number,
    exportDate: Date,
    filename: string
  ): Promise<void> => {
    try {
      console.log('Création PDF stable - Début')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 20

      // PAGE 1: Résumé Global
      console.log('Création page résumé global...')
      createGlobalSummaryPageStable(
        pdf,
        reimbursementData,
        totalAmount,
        exportDate,
        margin,
        pageWidth,
        pageHeight
      )

      // PAGES 2+: Pages détaillées par personne
      console.log(`Création ${detailedData.length} pages détaillées...`)
      for (const person of detailedData) {
        console.log(`Création page pour ${person.personName}`)
        pdf.addPage()
        createPersonDetailPageStable(pdf, person, margin, pageWidth, pageHeight)
      }

      // Sauvegarder le PDF
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[-:]/g, '')
      const finalFilename = `${filename}-${timestamp}.pdf`
      console.log('Sauvegarde PDF:', finalFilename)

      pdf.save(finalFilename)
      console.log('PDF sauvegardé avec succès')
    } catch (error) {
      console.error('Erreur dans createMultiPagePdfStable:', error)
      throw error
    }
  }

  /**
   * Page résumé global - Version stable
   */
  const createGlobalSummaryPageStable = (
    pdf: jsPDF,
    reimbursementData: ReimbursementData[],
    totalAmount: number,
    exportDate: Date,
    margin: number,
    pageWidth: number,
    pageHeight: number
  ): void => {
    try {
      let yPos = margin

      // En-tête principal
      pdf.setFontSize(18)
      pdf.text('RAPPORT DE REMBOURSEMENTS', margin, yPos)
      yPos += 10

      pdf.setFontSize(10)
      const day = exportDate.getDate().toString().padStart(2, '0')
      const month = (exportDate.getMonth() + 1).toString().padStart(2, '0')
      const year = exportDate.getFullYear()
      const dateText = `Genere le ${day}/${month}/${year}`
      pdf.text(dateText, margin, yPos)
      yPos += 15

      // Ligne de séparation
      pdf.line(margin, yPos, pageWidth - margin, yPos)
      yPos += 10

      // Montant total
      pdf.setFontSize(14)
      pdf.text('MONTANT TOTAL A REMBOURSER', margin, yPos)
      yPos += 8

      pdf.setFontSize(16)
      const totalFormatted = String(Math.abs(totalAmount).toFixed(2)) + ' EUR'
      pdf.text(totalFormatted, margin, yPos)
      yPos += 15

      // Nombre de personnes
      pdf.setFontSize(10)
      pdf.text(
        `${reimbursementData.length} personne(s) concernee(s)`,
        margin,
        yPos
      )
      yPos += 15

      // Liste des personnes
      pdf.setFontSize(12)
      pdf.text('QUI DOIT COMBIEN ?', margin, yPos)
      yPos += 10

      // En-têtes
      pdf.setFontSize(10)
      pdf.text('PERSONNE', margin, yPos)
      pdf.text('MONTANT', pageWidth - margin - 40, yPos)
      yPos += 5

      // Ligne sous les en-têtes
      pdf.line(margin, yPos, pageWidth - margin, yPos)
      yPos += 8

      // Liste des personnes triée
      const sortedData = [...reimbursementData].sort(
        (a, b) => b.amount - a.amount
      )

      sortedData.forEach(item => {
        if (yPos > pageHeight - 30) {
          pdf.addPage()
          yPos = margin + 20
        }

        // Nom de la personne (nettoyé)
        const personName = String(item.person || 'Inconnu')
          .replace(/[àáâãäå]/g, 'a')
          .replace(/[èéêë]/g, 'e')
          .replace(/[ìíîï]/g, 'i')
          .replace(/[òóôõö]/g, 'o')
          .replace(/[ùúûü]/g, 'u')
          .replace(/[ç]/g, 'c')
          .replace(/[ñ]/g, 'n')
          .substring(0, 30)
        pdf.text(personName, margin, yPos)

        // Montant
        const amountFormatted =
          String(Math.abs(item.amount).toFixed(2)) + ' EUR'
        pdf.text(amountFormatted, pageWidth - margin - 40, yPos)

        // Statut
        const status = item.status === 'valide' ? 'PAYE' : 'EN ATTENTE'
        pdf.text(status, pageWidth - margin - 15, yPos)

        yPos += 8
      })

      // Footer
      pdf.setFontSize(8)
      pdf.text('Page 1 - Resume Global', margin, pageHeight - 10)
      pdf.text('Bankin Analyzer', pageWidth - margin - 25, pageHeight - 10)
    } catch (error) {
      console.error('Erreur dans createGlobalSummaryPageStable:', error)
      throw error
    }
  }

  /**
   * Page détaillée par personne - Version stable
   */
  const createPersonDetailPageStable = (
    pdf: jsPDF,
    person: DetailedReimbursementData,
    margin: number,
    pageWidth: number,
    pageHeight: number
  ): void => {
    try {
      let yPos = margin

      // En-tête de la personne
      pdf.setFontSize(14)
      const cleanPersonName = String(person.personName)
        .replace(/[àáâãäå]/g, 'a')
        .replace(/[èéêë]/g, 'e')
        .replace(/[ìíîï]/g, 'i')
        .replace(/[òóôõö]/g, 'o')
        .replace(/[ùúûü]/g, 'u')
        .replace(/[ç]/g, 'c')
        .replace(/[ñ]/g, 'n')
        .substring(0, 25)
      const personTitle = `REMBOURSEMENTS - ${cleanPersonName}`
      pdf.text(personTitle, margin, yPos)
      yPos += 8

      pdf.setFontSize(12)
      const totalFormatted =
        String(Math.abs(person.totalAmount).toFixed(2)) + ' EUR'
      pdf.text(totalFormatted, margin, yPos)
      yPos += 15

      // Titre catégories
      pdf.setFontSize(12)
      pdf.text('REPARTITION PAR CATEGORIE', margin, yPos)
      yPos += 12

      // Boucle sur les catégories
      person.categories.forEach(category => {
        const estimatedHeight = 20 + (category.transactions?.length || 0) * 6
        if (yPos + estimatedHeight > pageHeight - 30) {
          pdf.addPage()
          yPos = margin + 15
          pdf.setFontSize(12)
          const cleanPersonNameSuite = String(person.personName)
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/[ç]/g, 'c')
            .replace(/[ñ]/g, 'n')
            .substring(0, 20)
          pdf.text(`${cleanPersonNameSuite} (suite)`, margin, yPos)
          yPos += 15
        }

        // Nom de la catégorie
        pdf.setFontSize(11)
        const categoryName = String(category.categoryName)
          .replace(/[àáâãäå]/g, 'a')
          .replace(/[èéêë]/g, 'e')
          .replace(/[ìíîï]/g, 'i')
          .replace(/[òóôõö]/g, 'o')
          .replace(/[ùúûü]/g, 'u')
          .replace(/[ç]/g, 'c')
          .replace(/[ñ]/g, 'n')
          .replace(/[^\u0020-\u007F]/g, '') // Supprimer tous les caractères non-ASCII (y compris emojis)
          .trim()
          .substring(0, 30)
        pdf.text(categoryName, margin, yPos)

        // Montant de la catégorie
        const categoryAmount =
          String(Math.abs(category.amount).toFixed(2)) + ' EUR'
        pdf.text(categoryAmount, pageWidth - margin - 40, yPos)
        yPos += 10

        // Transactions
        if (category.transactions && category.transactions.length > 0) {
          pdf.setFontSize(8)
          pdf.text(
            `${category.transactions.length} transaction(s):`,
            margin + 5,
            yPos
          )
          yPos += 5

          category.transactions.forEach(transaction => {
            if (yPos > pageHeight - 20) {
              pdf.addPage()
              yPos = margin + 10
            }

            // Date
            const transactionDate = String(transaction.date).substring(0, 10)
            pdf.text(transactionDate, margin + 8, yPos)

            // Montant
            const transactionAmount =
              String(Math.abs(transaction.reimbursementAmount).toFixed(2)) +
              ' EUR'
            pdf.text(transactionAmount, pageWidth - margin - 35, yPos)
            yPos += 4

            // Description
            const description = String(transaction.description || '')
              .replace(/[àáâãäå]/g, 'a')
              .replace(/[èéêë]/g, 'e')
              .replace(/[ìíîï]/g, 'i')
              .replace(/[òóôõö]/g, 'o')
              .replace(/[ùúûü]/g, 'u')
              .replace(/[ç]/g, 'c')
              .replace(/[ñ]/g, 'n')
              .replace(/[^\u0020-\u007F]/g, '') // Supprimer tous les caractères non-ASCII
              .substring(0, 60)
            pdf.text(description, margin + 10, yPos)
            yPos += 6
          })
        } else {
          pdf.setFontSize(8)
          pdf.text('Aucun detail de transaction disponible', margin + 8, yPos)
          yPos += 6
        }

        yPos += 8
      })

      // Total final
      if (yPos < pageHeight - 25) {
        pdf.line(margin, yPos, pageWidth - margin, yPos)
        yPos += 8

        pdf.setFontSize(10)
        const finalPersonName = String(person.personName)
          .replace(/[àáâãäå]/g, 'a')
          .replace(/[èéêë]/g, 'e')
          .replace(/[ìíîï]/g, 'i')
          .replace(/[òóôõö]/g, 'o')
          .replace(/[ùúûü]/g, 'u')
          .replace(/[ç]/g, 'c')
          .replace(/[ñ]/g, 'n')
          .toUpperCase()
          .substring(0, 20)
        const finalTitle = `TOTAL A REMBOURSER A ${finalPersonName}`
        pdf.text(finalTitle, margin, yPos)
        yPos += 6

        pdf.setFontSize(12)
        const finalAmount =
          String(Math.abs(person.totalAmount).toFixed(2)) + ' EUR'
        pdf.text(finalAmount, margin, yPos)
      }

      // Footer
      pdf.setFontSize(8)
      const footerPersonName = String(person.personName)
        .replace(/[àáâãäå]/g, 'a')
        .replace(/[èéêë]/g, 'e')
        .replace(/[ìíîï]/g, 'i')
        .replace(/[òóôõö]/g, 'o')
        .replace(/[ùúûü]/g, 'u')
        .replace(/[ç]/g, 'c')
        .replace(/[ñ]/g, 'n')
        .substring(0, 20)
      const footerText = `Detail - ${footerPersonName}`
      pdf.text(footerText, margin, pageHeight - 10)
      pdf.text('Bankin Analyzer', pageWidth - margin - 25, pageHeight - 10)
    } catch (error) {
      console.error(
        `Erreur dans createPersonDetailPageStable pour ${person.personName}:`,
        error
      )
      throw error
    }
  }

  return {
    exportToPdf,
    previewPdfContent,
    formatAmount,
    formatDate,
  }
}
