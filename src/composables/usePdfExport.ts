/**
 * Composable pour l'export PDF des remboursements
 * Fournit les fonctions utilitaires pour générer des PDF à partir des données de remboursement
 */

import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export interface ReimbursementData {
  person: string
  amount: number
  status: 'valide' | 'en_attente'
  personId: string
}

export interface DetailedReimbursementData {
  personId: string
  personName: string
  categories: Array<{
    categoryName: string
    amount: number
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
   * Formate un montant en euros
   */
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  /**
   * Génère le HTML pour le PDF
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
            padding: 2rem;
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
            margin-bottom: 2rem;
          }

          .section-title {
            font-size: 1.125rem;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid #e5e7eb;
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
            margin-bottom: 1rem;
            overflow: hidden;
          }

          .person-header {
            background: #f8fafc;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #e5e7eb;
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
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1.5rem;
            border-bottom: 1px solid #f3f4f6;
          }

          .category-item:last-child {
            border-bottom: none;
          }

          .category-name {
            font-weight: 500;
            color: #374151;
          }

          .category-amount {
            font-weight: 600;
            color: #059669;
          }

          .category-section {
            background: white;
            border-radius: 0.5rem;
            border: 1px solid #e5e7eb;
            margin-bottom: 1rem;
            overflow: hidden;
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
          <h1>📊 Rapport de Remboursements</h1>
          <div class="subtitle">Bankin Analyzer - Analyse Financière</div>
          <div class="date">Généré le ${formatDate(exportDate)}</div>
        </div>

        <div class="summary-section">
          <h2 class="summary-title">📈 Résumé Général</h2>
          <div class="summary-stats">
            <div class="stat-card">
              <div class="stat-value">${formatAmount(totalAmount)}</div>
              <div class="stat-label">Montant Total</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${reimbursementData.length}</div>
              <div class="stat-label">Personnes Concernées</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${categoryTotals.length}</div>
              <div class="stat-label">Catégories</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${reimbursementData.filter(r => r.status === 'en_attente').length}</div>
              <div class="stat-label">En Attente</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">👥 Aperçu des Remboursements par Personne</h2>
          <div class="reimbursement-list">
            ${reimbursementData
              .map(
                item => `
              <div class="reimbursement-item">
                <div class="person-info">
                  <div class="person-avatar">${item.person.charAt(0).toUpperCase()}</div>
                  <div class="person-details">
                    <div class="person-name">${item.person}</div>
                    <span class="person-status ${item.status}">
                      ${item.status === 'valide' ? 'Validé' : 'En attente'}
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
          <h2 class="section-title">📋 Détail par Personne avec Catégories</h2>
          ${detailedData
            .map(
              person => `
            <div class="detailed-person">
              <div class="person-header">
                <div class="person-summary">
                  <div class="person-info">
                    <div class="person-avatar">${person.personName.charAt(0).toUpperCase()}</div>
                    <div class="person-details">
                      <div class="person-name">${person.personName}</div>
                      <div style="font-size: 0.875rem; color: #6b7280;">
                        ${person.categories.length} catégorie(s)
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
                    <div class="category-name">${category.categoryName}</div>
                    <div class="category-amount">${formatAmount(category.amount)}</div>
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
          <h2 class="section-title">🏷️ Remboursements par Catégorie</h2>
          ${Array.from(categoryData.entries())
            .map(
              ([category, data]) => `
            <div class="category-section">
              <div class="category-header">
                <div class="category-title">
                  <div class="category-name">${category}</div>
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
                        ${person.person.charAt(0).toUpperCase()}
                      </div>
                      <div class="person-name" style="margin-left: 0.5rem;">${person.person}</div>
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
          <p>Rapport généré par Bankin Analyzer</p>
          <p>Ce document contient des informations confidentielles</p>
        </div>
      </body>
      </html>
    `
  }

  /**
   * Exporte les données de remboursement en PDF
   */
  const exportToPdf = async (
    reimbursementData: ReimbursementData[],
    detailedData: DetailedReimbursementData[],
    categoryData: Map<string, CategoryReimbursementData>,
    filename = 'remboursements-bankin-analyzer'
  ): Promise<void> => {
    try {
      // Créer un élément temporaire avec le HTML du rapport
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = generatePdfHtml(
        reimbursementData,
        detailedData,
        categoryData
      )
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      tempDiv.style.top = '0'
      tempDiv.style.width = '210mm' // A4 width
      tempDiv.style.background = 'white'

      document.body.appendChild(tempDiv)

      // Attendre que les styles s'appliquent
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 100)
      })

      // Capturer le contenu avec html2canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 2, // Haute qualité
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 794, // A4 width in pixels at 96 DPI
        height: 1123, // A4 height in pixels at 96 DPI
      })

      // Nettoyer l'élément temporaire
      document.body.removeChild(tempDiv)

      // Créer le PDF avec jsPDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      // Calculer les dimensions pour s'adapter à la page A4
      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight

      let position = 0

      // Ajouter l'image au PDF
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        position,
        imgWidth,
        imgHeight
      )
      heightLeft -= pageHeight

      // Ajouter des pages supplémentaires si nécessaire
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          0,
          position,
          imgWidth,
          imgHeight
        )
        heightLeft -= pageHeight
      }

      // Sauvegarder le PDF
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[-:]/g, '')
      pdf.save(`${filename}-${timestamp}.pdf`)
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error)
      throw new Error('Impossible de générer le PDF. Veuillez réessayer.')
    }
  }

  /**
   * Prévisualise le contenu qui sera exporté en PDF
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
