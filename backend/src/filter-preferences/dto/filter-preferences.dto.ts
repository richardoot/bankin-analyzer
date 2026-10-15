export class FilterPreferencesDto {
  /** Whether the advanced filters panel is expanded */
  isPanelExpanded!: boolean

  /** Whether an import adopts the categories written in the file */
  importCategoriesFromFile!: boolean

  /**
   * Whether a debt still owed is taken off the spending it hangs off, on the
   * dashboard and in the budget. On by default.
   */
  deductPendingReimbursements!: boolean
}
