<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { usePersonsStore } from '@/stores/persons'
  import { api } from '@/lib/api'
  import type { ReimbursementDto, SettlementDto } from '@/lib/api'
  import { usePdfExport } from '@/composables/usePdfExport'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import SettlementModal from '@/components/settlements/SettlementModal.vue'
  import SingleSettlementModal from '@/components/settlements/SingleSettlementModal.vue'
  import SettlementHistorySection from '@/components/settlements/SettlementHistorySection.vue'
  import SettlementDetailModal from '@/components/settlements/SettlementDetailModal.vue'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import { useToast } from '@/composables/useToast'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconClipboard from '@/components/icons/IconClipboard.vue'
  import IconDocumentDownload from '@/components/icons/IconDocumentDownload.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import IconCheckCircle from '@/components/icons/IconCheckCircle.vue'
  import IconCheck from '@/components/icons/IconCheck.vue'
  import IconClose from '@/components/icons/IconClose.vue'
  import IconTrash from '@/components/icons/IconTrash.vue'
  import BaseField from '@/components/ui/BaseField.vue'

  const { exportReimbursementsToPdf } = usePdfExport()
  const toast = useToast()

  const personsStore = usePersonsStore()

  // Form state for adding person
  const newPersonName = ref('')
  const newPersonEmail = ref('')
  const isAddingPerson = ref(false)

  // Edit person state
  const editingPersonId = ref<string | null>(null)
  const editingPersonName = ref('')

  // Delete confirmation modal state
  const personToDelete = ref<{ id: string; name: string } | null>(null)

  // Reimbursements state
  const reimbursements = ref<ReimbursementDto[]>([])
  const isLoadingReimbursements = ref(false)
  const reimbursementsError = ref<string | null>(null)

  // Settlements state
  const settlements = ref<SettlementDto[]>([])
  const isLoadingSettlements = ref(false)
  const settlementsError = ref<string | null>(null)

  // Settlement modal state
  const showSettlementModal = ref(false)
  const settlementModalPersonId = ref<string | null>(null)
  const settlementModalPersonName = ref<string>('')

  // Single-line settlement modal state
  const showSingleSettlementModal = ref(false)
  const singleSettlementReimbursement = ref<ReimbursementDto | null>(null)

  // Settlement detail modal state
  const showSettlementDetailModal = ref(false)
  const selectedSettlement = ref<SettlementDto | null>(null)

  // Settlement delete confirmation
  const settlementToDelete = ref<string | null>(null)
  const isDeletingSettlement = ref(false)

  // Summary by person
  interface CategorySummary {
    categoryId: string | null
    categoryName: string
    amount: number
    amountReceived: number
    amountRemaining: number
    reimbursements: ReimbursementDto[]
    status: 'PENDING' | 'PARTIAL' | 'COMPLETED'
  }

  interface PersonSummary {
    personId: string
    personName: string
    total: number
    totalReceived: number
    totalRemaining: number
    byCategory: CategorySummary[]
  }

  // Expand/collapse state for categories (key: "personId:categoryId")
  const expandedCategories = ref<Set<string>>(new Set())

  function toggleCategoryExpanded(personId: string, categoryId: string) {
    const key = `${personId}:${categoryId}`
    if (expandedCategories.value.has(key)) {
      expandedCategories.value.delete(key)
    } else {
      expandedCategories.value.add(key)
    }
  }

  function isCategoryExpanded(personId: string, categoryId: string): boolean {
    return expandedCategories.value.has(`${personId}:${categoryId}`)
  }

  // Format transaction date
  const formatTransactionDate = (dateString: string | undefined): string =>
    formatDate(dateString)

  const summaryByPerson = computed((): PersonSummary[] => {
    const map = new Map<
      string,
      {
        personId: string
        personName: string
        total: number
        totalReceived: number
        totalRemaining: number
        byCategory: Map<
          string,
          {
            categoryId: string | null
            categoryName: string
            amount: number
            amountReceived: number
            amountRemaining: number
            reimbursements: ReimbursementDto[]
          }
        >
      }
    >()

    // Only include reimbursements with remaining amount (not fully settled)
    reimbursements.value
      .filter(r => r.amountRemaining > 0)
      .forEach(r => {
        if (!map.has(r.personId)) {
          map.set(r.personId, {
            personId: r.personId,
            personName: r.personName,
            total: 0,
            totalReceived: 0,
            totalRemaining: 0,
            byCategory: new Map(),
          })
        }
        const person = map.get(r.personId)
        if (!person) return
        person.total += r.amount
        person.totalReceived += r.amountReceived
        person.totalRemaining += r.amountRemaining

        // Grouped by the *expense* category: that is where the deduction
        // lands. Grouping by the income category was a habit of the old model,
        // where a refund found its way back to an expense through a category
        // pairing — it now says nothing about what the debt repays.
        const catKey = r.expenseCategoryId || 'none'
        const catName = r.expenseCategoryName || 'Sans catégorie'
        if (!person.byCategory.has(catKey)) {
          person.byCategory.set(catKey, {
            categoryId: r.expenseCategoryId,
            categoryName: catName,
            amount: 0,
            amountReceived: 0,
            amountRemaining: 0,
            reimbursements: [],
          })
        }
        const category = person.byCategory.get(catKey)
        if (!category) return
        category.amount += r.amount
        category.amountReceived += r.amountReceived
        category.amountRemaining += r.amountRemaining
        category.reimbursements.push(r)
      })

    return Array.from(map.values()).map(p => ({
      personId: p.personId,
      personName: p.personName,
      total: p.total,
      totalReceived: p.totalReceived,
      totalRemaining: p.totalRemaining,
      byCategory: Array.from(p.byCategory.entries()).map(([, data]) => {
        let status: 'PENDING' | 'PARTIAL' | 'COMPLETED' = 'PENDING'
        if (data.amountReceived >= data.amount) {
          status = 'COMPLETED'
        } else if (data.amountReceived > 0) {
          status = 'PARTIAL'
        }
        return {
          categoryId: data.categoryId,
          categoryName: data.categoryName,
          amount: data.amount,
          amountReceived: data.amountReceived,
          amountRemaining: data.amountRemaining,
          reimbursements: data.reimbursements,
          status,
        }
      }),
    }))
  })

  const totalDue = computed(() =>
    reimbursements.value.reduce((sum, r) => sum + r.amountRemaining, 0)
  )

  // Fetch reimbursements (with transaction info)
  async function fetchReimbursements() {
    try {
      isLoadingReimbursements.value = true
      reimbursementsError.value = null
      const data = await api.getReimbursements()
      reimbursements.value = data
    } catch (err) {
      reimbursementsError.value =
        err instanceof Error
          ? err.message
          : 'Impossible de charger les remboursements'
    } finally {
      isLoadingReimbursements.value = false
    }
  }

  // Fetch settlements
  async function fetchSettlements() {
    try {
      isLoadingSettlements.value = true
      settlementsError.value = null
      settlements.value = await api.getSettlements()
    } catch (err) {
      settlementsError.value =
        err instanceof Error
          ? err.message
          : 'Impossible de charger les règlements'
    } finally {
      isLoadingSettlements.value = false
    }
  }

  // Pending reimbursements handed to the settlement modal, which does its own
  // grouping by category.
  function getPendingForPerson(personId: string): ReimbursementDto[] {
    return reimbursements.value.filter(
      r => r.personId === personId && r.amountRemaining > 0
    )
  }

  const settlementModalPendingReimbursements = computed(() =>
    settlementModalPersonId.value
      ? getPendingForPerson(settlementModalPersonId.value)
      : []
  )

  // Open settlement modal for a person
  function openSettlementModal(personId: string, personName: string) {
    settlementModalPersonId.value = personId
    settlementModalPersonName.value = personName
    showSettlementModal.value = true
  }

  // Settle one line on its own: no allocation to arbitrate, so the modal is a
  // single step that only has to find the matching receipt.
  function openSettlementModalForReimbursement(
    reimbursement: ReimbursementDto
  ) {
    singleSettlementReimbursement.value = reimbursement
    showSingleSettlementModal.value = true
  }

  // Handle settlement created
  async function handleSettlementCreated(settlement: SettlementDto) {
    settlements.value.unshift(settlement)
    toast.success(
      `Règlement de ${formatCurrency(settlement.amountUsed)} enregistré`
    )
    // Refresh reimbursements to get updated amounts
    await fetchReimbursements()
  }

  // View settlement details
  function viewSettlementDetails(settlement: SettlementDto) {
    selectedSettlement.value = settlement
    showSettlementDetailModal.value = true
  }

  // Close settlement detail modal
  function closeSettlementDetailModal() {
    showSettlementDetailModal.value = false
    selectedSettlement.value = null
  }

  // Request settlement deletion
  function requestDeleteSettlement(settlementId: string) {
    settlementToDelete.value = settlementId
  }

  // Cancel settlement deletion
  function cancelDeleteSettlement() {
    if (isDeletingSettlement.value) return
    settlementToDelete.value = null
  }

  // Confirm delete settlement
  async function confirmDeleteSettlement() {
    if (!settlementToDelete.value) return

    // The dialog stays open, busy, until the server has answered: closing
    // it first made a failure look like a cancellation.
    const idToDelete = settlementToDelete.value
    isDeletingSettlement.value = true
    try {
      await api.deleteSettlement(idToDelete)
      settlements.value = settlements.value.filter(s => s.id !== idToDelete)
      settlementToDelete.value = null
      showSettlementDetailModal.value = false
      selectedSettlement.value = null
      toast.success('Règlement annulé, les montants sont de nouveau en attente')
      // Refresh reimbursements to restore amounts
      await fetchReimbursements()
    } catch (err) {
      console.error('Failed to delete settlement:', err)
      toast.error(
        err instanceof Error ? err.message : "Impossible d'annuler le règlement"
      )
    } finally {
      isDeletingSettlement.value = false
    }
  }

  // Handle delete from detail modal
  function handleDeleteFromDetailModal() {
    if (selectedSettlement.value) {
      requestDeleteSettlement(selectedSettlement.value.id)
    }
  }

  // Add person
  async function handleAddPerson() {
    if (!newPersonName.value.trim()) return

    isAddingPerson.value = true
    const success = await personsStore.addPerson(
      newPersonName.value.trim(),
      newPersonEmail.value.trim() || undefined
    )

    if (success) {
      newPersonName.value = ''
      newPersonEmail.value = ''
    }
    isAddingPerson.value = false
  }

  // Show delete confirmation modal
  function showDeleteConfirmation(id: string, name: string) {
    personToDelete.value = { id, name }
  }

  // Cancel delete
  function cancelDelete() {
    personToDelete.value = null
  }

  // Confirm delete person
  async function confirmDeletePerson() {
    if (!personToDelete.value) return
    const idToDelete = personToDelete.value.id
    personToDelete.value = null // Close modal immediately
    await personsStore.removePerson(idToDelete)
  }

  // Start editing person
  function startEditPerson(id: string, name: string) {
    editingPersonId.value = id
    editingPersonName.value = name
  }

  // Cancel editing
  function cancelEditPerson() {
    editingPersonId.value = null
    editingPersonName.value = ''
  }

  // Save edited person
  async function saveEditPerson(id: string) {
    if (!editingPersonName.value.trim()) return

    const success = await personsStore.updatePerson(
      id,
      editingPersonName.value.trim()
    )
    if (success) {
      editingPersonId.value = null
      editingPersonName.value = ''
    }
  }

  onMounted(() => {
    personsStore.fetchPersons()
    fetchReimbursements()
    fetchSettlements()
  })
