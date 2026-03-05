import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { PersonDto } from '@/lib/api'

export const usePersonsStore = defineStore('persons', () => {
  const persons = ref<PersonDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPersons(): Promise<void> {
    try {
      isLoading.value = true
      error.value = null
      persons.value = await api.getPersons()
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to fetch persons'
      console.error('Failed to fetch persons:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function addPerson(name: string, email?: string): Promise<boolean> {
    try {
      isLoading.value = true
      error.value = null
      const newPerson = await api.createPerson({ name, email })
      persons.value.push(newPerson)
      // Sort by name
      persons.value.sort((a, b) => a.name.localeCompare(b.name))
      return true
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to create person'
      console.error('Failed to create person:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function updatePerson(
    id: string,
    name: string,
    email?: string
  ): Promise<boolean> {
    try {
      isLoading.value = true
      error.value = null
      const updated = await api.updatePerson(id, { name, email })
      const index = persons.value.findIndex(p => p.id === id)
      if (index !== -1) {
        persons.value[index] = updated
        // Re-sort by name
        persons.value.sort((a, b) => a.name.localeCompare(b.name))
      }
      return true
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to update person'
      console.error('Failed to update person:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function removePerson(id: string): Promise<boolean> {
    try {
      isLoading.value = true
      error.value = null
      await api.deletePerson(id)
      persons.value = persons.value.filter(p => p.id !== id)
      return true
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to delete person'
      console.error('Failed to delete person:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  function clearError(): void {
    error.value = null
  }

  return {
    persons,
    isLoading,
    error,
    fetchPersons,
    addPerson,
    updatePerson,
    removePerson,
    clearError,
  }
})
