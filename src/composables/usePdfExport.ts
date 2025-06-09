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
   * Formate un montant en euros (compatible PDF)
   */
  const formatAmount = (amount: number): string => {
    // Formatage simple en évitant Intl qui génère des caractères Unicode
    const absAmount = Math.abs(amount)
    const integerPart = Math.floor(absAmount)
    const decimalPart = Math.round((absAmount - integerPart) * 100)

    const sign = amount < 0 ? '-' : ''
    const formattedNumber = `${sign}${integerPart}.${decimalPart.toString().padStart(2, '0')}`

    return cleanStringForPdf(`${formattedNumber} EUR`)
  }

  /**
   * Formate un montant simple pour les cartes (sans EUR)
   */
  const formatAmountSimple = (amount: number): string => {
    const absAmount = Math.abs(amount)
    const integerPart = Math.floor(absAmount)
    const decimalPart = Math.round((absAmount - integerPart) * 100)

    const sign = amount < 0 ? '-' : ''
    const formattedNumber = `${sign}${integerPart}.${decimalPart.toString().padStart(2, '0')}`

    return cleanStringForPdf(formattedNumber)
  }

  /**
   * Formate les dates de transaction de manière robuste pour l'export PDF
   * Gère à la fois les formats ISO (YYYY-MM-DD) et français (DD/MM/YYYY)
   */
  const formatTransactionDate = (dateStr: string): string => {
    try {
      let date: Date | null = null

      // Format ISO YYYY-MM-DD (fichiers de test)
      if (dateStr.includes('-') && dateStr.length === 10) {
        date = new Date(dateStr)
      }
      // Format français DD/MM/YYYY (Bankin)
      else if (dateStr.includes('/')) {
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          const [day, month, year] = parts
          if (day && month && year) {
            date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          }
        }
      }

      // Si la date est valide, la formater en français
      if (date && !isNaN(date.getTime())) {
        return date.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      }

      // En cas d'échec, retourner la date originale
      return dateStr
    } catch (_error) {
      return dateStr
    }
  }

  /**
   * Genere le HTML pour le PDF
   */
  const generatePdfHtml = (
    reimbursementData: ReimbursementData[],
    detailedData: DetailedReimbursementData[],
    categoryData: Map<string, CategoryReimbursementData>,
    exportDate: Date = new Date()
  ): string => {
    const totalAmount = reimbursementData.reduce(
      (sum, item) => sum + item.amount,
      0
    )
    const categoryTotals = Array.from(categoryData.entries()).map(
      ([category, data]) => ({
        category,
        total: data.total,
      })
    )

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rapport de Remboursements - Bankin Analyzer</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background: #ffffff;
            padding: 1.5rem;
          }

          /* Styles pour l'impression PDF */
          @media print {
            body {
              padding: 1rem;
            }

            .detailed-person {
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .category-item {
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .transaction-list {
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .section {
              page-break-before: auto;
              page-break-after: auto;
            }

            .section-title {
              page-break-after: avoid;
            }
          }

          .header {
            text-align: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 3px solid #3b82f6;
          }

          .header h1 {
            font-size: 2rem;
            color: #1f2937;
            margin-bottom: 0.5rem;
          }

          .header .subtitle {
            color: #6b7280;
            font-size: 1rem;
          }

          .header .date {
            color: #9ca3af;
            font-size: 0.875rem;
            margin-top: 0.5rem;
          }

          .summary-section {
            background: #f8fafc;
            border-radius: 0.75rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
            border: 1px solid #e5e7eb;
          }

          .summary-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .summary-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
          }

          .stat-card {
            background: white;
            padding: 1rem;
            border-radius: 0.5rem;
            border: 1px solid #e5e7eb;
            text-align: center;
          }

          .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #059669;
          }

          .stat-label {
            font-size: 0.875rem;
            color: #6b7280;
            margin-top: 0.25rem;
          }

          .section {
            margin-bottom: 2.5rem;
            page-break-inside: auto;
          }

          .section-title {
            font-size: 1.125rem;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid #e5e7eb;
            page-break-after: avoid;
          }

          .reimbursement-list {
            background: white;
            border-radius: 0.5rem;
            border: 1px solid #e5e7eb;
            overflow: hidden;
          }

          .reimbursement-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #f3f4f6;
          }

          .reimbursement-item:last-child {
            border-bottom: none;
          }

          .person-info {
            display: flex;
            align-items: center;
            gap: 1rem;
          }

          .person-avatar {
            width: 2.5rem;
            height: 2.5rem;
            border-radius: 50%;
            background: #3b82f6;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 1rem;
          }

          .person-details {
            display: flex;
            flex-direction: column;
          }

          .person-name {
            font-weight: 600;
            color: #1f2937;
          }

          .person-status {
            font-size: 0.75rem;
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            font-weight: 500;
            margin-top: 0.25rem;
            display: inline-block;
            width: fit-content;
          }

          .person-status.valide {
            background: #d1fae5;
            color: #047857;
          }

          .person-status.en_attente {
            background: #fef3c7;
            color: #92400e;
          }

          .amount {
            font-size: 1.125rem;
            font-weight: 700;
            color: #1f2937;
          }

          .detailed-person {
            background: white;
            border-radius: 0.5rem;
            border: 1px solid #e5e7eb;
            margin-bottom: 1.5rem;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .person-header {
            background: #f8fafc;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #e5e7eb;
            page-break-after: avoid;
          }

          .person-summary {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .person-total {
            font-size: 1.25rem;
            font-weight: 700;
            color: #059669;
          }

          .category-item {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #f3f4f6;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .category-item:last-child {
            border-bottom: none;
          }

          .category-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
            page-break-after: avoid;
          }

          .category-name {
            font-weight: 500;
            color: #374151;
          }

          .category-amount {
            font-weight: 600;
            color: #059669;
          }

          .transaction-list {
            margin-top: 0.75rem;
            padding-left: 1rem;
            border-left: 3px solid #e5e7eb;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .transaction-item {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 0.5rem 0;
            border-bottom: 1px solid #f9fafb;
            gap: 1rem;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .transaction-item:last-child {
            border-bottom: none;
          }

          .transaction-info {
            flex: 1;
          }

          .transaction-date {
            font-size: 0.875rem;
            color: #6b7280;
            font-weight: 500;
          }

          .transaction-description {
            font-weight: 500;
            color: #374151;
            margin: 0.25rem 0;
          }

          .transaction-note {
            font-size: 0.875rem;
            color: #6b7280;
            font-style: italic;
          }

          .transaction-amounts {
            text-align: right;
          }

          .base-amount {
            font-size: 0.875rem;
            color: #6b7280;
            margin-bottom: 0.25rem;
          }

          .reimbursement-amount {
            font-weight: 600;
            color: #059669;
          }

          .category-section {
            background: white;
            border-radius: 0.5rem;
            border: 1px solid #e5e7eb;
            margin-bottom: 1.5rem;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .category-header {
            background: #f8fafc;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #e5e7eb;
          }

          .category-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .category-total {
            font-weight: 700;
            color: #059669;
          }

          .footer {
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 0.875rem;
          }

          @media print {
            body {
              padding: 1rem;
            }

            .summary-stats {
              grid-template-columns: repeat(2, 1fr);
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${cleanStringForPdf('RAPPORT DE REMBOURSEMENTS')}</h1>
          <div class="subtitle">${cleanStringForPdf('Bankin Analyzer - Analyse Financiere')}</div>
          <div class="date">${cleanStringForPdf(`Genere le ${formatDate(exportDate)}`)}</div>
        </div>

        <div class="summary-section">
          <h2 class="summary-title">${cleanStringForPdf('RESUME GENERAL')}</h2>
          <div class="summary-stats">
            <div class="stat-card">
              <div class="stat-value">${formatAmount(totalAmount)}</div>
              <div class="stat-label">${cleanStringForPdf('Montant Total')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${reimbursementData.length}</div>
              <div class="stat-label">${cleanStringForPdf('Personnes Concernees')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${categoryTotals.length}</div>
              <div class="stat-label">${cleanStringForPdf('Categories')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${reimbursementData.filter(r => r.status === 'en_attente').length}</div>
              <div class="stat-label">${cleanStringForPdf('En Attente')}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">${cleanStringForPdf('APERCU DES REMBOURSEMENTS PAR PERSONNE')}</h2>
          <div class="reimbursement-list">
            ${reimbursementData
              .map(
                item => `
              <div class="reimbursement-item">
                <div class="person-info">
                  <div class="person-avatar">${cleanStringForPdf(item.person.charAt(0).toUpperCase())}</div>
                  <div class="person-details">
                    <div class="person-name">${cleanStringForPdf(item.person)}</div>
                    <span class="person-status ${item.status}">
                      ${cleanStringForPdf(item.status === 'valide' ? 'Valide' : 'En attente')}
                    </span>
                  </div>
                </div>
                <div class="amount">${formatAmount(item.amount)}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">${cleanStringForPdf('DETAIL PAR PERSONNE AVEC CATEGORIES')}</h2>
          ${detailedData
            .map(
              person => `
            <div class="detailed-person">
              <div class="person-header">
                <div class="person-summary">
                  <div class="person-info">
                    <div class="person-avatar">${cleanStringForPdf(person.personName.charAt(0).toUpperCase())}</div>
                    <div class="person-details">
                      <div class="person-name">${cleanStringForPdf(person.personName)}</div>
                      <div style="font-size: 0.875rem; color: #6b7280;">
                        ${person.categories.length} ${cleanStringForPdf('categorie(s)')}
                      </div>
                    </div>
                  </div>
                  <div class="person-total">${formatAmount(person.totalAmount)}</div>
                </div>
              </div>
              <div class="categories">
                ${person.categories
                  .map(
                    category => `
                  <div class="category-item">
                    <div class="category-header">
                      <div class="category-name">${cleanStringForPdf(category.categoryName)}</div>
                      <div class="category-amount">${formatAmount(category.amount)}</div>
                    </div>
                    ${
                      category.transactions && category.transactions.length > 0
                        ? `
                      <div class="transaction-list">
                        ${category.transactions
                          .map(
                            transaction => `
                          <div class="transaction-item">
                            <div class="transaction-info">
                              <div class="transaction-date">${formatTransactionDate(transaction.date)}</div>
                              <div class="transaction-description">${cleanStringForPdf(transaction.description)}</div>
                              ${transaction.note ? `<div class="transaction-note">${cleanStringForPdf(transaction.note)}</div>` : ''}
                            </div>
                            <div class="transaction-amounts">
                              <div class="base-amount">${cleanStringForPdf('Montant')}: ${formatAmount(transaction.baseAmount)}</div>
                              <div class="reimbursement-amount">${cleanStringForPdf('A rembourser')}: ${formatAmount(transaction.reimbursementAmount)}</div>
                            </div>
                          </div>
                        `
                          )
                          .join('')}
                      </div>
                    `
                        : ''
                    }
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <div class="section">
          <h2 class="section-title">${cleanStringForPdf('REMBOURSEMENTS PAR CATEGORIE')}</h2>
          ${Array.from(categoryData.entries())
            .map(
              ([category, data]) => `
            <div class="category-section">
              <div class="category-header">
                <div class="category-title">
                  <div class="category-name">${cleanStringForPdf(category)}</div>
                  <div class="category-total">${formatAmount(data.total)}</div>
                </div>
              </div>
              <div class="category-persons">
                ${data.persons
                  .map(
                    person => `
                  <div class="category-item">
                    <div class="person-info">
                      <div class="person-avatar" style="width: 2rem; height: 2rem; font-size: 0.875rem;">
                        ${cleanStringForPdf(person.person.charAt(0).toUpperCase())}
                      </div>
                      <div class="person-name" style="margin-left: 0.5rem;">${cleanStringForPdf(person.person)}</div>
                    </div>
                    <div class="category-amount">${formatAmount(person.amount)}</div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <div class="footer">
          <p>${cleanStringForPdf('Rapport genere par Bankin Analyzer')}</p>
          <p>${cleanStringForPdf('Ce document contient des informations confidentielles')}</p>
        </div>
      </body>
      </html>
    `
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
      // Calculer les totaux
      const totalAmount = reimbursementData.reduce(
        (sum, item) => sum + item.amount,
        0
      )
      const exportDate = new Date()

      // Creer le PDF multipages avec jsPDF directement
      await createMultiPagePdf(
        reimbursementData,
        detailedData,
        categoryData,
        totalAmount,
        exportDate,
        filename
      )
    } catch (error) {
      console.error('Erreur lors de la generation PDF:', error)
      throw new Error('Impossible de generer le PDF. Veuillez reessayer.')
    }
  }

  /**
   * Cree un PDF multipages avec sections distinctes
   */
  const createMultiPagePdf = async (
    reimbursementData: ReimbursementData[],
    detailedData: DetailedReimbursementData[],
    categoryData: Map<string, CategoryReimbursementData>,
    totalAmount: number,
    exportDate: Date,
    filename: string
  ): Promise<void> => {
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - 2 * margin

    // PAGE 1: Resume General
    await createSummaryPage(
      pdf,
      reimbursementData,
      totalAmount,
      exportDate,
      margin,
      pageWidth,
      contentWidth,
      pageHeight
    )

    // PAGE 2: Apercu par Personne
    pdf.addPage()
    await createPersonOverviewPage(
      pdf,
      reimbursementData,
      margin,
      pageWidth,
      contentWidth,
      pageHeight
    )

    // PAGES 3+: Detail par Personne (chaque personne sur une nouvelle page)
    for (const person of detailedData) {
      pdf.addPage()
      createPersonDetailPage(
        pdf,
        person,
        margin,
        pageWidth,
        contentWidth,
        pageHeight
      )
    }

    // DERNIERE PAGE: Resume par Categorie
    if (categoryData.size > 0) {
      pdf.addPage()
      createCategoryPage(
        pdf,
        categoryData,
        margin,
        pageWidth,
        contentWidth,
        pageHeight
      )
    }

    // Sauvegarder le PDF
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
    pdf.save(`${filename}-${timestamp}.pdf`)
  }

  /**
   * Page 1: Resume General
   */
  const createSummaryPage = async (
    pdf: jsPDF,
    reimbursementData: ReimbursementData[],
    totalAmount: number,
    exportDate: Date,
    margin: number,
    pageWidth: number,
    contentWidth: number,
    pageHeight: number
  ): Promise<void> => {
    let yPos = margin

    // En-tete avec logo
    pdf.setFontSize(28)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(31, 41, 55) // text-gray-800
    pdf.text(cleanStringForPdf('RAPPORT DE REMBOURSEMENTS'), margin, yPos)
    yPos += 12

    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(107, 114, 128) // text-gray-500
    pdf.text(
      cleanStringForPdf('Bankin Analyzer - Analyse Financiere'),
      margin,
      yPos
    )
    yPos += 8

    pdf.setFontSize(12)
    pdf.text(
      cleanStringForPdf(`Genere le ${formatDate(exportDate)}`),
      margin,
      yPos
    )
    yPos += 25

    // Ligne de separation
    pdf.setDrawColor(59, 130, 246) // blue-500
    pdf.setLineWidth(0.8)
    pdf.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 15

    // Section statistiques generales
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(31, 41, 55)
    pdf.text(cleanStringForPdf('RESUME GENERAL'), margin, yPos)
    yPos += 20

    // Cartes de statistiques (2x2)
    const stats = [
      {
        label: cleanStringForPdf('Montant Total'),
        value: formatAmountSimple(totalAmount),
        icon: '[EUR]',
      },
      {
        label: cleanStringForPdf('Personnes Concernees'),
        value: reimbursementData.length.toString(),
        icon: '[PPL]',
      },
      {
        label: cleanStringForPdf('En Attente'),
        value: reimbursementData
          .filter(r => r.status === 'en_attente')
          .length.toString(),
        icon: '[ATT]',
      },
      {
        label: cleanStringForPdf('Valides'),
        value: reimbursementData
          .filter(r => r.status === 'valide')
          .length.toString(),
        icon: '[VAL]',
      },
    ]

    const cardWidth = contentWidth / 2 - 5
    const cardHeight = 30

    stats.forEach((stat, index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const xPos = margin + col * (cardWidth + 10)
      const yOffset = row * (cardHeight + 10)

      // Cadre de la carte
      pdf.setDrawColor(229, 231, 235) // gray-200
      pdf.setFillColor(248, 250, 252) // gray-50
      pdf.roundedRect(xPos, yPos + yOffset, cardWidth, cardHeight, 2, 2, 'FD')

      // Icone (position en haut à gauche)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(75, 85, 99) // gray-600
      pdf.text(cleanStringForPdf(stat.icon), xPos + 5, yPos + yOffset + 10)

      // Valeur (position principale, plus grande)
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(5, 150, 105) // green-600
      pdf.text(cleanStringForPdf(stat.value), xPos + 5, yPos + yOffset + 18)

      // Label (position en bas, plus petite)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(107, 114, 128) // gray-500
      pdf.text(cleanStringForPdf(stat.label), xPos + 5, yPos + yOffset + 26)
    })

    yPos += 80

    // Top 3 des remboursements
    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(31, 41, 55)
    pdf.text(cleanStringForPdf('TOP 3 DES REMBOURSEMENTS'), margin, yPos)
    yPos += 15

    const topReimbursements = reimbursementData
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)

    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'normal')

    topReimbursements.forEach((item, index) => {
      yPos += 10

      // Position badge
      pdf.setFillColor(59, 130, 246) // blue-500
      pdf.circle(margin + 5, yPos - 2, 3, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(8)
      pdf.text((index + 1).toString(), margin + 3.5, yPos + 1)

      // Nom
      pdf.setTextColor(31, 41, 55)
      pdf.setFontSize(11)
      pdf.text(cleanStringForPdf(item.person), margin + 15, yPos)

      // Montant
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(5, 150, 105)
      pdf.text(formatAmount(item.amount), pageWidth - margin - 40, yPos)

      // Statut
      pdf.setFont('helvetica', 'normal')
      pdf.text(
        cleanStringForPdf(item.status === 'valide' ? '[OK]' : '[ATT]'),
        pageWidth - margin - 15,
        yPos
      )
    })

    // Footer de page
    yPos = pageHeight - 20
    pdf.setFontSize(8)
    pdf.setTextColor(156, 163, 175) // gray-400
    pdf.text(cleanStringForPdf('Page 1 - Resume General'), margin, yPos)
    pdf.text(
      cleanStringForPdf('Bankin Analyzer'),
      pageWidth - margin - 25,
      yPos
    )
  }

  /**
   * Page 2: Apercu par Personne
   */
  const createPersonOverviewPage = async (
    pdf: jsPDF,
    reimbursementData: ReimbursementData[],
    margin: number,
    pageWidth: number,
    contentWidth: number,
    pageHeight: number
  ): Promise<void> => {
    let yPos = margin

    // Titre de la page
    pdf.setFontSize(22)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(31, 41, 55)
    pdf.text(
      cleanStringForPdf('APERCU DES REMBOURSEMENTS PAR PERSONNE'),
      margin,
      yPos
    )
    yPos += 25

    // En-tetes du tableau
    pdf.setFillColor(248, 250, 252) // gray-50
    pdf.rect(margin, yPos, contentWidth, 10, 'F')

    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(75, 85, 99) // gray-600
    pdf.text(cleanStringForPdf('Personne'), margin + 5, yPos + 7)
    pdf.text(cleanStringForPdf('Montant'), pageWidth - margin - 50, yPos + 7)
    pdf.text(cleanStringForPdf('Statut'), pageWidth - margin - 20, yPos + 7)
    yPos += 15

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)

    reimbursementData.forEach((item, index) => {
      if (yPos > pageHeight - 30) {
        // Nouvelle page si necessaire
        pdf.addPage()
        yPos = margin + 20

        // Repeter les en-tetes
        pdf.setFillColor(248, 250, 252)
        pdf.rect(margin, yPos, contentWidth, 10, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(12)
        pdf.text(cleanStringForPdf('Personne'), margin + 5, yPos + 7)
        pdf.text(
          cleanStringForPdf('Montant'),
          pageWidth - margin - 50,
          yPos + 7
        )
        pdf.text(cleanStringForPdf('Statut'), pageWidth - margin - 20, yPos + 7)
        yPos += 15

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
      }

      // Ligne alternee
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251) // gray-50
        pdf.rect(margin, yPos - 3, contentWidth, 8, 'F')
      }

      // Donnees de la ligne
      pdf.setTextColor(31, 41, 55)
      pdf.text(cleanStringForPdf(item.person), margin + 5, yPos + 2)

      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(5, 150, 105) // green-600
      pdf.text(formatAmount(item.amount), pageWidth - margin - 50, yPos + 2)

      pdf.setFont('helvetica', 'normal')
      pdf.text(
        cleanStringForPdf(item.status === 'valide' ? '[VAL]' : '[ATT]'),
        pageWidth - margin - 20,
        yPos + 2
      )

      yPos += 10
    })

    // Footer de page
    pdf.setFontSize(8)
    pdf.setTextColor(156, 163, 175)
    pdf.text(
      cleanStringForPdf('Page 2 - Apercu par Personne'),
      margin,
      pageHeight - 10
    )
    pdf.text(
      cleanStringForPdf('Bankin Analyzer'),
      pageWidth - margin - 25,
      pageHeight - 10
    )
  }

  /**
   * Pages 3+: Detail par Personne
   */
  const createPersonDetailPage = async (
    pdf: jsPDF,
    person: DetailedReimbursementData,
    margin: number,
    pageWidth: number,
    contentWidth: number,
    pageHeight: number
  ): Promise<void> => {
    let yPos = margin

    // En-tete de la personne
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(31, 41, 55)
    pdf.text(cleanStringForPdf(`DETAIL - ${person.personName}`), margin, yPos)
    yPos += 15

    // Total de la personne
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(107, 114, 128)
    pdf.text(cleanStringForPdf(`Total des remboursements: `), margin, yPos)

    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(5, 150, 105)
    pdf.text(formatAmount(person.totalAmount), margin + 60, yPos)
    yPos += 20

    // Detail par categorie
    person.categories.forEach((category, _catIndex) => {
      if (yPos > pageHeight - 60) {
        // Nouvelle page si necessaire
        pdf.addPage()
        yPos = margin + 20

        // Repeter le nom de la personne en en-tete
        pdf.setFontSize(16)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(31, 41, 55)
        pdf.text(
          cleanStringForPdf(`DETAIL - ${person.personName} (suite)`),
          margin,
          yPos
        )
        yPos += 15
      }

      // En-tete de categorie
      pdf.setFillColor(248, 250, 252) // gray-50
      pdf.roundedRect(margin, yPos, contentWidth, 12, 2, 2, 'F')

      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(75, 85, 99)
      pdf.text(
        cleanStringForPdf(`CATEGORIE: ${category.categoryName}`),
        margin + 5,
        yPos + 8
      )

      pdf.setTextColor(5, 150, 105)
      pdf.text(formatAmount(category.amount), pageWidth - margin - 35, yPos + 8)
      yPos += 18

      // Transactions de cette categorie
      if (category.transactions && category.transactions.length > 0) {
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'normal')

        category.transactions.forEach((transaction, _txIndex) => {
          if (yPos > pageHeight - 25) {
            pdf.addPage()
            yPos = margin + 15
          }

          // Date
          pdf.setTextColor(107, 114, 128)
          pdf.text(
            cleanStringForPdf(`- ${formatTransactionDate(transaction.date)}`),
            margin + 10,
            yPos
          )

          // Description (tronquee si trop longue)
          pdf.setTextColor(31, 41, 55)
          const description =
            transaction.description.length > 50
              ? transaction.description.substring(0, 50) + '...'
              : transaction.description
          pdf.text(cleanStringForPdf(description), margin + 35, yPos)

          // Montant
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(5, 150, 105)
          pdf.text(
            formatAmount(transaction.reimbursementAmount),
            pageWidth - margin - 35,
            yPos
          )
          yPos += 7

          // Note si presente
          if (transaction.note && transaction.note.trim()) {
            pdf.setFont('helvetica', 'italic')
            pdf.setFontSize(8)
            pdf.setTextColor(107, 114, 128)
            const note =
              transaction.note.length > 70
                ? transaction.note.substring(0, 70) + '...'
                : transaction.note
            pdf.text(cleanStringForPdf(`    ${note}`), margin + 15, yPos)
            yPos += 5
            pdf.setFontSize(10)
            pdf.setFont('helvetica', 'normal')
          }

          yPos += 2
        })
      }

      yPos += 8
    })

    // Footer de page
    pdf.setFontSize(8)
    pdf.setTextColor(156, 163, 175)
    pdf.text(
      cleanStringForPdf(`Detail ${person.personName}`),
      margin,
      pageHeight - 10
    )
    pdf.text(
      cleanStringForPdf('Bankin Analyzer'),
      pageWidth - margin - 25,
      pageHeight - 10
    )
  }

  /**
   * Derniere page: Resume par Categorie
   */
  const createCategoryPage = async (
    pdf: jsPDF,
    categoryData: Map<string, CategoryReimbursementData>,
    margin: number,
    pageWidth: number,
    contentWidth: number,
    pageHeight: number
  ): Promise<void> => {
    let yPos = margin

    // Titre de la page
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(31, 41, 55)
    pdf.text(cleanStringForPdf('REMBOURSEMENTS PAR CATEGORIE'), margin, yPos)
    yPos += 25

    Array.from(categoryData.entries()).forEach(([category, data], _index) => {
      if (yPos > pageHeight - 40) {
        pdf.addPage()
        yPos = margin + 20

        // Repeter le titre
        pdf.setFontSize(18)
        pdf.setFont('helvetica', 'bold')
        pdf.text(
          cleanStringForPdf('REMBOURSEMENTS PAR CATEGORIE (suite)'),
          margin,
          yPos
        )
        yPos += 20
      }

      // En-tete de categorie
      pdf.setFillColor(248, 250, 252)
      pdf.roundedRect(margin, yPos, contentWidth, 12, 2, 2, 'F')

      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(75, 85, 99)
      pdf.text(cleanStringForPdf(category), margin + 5, yPos + 8)

      pdf.setTextColor(5, 150, 105)
      pdf.text(formatAmount(data.total), pageWidth - margin - 35, yPos + 8)
      yPos += 18

      // Personnes dans cette categorie
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')

      data.persons.forEach(
        (person: { person: string; amount: number; personId: string }) => {
          if (yPos > pageHeight - 20) {
            pdf.addPage()
            yPos = margin + 15
          }

          pdf.setTextColor(31, 41, 55)
          pdf.text(cleanStringForPdf(`  - ${person.person}`), margin + 10, yPos)

          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(5, 150, 105)
          pdf.text(formatAmount(person.amount), pageWidth - margin - 35, yPos)

          pdf.setFont('helvetica', 'normal')
          yPos += 8
        }
      )

      yPos += 10
    })

    // Footer de page
    pdf.setFontSize(8)
    pdf.setTextColor(156, 163, 175)
    pdf.text(cleanStringForPdf('Resume par Categorie'), margin, pageHeight - 10)
    pdf.text(
      cleanStringForPdf('Bankin Analyzer'),
      pageWidth - margin - 25,
      pageHeight - 10
    )
  }

  /**
   * Previsualise le contenu qui sera exporte en PDF
   */
  const previewPdfContent = (
    reimbursementData: ReimbursementData[],
    detailedData: DetailedReimbursementData[],
    categoryData: Map<string, CategoryReimbursementData>
  ): void => {
    const htmlContent = generatePdfHtml(
      reimbursementData,
      detailedData,
      categoryData
    )
    const newWindow = window.open('', '_blank')
    if (newWindow) {
      newWindow.document.write(htmlContent)
      newWindow.document.close()
    }
  }

  return {
    exportToPdf,
    previewPdfContent,
    formatAmount,
    formatDate,
  }
}
