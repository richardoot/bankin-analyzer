import jsPDF from 'jspdf'
import { formatCurrency } from '@/lib/formatters'

interface TransactionInfo {
  id: string
  date: string
  description: string
  amount: number
}

interface ReimbursementDetail {
  id: string
  transactionId: string
  amountRemaining: number
  note: string | null
  transaction?: TransactionInfo
}

interface CategorySummary {
  categoryId: string
  categoryName: string
  amount: number
  reimbursements: ReimbursementDetail[]
}

interface PersonSummary {
  personId: string
  personName: string
  total: number
  byCategory: CategorySummary[]
}

export function usePdfExport() {
  function formatDate(dateString: string | undefined): string {
    if (!dateString) return '--/--/----'
    try {
      return new Date(dateString).toLocaleDateString('fr-FR')
    } catch {
      return '--/--/----'
    }
  }

  function exportReimbursementsToPdf(
    summaryByPerson: PersonSummary[],
    totalDue: number
  ): void {
    const doc = new jsPDF()
    let y = 20

    // Titre
    doc.setFontSize(18)
    doc.text('Recapitulatif des Remboursements', 20, y)
    y += 10

    // Date de generation
    doc.setFontSize(10)
    doc.text(`Genere le ${new Date().toLocaleDateString('fr-FR')}`, 20, y)
    y += 15

    // Pour chaque personne
    summaryByPerson.forEach(person => {
      // Verifier si on a besoin d'une nouvelle page
      if (y > 250) {
        doc.addPage()
        y = 20
      }

      // Nom de la personne et total
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(person.personName, 20, y)
      doc.text(formatCurrency(person.total), 190, y, { align: 'right' })
      y += 8

      // Categories
      person.byCategory.forEach(cat => {
        // Verifier si on a besoin d'une nouvelle page
        if (y > 250) {
          doc.addPage()
          y = 20
        }

        // Nom de la categorie et montant
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text(`  ${cat.categoryName}`, 25, y)
        doc.text(formatCurrency(cat.amount), 190, y, { align: 'right' })
        y += 6

        // Transactions de cette categorie
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        cat.reimbursements.forEach(r => {
          // Verifier si on a besoin d'une nouvelle page
          if (y > 265) {
            doc.addPage()
            y = 20
          }

          const description = r.transaction?.description || 'Transaction'
          const date = formatDate(r.transaction?.date)
          // Tronquer la description si trop longue
          const maxLength = 50
          const truncatedDesc =
            description.length > maxLength
              ? description.substring(0, maxLength) + '...'
              : description

          doc.setTextColor(100, 100, 100)
          doc.text(`      - [${date}] ${truncatedDesc}`, 30, y)
          doc.text(formatCurrency(r.amountRemaining), 190, y, {
            align: 'right',
          })
          y += 5

          // Afficher la note si elle existe
          if (r.note) {
            doc.setFontSize(8)
            doc.setFont('helvetica', 'italic')
            doc.setTextColor(130, 130, 130)
            const noteMaxLength = 70
            const truncatedNote =
              r.note.length > noteMaxLength
                ? r.note.substring(0, noteMaxLength) + '...'
                : r.note
            doc.text(`        Note: ${truncatedNote}`, 35, y)
            y += 4
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
          }
        })

        doc.setTextColor(0, 0, 0)
        y += 3
      })

      y += 5
    })

    // Total general
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.line(20, y, 190, y)
    y += 8
    doc.text('Total General', 20, y)
    doc.text(formatCurrency(totalDue), 190, y, { align: 'right' })

    // Telecharger
    doc.save('remboursements.pdf')
  }

  return { exportReimbursementsToPdf }
}
