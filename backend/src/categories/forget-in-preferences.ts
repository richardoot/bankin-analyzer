import type { Prisma, TransactionType } from '../generated/prisma'

/**
 * Drop a category's id from the hidden lists of the filter preferences. They
 * hold plain ids with no foreign key, so a deleted category would otherwise
 * linger there. Shared by every path that deletes a category.
 */
export async function forgetCategoryInPreferences(
  tx: Prisma.TransactionClient,
  userId: string,
  categoryId: string,
  type: TransactionType
): Promise<boolean> {
  const preferences = await tx.filterPreferences.findUnique({
    where: { userId },
  })
  if (!preferences) return false

  const isExpense = type === 'EXPENSE'
  const hidden = isExpense
    ? preferences.hiddenExpenseCategoryIds
    : preferences.hiddenIncomeCategoryIds
  const globalHidden = isExpense
    ? preferences.globalHiddenExpenseCategoryIds
    : preferences.globalHiddenIncomeCategoryIds

  if (!hidden.includes(categoryId) && !globalHidden.includes(categoryId)) {
    return false
  }

  const without = (ids: string[]): string[] =>
    ids.filter(candidate => candidate !== categoryId)

  await tx.filterPreferences.update({
    where: { userId },
    data: isExpense
      ? {
          hiddenExpenseCategoryIds: without(hidden),
          globalHiddenExpenseCategoryIds: without(globalHidden),
        }
      : {
          hiddenIncomeCategoryIds: without(hidden),
          globalHiddenIncomeCategoryIds: without(globalHidden),
        },
  })
  return true
}
