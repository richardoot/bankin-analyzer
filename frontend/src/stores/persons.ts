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
    }, 'Impossible de charger les personnes')
  }

  /** The created person, so a caller can select it; null on failure (see `error`). */
  async function addPerson(
    name: string,
    email?: string
  ): Promise<PersonDto | null> {
    return run(async () => {
      const newPerson = await api.createPerson({
        name,
        ...(email && { email }),
      })
      persons.value.push(newPerson)
      persons.value.sort((a, b) => a.name.localeCompare(b.name))
      return newPerson
    }, 'Impossible de créer la personne')
  }

  async function updatePerson(
    id: string,
    name: string,
    email?: string
  ): Promise<boolean> {
    const result = await run(async () => {
      const updated = await api.updatePerson(id, {
        name,
        ...(email && { email }),
      })
      const index = persons.value.findIndex(p => p.id === id)
      if (index !== -1) {
        persons.value[index] = updated
        persons.value.sort((a, b) => a.name.localeCompare(b.name))
      }
      return true
    }, 'Impossible de modifier la personne')
    return result ?? false
  }

  async function removePerson(id: string): Promise<boolean> {
    const result = await run(async () => {
      await api.deletePerson(id)
      persons.value = persons.value.filter(p => p.id !== id)
      return true
    }, 'Impossible de supprimer la personne')
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
