import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { PersonDto } from '@/lib/api'
import { useAsyncAction } from '@/composables/useAsyncAction'

export const usePersonsStore = defineStore('persons', () => {
  const persons = ref<PersonDto[]>([])
  const { isLoading, error, run, clearError } = useAsyncAction()

  async function fetchPersons(): Promise<void> {
    await run(async () => {
      persons.value = await api.getPersons()
    }, 'Failed to fetch persons')
  }

  async function addPerson(name: string, email?: string): Promise<boolean> {
    const result = await run(async () => {
      const newPerson = await api.createPerson({ name, email })
      persons.value.push(newPerson)
      persons.value.sort((a, b) => a.name.localeCompare(b.name))
      return true
    }, 'Failed to create person')
    return result ?? false
  }

  async function updatePerson(
    id: string,
    name: string,
    email?: string
  ): Promise<boolean> {
    const result = await run(async () => {
      const updated = await api.updatePerson(id, { name, email })
      const index = persons.value.findIndex(p => p.id === id)
      if (index !== -1) {
        persons.value[index] = updated
        persons.value.sort((a, b) => a.name.localeCompare(b.name))
      }
      return true
    }, 'Failed to update person')
    return result ?? false
  }

  async function removePerson(id: string): Promise<boolean> {
    const result = await run(async () => {
      await api.deletePerson(id)
      persons.value = persons.value.filter(p => p.id !== id)
      return true
    }, 'Failed to delete person')
    return result ?? false
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