</script>

<template>
  <PageShell width="wide">
    <PageHeader
      title="Remboursements"
      subtitle="Gérez les personnes et suivez les remboursements en cours"
    >
      <template #actions>
        <BaseButton
          to="/transactions"
          variant="tinted"
          class="w-full sm:w-auto"
        >
          <IconClipboard class="h-4 w-4" />
          Voir les transactions
        </BaseButton>
      </template>
    </PageHeader>

    <!-- A failed load is said as such — never as "nothing owed". -->
    <InlineAlert
      v-if="reimbursementsError"
      class="mb-6"
      data-testid="reimbursements-error"
      title="Les remboursements n'ont pas pu être chargés."
      retry-label="Réessayer"
      retry-test-id="reimbursements-retry"
      :retrying="isLoadingReimbursements"
      @retry="fetchReimbursements"
    >
      {{ reimbursementsError }}
    </InlineAlert>

    <!-- Summary Section: the balances are what the page is opened for -->
    <div
      v-if="reimbursements.length > 0"
      class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Récapitulatif des remboursements
        </h2>
        <BaseButton
          variant="tinted"
          size="sm"
          @click="exportReimbursementsToPdf(summaryByPerson, totalDue)"
        >
          <IconDocumentDownload class="h-4 w-4" />
          Export PDF
        </BaseButton>
      </div>

      <div class="space-y-4">
        <div
          v-for="person in summaryByPerson"
          :key="person.personId"
          class="border border-gray-200 dark:border-slate-700 rounded-lg p-4"
        >
          <!-- Person header -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-3">
              <div
                class="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center"
              >
                <span
                  class="text-lg font-semibold text-amber-700 dark:text-amber-400"
                >
                  {{ person.personName.charAt(0).toUpperCase() }}
                </span>
              </div>
              <div>
                <h3 class="font-medium text-gray-900 dark:text-gray-100">
                  {{ person.personName }}
                </h3>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Reçu : {{ formatCurrency(person.totalReceived) }} · En attente
                  : {{ formatCurrency(person.totalRemaining) }}
                </p>
              </div>
            </div>
            <div class="text-lg font-bold text-amber-700 dark:text-amber-400">
              {{ formatCurrency(person.total) }}
            </div>
          </div>

          <!-- Categories breakdown -->
          <div class="mt-3 space-y-1">
            <div
              v-for="cat in person.byCategory"
              :key="cat.categoryId ?? 'none'"
            >
              <!-- Category header - clickable -->
              <button
                type="button"
                :aria-expanded="
                  isCategoryExpanded(person.personId, cat.categoryId ?? 'none')
                "
                :aria-controls="`debts-${person.personId}-${cat.categoryId ?? 'none'}`"
                class="w-full flex items-center justify-between py-2 px-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded transition-colors text-sm min-h-[44px] sm:min-h-0"
                @click="
                  toggleCategoryExpanded(
                    person.personId,
                    cat.categoryId ?? 'none'
                  )
                "
              >
                <span
                  class="text-gray-600 dark:text-gray-400 flex items-center gap-1.5 sm:gap-2 flex-wrap"
                >
                  <IconChevronRight
                    class="w-3 h-3 text-gray-500 dark:text-gray-400 transition-transform duration-200 shrink-0"
                    :class="{
                      'rotate-90': isCategoryExpanded(
                        person.personId,
                        cat.categoryId ?? 'none'
                      ),
                    }"
                  />
                  <span class="truncate">{{ cat.categoryName }}</span>
                  <span
                    class="text-xs text-gray-500 dark:text-gray-400 shrink-0"
                    >({{ cat.reimbursements.length }})</span
                  >
                  <!-- Status badge -->
                  <span
                    v-if="cat.status === 'COMPLETED'"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 shrink-0"
                  >
                    Réglé
                  </span>
                  <span
                    v-else-if="cat.status === 'PARTIAL'"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shrink-0"
                  >
                    Partiel
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 shrink-0"
                  >
                    En attente
                  </span>
                </span>
                <span
                  class="font-medium text-gray-700 dark:text-gray-300 shrink-0 ml-2"
                >
                  {{ formatCurrency(cat.amountRemaining) }}
                </span>
              </button>

              <!-- Transaction details - collapsible. v-show, not a max-height
                     animation: the cap cut off the lines past ~9 on a phone,
                     and the hidden "Régler" buttons stayed tabbable. -->
              <div
                v-show="
                  isCategoryExpanded(person.personId, cat.categoryId ?? 'none')
                "
                :id="`debts-${person.personId}-${cat.categoryId ?? 'none'}`"
                :data-testid="`debts-${person.personId}-${cat.categoryId ?? 'none'}`"
              >
                <div class="ml-3 sm:ml-5 mt-1 mb-2 space-y-1">
                  <div
                    v-for="r in cat.reimbursements"
                    :key="r.id"
                    class="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-gray-500 dark:text-gray-400 py-1.5 sm:py-1 pl-3 border-l-2 border-amber-200 dark:border-amber-700"
                  >
                    <span class="truncate">
                      <span class="text-gray-500 dark:text-gray-400"
                        >[{{
                          formatTransactionDate(r.transaction?.date)
                        }}]</span
                      >
                      {{ r.transaction?.description || 'Transaction' }}
                    </span>
                    <span
                      class="flex items-center gap-2 whitespace-nowrap mt-0.5 sm:mt-0 sm:ml-2"
                    >
                      <span class="font-medium">
                        {{ formatCurrency(r.amountRemaining) }}
                        <span
                          v-if="r.amountReceived > 0"
                          class="text-primary-600 dark:text-primary-400 ml-1"
                        >
                          (reçu : {{ formatCurrency(r.amountReceived) }})
                        </span>
                      </span>
                      <BaseButton
                        variant="tinted"
                        size="sm"
                        :title="`Régler uniquement ${r.transaction?.description || 'cette transaction'}`"
                        @click="openSettlementModalForReimbursement(r)"
                      >
                        Régler
                      </BaseButton>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Settlement button -->
          <div
            v-if="person.totalRemaining > 0"
            class="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700"
          >
            <BaseButton
              variant="tinted"
              block
              @click="openSettlementModal(person.personId, person.personName)"
            >
              <IconCheckCircle class="h-4 w-4" />
              Enregistrer un règlement ({{
                formatCurrency(person.totalRemaining)
              }}
              en attente)
            </BaseButton>
          </div>
        </div>

        <!-- Total -->
        <div
          class="border-t-2 border-amber-200 dark:border-amber-700 pt-4 flex items-center justify-between"
        >
          <span class="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >Total général</span
          >
          <span class="text-xl font-bold text-amber-700 dark:text-amber-400">
            {{ formatCurrency(totalDue) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Empty state for reimbursements -->
    <div
      v-else-if="
        !isLoadingReimbursements &&
        !reimbursementsError &&
        reimbursements.length === 0
      "
      class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20"
    >
      <EmptyState
        title="Aucun remboursement en cours"
        description="Assignez des remboursements aux transactions depuis la page Transactions."
      >
        <template #icon>
          <svg
            class="h-8 w-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </template>
        <template #action>
          <BaseButton to="/transactions">Aller aux transactions</BaseButton>
        </template>
      </EmptyState>
    </div>

    <!-- Persons Section: configuration, below the balances it serves -->
    <div
      class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6 mt-8"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Personnes
      </h2>

      <!-- Error state for persons -->
      <div
        v-if="personsStore.error"
        role="alert"
        class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 mb-4"
      >
        {{ personsStore.error }}
      </div>

      <!-- Add person form -->
      <form class="flex flex-wrap gap-3 mb-6" @submit.prevent="handleAddPerson">
        <div class="flex-1 min-w-[200px]">
          <BaseField
            v-model="newPersonName"
            type="text"
            size="sm"
            label="Nom de la personne"
            label-hidden
            placeholder="Nom de la personne"
            :disabled="isAddingPerson"
          />
        </div>
        <div class="flex-1 min-w-[200px]">
          <BaseField
            v-model="newPersonEmail"
            type="email"
            size="sm"
            label="Email (optionnel)"
            label-hidden
            placeholder="Email (optionnel)"
            :disabled="isAddingPerson"
          />
        </div>
        <BaseButton
          type="submit"
          :disabled="!newPersonName.trim()"
          :loading="isAddingPerson"
        >
          <span v-if="isAddingPerson">Ajout...</span>
          <span v-else>Ajouter</span>
        </BaseButton>
      </form>

      <!-- Persons list -->
      <div
        v-if="personsStore.isLoading"
        class="flex justify-center items-center py-8"
      >
        <div class="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Chargement...</span>
        </div>
      </div>

      <!-- Person cards grid -->
      <div
        v-else-if="personsStore.persons.length > 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        <div
          v-for="person in personsStore.persons"
          :key="person.id"
          class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700"
        >
          <!-- Edit mode -->
          <template v-if="editingPersonId === person.id">
            <div class="flex items-center gap-2">
              <!-- Avatar with first letter -->
              <div
                class="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0"
              >
                <span
                  class="text-lg font-semibold text-amber-700 dark:text-amber-400"
                >
                  {{ person.name.charAt(0).toUpperCase() }}
                </span>
              </div>
              <BaseField
                v-model="editingPersonName"
                type="text"
                size="sm"
                label="Nom de la personne"
                label-hidden
                class="flex-1"
                @keyup.enter="saveEditPerson(person.id)"
                @keyup.escape="cancelEditPerson"
              />
              <BaseIconButton
                size="sm"
                variant="primary"
                label="Enregistrer le nom"
                @click="saveEditPerson(person.id)"
              >
                <IconCheck />
              </BaseIconButton>
              <BaseIconButton
                size="sm"
                label="Annuler le renommage"
                @click="cancelEditPerson"
              >
                <IconClose />
              </BaseIconButton>
            </div>
          </template>
          <!-- Display mode -->
          <template v-else>
            <div class="flex items-start gap-3">
              <!-- Avatar with first letter -->
              <div
                class="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0"
              >
                <span
                  class="text-lg font-semibold text-amber-700 dark:text-amber-400"
                >
                  {{ person.name.charAt(0).toUpperCase() }}
                </span>
              </div>
              <!-- Name and email -->
              <div class="flex-1 min-w-0">
                <button
                  class="text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-amber-600 dark:hover:text-amber-400 truncate block w-full"
                  @click="startEditPerson(person.id, person.name)"
                >
                  {{ person.name }}
                </button>
                <p
                  class="text-xs text-gray-500 dark:text-gray-400 truncate"
                  :title="person.email || 'Pas d\'email'"
                >
                  {{ person.email || "Pas d'email" }}
                </p>
              </div>
              <!-- Delete button -->
              <BaseIconButton
                size="sm"
                variant="danger"
                :label="`Supprimer ${person.name}`"
                @click="showDeleteConfirmation(person.id, person.name)"
              >
                <IconTrash />
              </BaseIconButton>
            </div>
          </template>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
        Aucune personne ajoutée. Commencez par ajouter une personne ci-dessus.
      </div>
    </div>

    <!-- Settlement History Section -->
    <InlineAlert
      v-if="settlementsError"
      class="mt-8"
      data-testid="settlements-error"
      title="L'historique des règlements n'a pas pu être chargé."
      retry-label="Réessayer"
      retry-test-id="settlements-retry"
      :retrying="isLoadingSettlements"
      @retry="fetchSettlements"
    >
      {{ settlementsError }}
    </InlineAlert>
    <SettlementHistorySection
      v-else-if="settlements.length > 0 || isLoadingSettlements"
      :settlements="settlements"
      :is-loading="isLoadingSettlements"
      class="mt-8"
      @delete="requestDeleteSettlement"
      @view-details="viewSettlementDetails"
    />

    <!-- Delete confirmation modal -->
    <ConfirmDialog
      :open="personToDelete !== null"
      title="Supprimer cette personne ?"
      confirm-label="Supprimer"
      @confirm="confirmDeletePerson"
      @cancel="cancelDelete"
    >
      Êtes-vous sûr de vouloir supprimer
      <span class="font-medium text-gray-900 dark:text-gray-100">{{
        personToDelete?.name
      }}</span>
      ? Cette action est irréversible.
    </ConfirmDialog>

    <!-- Settlement Modal -->
    <SettlementModal
      :is-open="showSettlementModal"
      :person-id="settlementModalPersonId ?? ''"
      :person-name="settlementModalPersonName"
      :pending-reimbursements="settlementModalPendingReimbursements"
      @close="showSettlementModal = false"
      @confirm="handleSettlementCreated"
    />

    <!-- Single-line Settlement Modal -->
    <SingleSettlementModal
      :is-open="showSingleSettlementModal"
      :reimbursement="singleSettlementReimbursement"
      @close="showSingleSettlementModal = false"
      @confirm="handleSettlementCreated"
    />

    <!-- Settlement Detail Modal -->
    <SettlementDetailModal
      :is-open="showSettlementDetailModal"
      :settlement="selectedSettlement"
      @close="closeSettlementDetailModal"
      @delete="handleDeleteFromDetailModal"
    />

    <!-- Settlement delete confirmation modal -->
    <ConfirmDialog
      :open="settlementToDelete !== null"
      title="Annuler ce règlement ?"
      confirm-label="Oui, annuler"
      cancel-label="Non, conserver"
      :loading="isDeletingSettlement"
      @confirm="confirmDeleteSettlement"
      @cancel="cancelDeleteSettlement"
    >
      Cette action va annuler le règlement et restaurer les montants en attente
      sur les remboursements associés.
    </ConfirmDialog>
  </PageShell>
</template>
