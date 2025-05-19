<template>
  <div v-if="expenses.length">
    <h3>Analyse des dépenses</h3>
    <ul>
      <li>Total des transactions : <b>{{ expenses.length }}</b></li>
      <li>
        Total des montants :
        <b>{{ totalAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}</b>
      </li>
      <li>
        Dépense moyenne :
        <b>{{ averageAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}</b>
      </li>
    </ul>
  </div>
  <div v-else>
    <em>Importez un fichier pour voir l'analyse.</em>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CsvRow } from '../types'

const props = defineProps<{
  expenses: CsvRow[]
}>()

const totalAmount = computed(() =>
  props.expenses.reduce((sum, e) => sum + (parseFloat(e.Montant) || 0), 0)
)

const averageAmount = computed(() =>
  props.expenses.length ? totalAmount.value / props.expenses.length : 0
)
</script>