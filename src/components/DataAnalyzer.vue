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
    <button @click="goBack" class="back-btn">Retour à l'importation</button>
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

const emit = defineEmits<{
  (e: 'back'): void
}>()

const totalAmount = computed(() =>
  props.expenses.reduce((sum, e) => sum + (parseFloat(e.Montant) || 0), 0)
)

const averageAmount = computed(() =>
  props.expenses.length ? totalAmount.value / props.expenses.length : 0
)

function goBack() {
  emit('back')
}
</script>

<style scoped>
ul {
  list-style-type: none;
  padding: 0;
  margin-bottom: 20px;
}

li {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.back-btn {
  background: #7c8c9e;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: background 0.2s;
}

.back-btn:hover {
  background: #66778a;
}
</style>