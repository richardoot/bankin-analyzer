<template>
  <div class="uploader">
    <label class="file-label">
      <input type="file" accept=".csv" @change="handleFile" class="file-input" />
      <span class="file-btn">Choisir un fichier CSV</span>
    </label>
    <div v-if="csvData.length" class="preview">
      <h3>Premières lignes du CSV :</h3>
      <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th v-for="(header, i) in headers" :key="i">{{ header }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(row, i) in csvData.slice(0, 5)" :key="i">
                    <td v-for="header in headers" :key="header">{{ row[header] }}</td>
                </tr>
            </tbody>
        </table>
      </div>
      <p class="info">Total lignes importées : {{ csvData.length }}</p>
      <button @click="acceptData" class="accept-btn">Analyser ces données</button>
    </div>
    <div v-else class="info">
      <p>Aucun fichier importé pour le moment.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import * as Papa from 'papaparse'
import type { ParseResult } from 'papaparse'
import type { CsvRow } from '../types'

const csvData = ref<Array<CsvRow>>([])
const headers = ref<Array<string> | undefined>([])

const emit = defineEmits<{
  (e: 'data-parsed', data: any[]): void
  (e: 'data-accepted'): void
}>()

function handleFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (files && files[0]) {
    const file = files[0];
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: ParseResult<CsvRow>) => {
            console.log(`Headers data : ${JSON.stringify(results.meta.fields)}`);
            csvData.value = results.data
            headers.value = results.meta.fields
            emit('data-parsed', results.data)
        }
    })
  }
}

function acceptData() {
  emit('data-accepted')
}
</script>

<style scoped>
.uploader {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.file-label {
  display: inline-block;
  cursor: pointer;
  margin-bottom: 18px;
}
.file-input {
  display: none;
}
.file-btn {
  background: #42b983;
  color: #fff;
  padding: 10px 22px;
  border-radius: 6px;
  font-weight: 600;
  transition: background 0.2s;
  border: none;
  box-shadow: 0 2px 8px #42b98322;
}
.file-btn:hover {
  background: #36996b;
}
.preview {
  width: 100%;
}
.table-container {
  overflow-x: auto;
  margin-bottom: 10px;
}
table {
  border-collapse: collapse;
  width: 100%;
  background: #fff;
}
th, td {
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  text-align: left;
  font-size: 15px;
}
th {
  background: #f0f9f5;
  color: #42b983;
}
td {
  color: #333;
}
.info {
  color: #888;
  margin-top: 10px;
  text-align: center;
}
.accept-btn {
  background: #42b983;
  color: #fff;
  padding: 10px 22px;
  border-radius: 6px;
  font-weight: 600;
  margin-top: 20px;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  box-shadow: 0 2px 8px #42b98322;
}
.accept-btn:hover {
  background: #36996b;
}
</style>