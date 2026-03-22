import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePdfExport } from './usePdfExport'

// Mock jsPDF
const mockText = vi.fn()
const mockSetFontSize = vi.fn()
const mockSetFont = vi.fn()
const mockSetTextColor = vi.fn()
const mockLine = vi.fn()
const mockAddPage = vi.fn()
const mockSave = vi.fn()

vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      text: mockText,
      setFontSize: mockSetFontSize,
      setFont: mockSetFont,
      setTextColor: mockSetTextColor,
      line: mockLine,
      addPage: mockAddPage,
      save: mockSave,
    })),
  }
})

describe('usePdfExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('exportReimbursementsToPdf', () => {
    it('should create PDF with title and date', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      exportReimbursementsToPdf([], 0)

      // Verify title
      expect(mockSetFontSize).toHaveBeenCalledWith(18)
      expect(mockText).toHaveBeenCalledWith(
        'Recapitulatif des Remboursements',
        20,
        20
      )

      // Verify date generation text
      expect(mockSetFontSize).toHaveBeenCalledWith(10)
      expect(mockText).toHaveBeenCalledWith(
        expect.stringContaining('Genere le'),
        20,
        30
      )
    })

    it('should display person name and total', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 150.5,
          byCategory: [],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 150.5)

      expect(mockSetFontSize).toHaveBeenCalledWith(14)
      expect(mockSetFont).toHaveBeenCalledWith('helvetica', 'bold')
      expect(mockText).toHaveBeenCalledWith(
        'Jean Dupont',
        20,
        expect.any(Number)
      )
      // Currency uses non-breaking space (\\u00A0)
      expect(mockText).toHaveBeenCalledWith(
        expect.stringMatching(/150,50\s?€/),
        190,
        expect.any(Number),
        { align: 'right' }
      )
    })

    it('should display categories with amounts', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 100,
          byCategory: [
            {
              categoryId: 'cat-1',
              categoryName: 'Alimentation',
              amount: 60,
              reimbursements: [],
            },
            {
              categoryId: 'cat-2',
              categoryName: 'Transport',
              amount: 40,
              reimbursements: [],
            },
          ],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 100)

      expect(mockText).toHaveBeenCalledWith(
        '  Alimentation',
        25,
        expect.any(Number)
      )
      expect(mockText).toHaveBeenCalledWith(
        expect.stringMatching(/60,00\s?€/),
        190,
        expect.any(Number),
        { align: 'right' }
      )
      expect(mockText).toHaveBeenCalledWith(
        '  Transport',
        25,
        expect.any(Number)
      )
      expect(mockText).toHaveBeenCalledWith(
        expect.stringMatching(/40,00\s?€/),
        190,
        expect.any(Number),
        { align: 'right' }
      )
    })

    it('should display transaction details with date and description', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 50,
          byCategory: [
            {
              categoryId: 'cat-1',
              categoryName: 'Alimentation',
              amount: 50,
              reimbursements: [
                {
                  id: 'reimb-1',
                  transactionId: 'tx-1',
                  amountRemaining: 50,
                  note: null,
                  transaction: {
                    id: 'tx-1',
                    date: '2024-01-15T10:00:00.000Z',
                    description: 'Restaurant Le Petit Bistro',
                    amount: 50,
                  },
                },
              ],
            },
          ],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 50)

      expect(mockText).toHaveBeenCalledWith(
        '      - [15/01/2024] Restaurant Le Petit Bistro',
        30,
        expect.any(Number)
      )
    })

    it('should truncate long descriptions', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const longDescription =
        'This is a very long description that exceeds the maximum length of fifty characters and should be truncated'

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 50,
          byCategory: [
            {
              categoryId: 'cat-1',
              categoryName: 'Alimentation',
              amount: 50,
              reimbursements: [
                {
                  id: 'reimb-1',
                  transactionId: 'tx-1',
                  amountRemaining: 50,
                  note: null,
                  transaction: {
                    id: 'tx-1',
                    date: '2024-01-15T10:00:00.000Z',
                    description: longDescription,
                    amount: 50,
                  },
                },
              ],
            },
          ],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 50)

      // Check that description is truncated to 50 chars + "..."
      expect(mockText).toHaveBeenCalledWith(
        expect.stringMatching(/^\s+- \[15\/01\/2024\] .{50}\.\.\.$/),
        30,
        expect.any(Number)
      )
    })

    it('should display note in italics when present', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 50,
          byCategory: [
            {
              categoryId: 'cat-1',
              categoryName: 'Alimentation',
              amount: 50,
              reimbursements: [
                {
                  id: 'reimb-1',
                  transactionId: 'tx-1',
                  amountRemaining: 50,
                  note: 'Repas equipe',
                  transaction: {
                    id: 'tx-1',
                    date: '2024-01-15T10:00:00.000Z',
                    description: 'Restaurant',
                    amount: 50,
                  },
                },
              ],
            },
          ],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 50)

      expect(mockSetFont).toHaveBeenCalledWith('helvetica', 'italic')
      expect(mockText).toHaveBeenCalledWith(
        '        Note: Repas equipe',
        35,
        expect.any(Number)
      )
    })

    it('should truncate long notes', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const longNote =
        'This is a very long note that exceeds seventy characters and should be truncated to fit on the page properly'

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 50,
          byCategory: [
            {
              categoryId: 'cat-1',
              categoryName: 'Alimentation',
              amount: 50,
              reimbursements: [
                {
                  id: 'reimb-1',
                  transactionId: 'tx-1',
                  amountRemaining: 50,
                  note: longNote,
                  transaction: {
                    id: 'tx-1',
                    date: '2024-01-15T10:00:00.000Z',
                    description: 'Restaurant',
                    amount: 50,
                  },
                },
              ],
            },
          ],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 50)

      // Note should be truncated to 70 chars + "..."
      expect(mockText).toHaveBeenCalledWith(
        expect.stringMatching(/^\s+Note: .{70}\.\.\.$/),
        35,
        expect.any(Number)
      )
    })

    it('should display total general with line separator', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 250.75,
          byCategory: [],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 250.75)

      expect(mockLine).toHaveBeenCalledWith(
        20,
        expect.any(Number),
        190,
        expect.any(Number)
      )
      expect(mockText).toHaveBeenCalledWith(
        'Total General',
        20,
        expect.any(Number)
      )
      expect(mockText).toHaveBeenCalledWith(
        expect.stringMatching(/250,75\s?€/),
        190,
        expect.any(Number),
        { align: 'right' }
      )
    })

    it('should save PDF with correct filename', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      exportReimbursementsToPdf([], 0)

      expect(mockSave).toHaveBeenCalledWith('remboursements.pdf')
    })

    it('should handle multiple persons', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 100,
          byCategory: [],
        },
        {
          personId: 'person-2',
          personName: 'Marie Martin',
          total: 200,
          byCategory: [],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 300)

      expect(mockText).toHaveBeenCalledWith(
        'Jean Dupont',
        20,
        expect.any(Number)
      )
      expect(mockText).toHaveBeenCalledWith(
        'Marie Martin',
        20,
        expect.any(Number)
      )
      expect(mockText).toHaveBeenCalledWith(
        expect.stringMatching(/300,00\s?€/),
        190,
        expect.any(Number),
        { align: 'right' }
      )
    })

    it('should not display note section when note is null', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 50,
          byCategory: [
            {
              categoryId: 'cat-1',
              categoryName: 'Alimentation',
              amount: 50,
              reimbursements: [
                {
                  id: 'reimb-1',
                  transactionId: 'tx-1',
                  amountRemaining: 50,
                  note: null,
                  transaction: {
                    id: 'tx-1',
                    date: '2024-01-15T10:00:00.000Z',
                    description: 'Restaurant',
                    amount: 50,
                  },
                },
              ],
            },
          ],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 50)

      // Should not have called text with "Note:" prefix
      const noteCallFound = mockText.mock.calls.some(
        call => typeof call[0] === 'string' && call[0].includes('Note:')
      )
      expect(noteCallFound).toBe(false)
    })

    it('should format currency in French locale', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Test',
          total: 1234.56,
          byCategory: [],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 1234.56)

      // French format: spaces as thousand separators, comma as decimal
      expect(mockText).toHaveBeenCalledWith(
        expect.stringMatching(/1[\s\u00A0]?234,56\s?€/),
        190,
        expect.any(Number),
        { align: 'right' }
      )
    })

    it('should fallback to default values when transaction is missing', () => {
      const { exportReimbursementsToPdf } = usePdfExport()

      const summaryByPerson = [
        {
          personId: 'person-1',
          personName: 'Jean Dupont',
          total: 50,
          byCategory: [
            {
              categoryId: 'cat-1',
              categoryName: 'Alimentation',
              amount: 50,
              reimbursements: [
                {
                  id: 'reimb-1',
                  transactionId: 'tx-1',
                  amountRemaining: 50,
                  note: null,
                  // No transaction object
                },
              ],
            },
          ],
        },
      ]

      exportReimbursementsToPdf(summaryByPerson, 50)

      // Should use default values
      expect(mockText).toHaveBeenCalledWith(
        '      - [--/--/----] Transaction',
        30,
        expect.any(Number)
      )
    })
  })
})
