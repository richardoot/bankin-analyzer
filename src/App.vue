<template>
  <div class="container">
    <header>
      <h1>Bankin Analyzer</h1>
      <p>
        Importez votre fichier CSV de dépenses exporté depuis l’application Bankin.<br>
        Visualisez et analysez facilement vos transactions.
      </p>
    </header>
    <section>
      <CsvUploader @data-parsed="expenses = $event" />
      <DataAnalyzer :expenses="expenses" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CsvRow } from './types'

import CsvUploader from './components/CsvUploader.vue'
import DataAnalyzer from './components/DataAnalyzer.vue'

const expenses = ref<Array<CsvRow>>([])
</script>

<style scoped>
.container {
  max-width: 700px;
  margin: 40px auto;
  padding: 32px;
  background: #f8fafc;
  border-radius: 16px;
  box-shadow: 0 4px 24px #0001;
  font-family: 'Segoe UI', Arial, sans-serif;
}
header {
  text-align: center;
  margin-bottom: 32px;
}
h1 {
  color: #42b983;
  margin-bottom: 8px;
}
section {
  background: #fff;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px #0001;
}
</style>