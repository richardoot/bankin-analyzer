/**
 * Composable pour la gestion centralisée du localStorage
 * Unifie toutes les opérations de stockage local de l'application
 */

import { ref, watch, type Ref, type UnwrapRef } from 'vue'

// Instances partagées pour assurer la réactivité cross-composant
const globalInstances = new Map<string, StorageItem<unknown>>()

export interface StorageOptions {
  /** Préfixe automatique pour les clés (défaut: 'bankin-analyzer-') */
  prefix?: string
  /** Désactiver la synchronisation automatique entre onglets */
  disableSync?: boolean
  /** Fonction de validation personnalisée des données */
  validator?: (data: unknown) => boolean
  /** Valeur par défaut en cas d'erreur */
  fallback?: unknown
  /** Désactiver les logs d'erreur */
  silentErrors?: boolean
}

export interface StorageItem<T> {
  /** Ref Vue réactif synchronisé avec localStorage */
  data: Ref<UnwrapRef<T>>
  /** Sauvegarder manuellement les données */
  save: () => boolean
  /** Recharger depuis localStorage */
  reload: () => boolean
  /** Supprimer du localStorage */
  remove: () => boolean
  /** Vérifier si la clé existe */
  exists: () => boolean
  /** Obtenir la taille en bytes */
  size: () => number
}

/**
 * Composable principal pour localStorage
 */
export const useLocalStorage = () => {
  const DEFAULT_PREFIX = 'bankin-analyzer-'

  /**
   * Normalise une clé avec le préfixe
   */
  const normalizeKey = (key: string, prefix = DEFAULT_PREFIX): string => {
    if (key.startsWith(prefix)) {
      return key
    }
    return `${prefix}${key}`
  }

  /**
   * Vérifie si localStorage est disponible
   */
  const isAvailable = (): boolean => {
    try {
      const test = '__storage_test__'
      localStorage.setItem(test, 'test')
      localStorage.removeItem(test)
      return true
    } catch {
      return false
    }
  }

  /**
   * Obtient une valeur du localStorage avec gestion d'erreur
   */
  const getItem = <T>(key: string, options: StorageOptions = {}): T | null => {
    const {
      prefix = DEFAULT_PREFIX,
      validator,
      fallback = null,
      silentErrors = false,
    } = options

    if (!isAvailable()) {
      if (!silentErrors) {
        console.warn('localStorage non disponible')
      }
      return fallback
    }

    try {
      const normalizedKey = normalizeKey(key, prefix)
      const item = localStorage.getItem(normalizedKey)

      if (item === null || item === 'undefined') {
        return fallback
      }

      const parsed = JSON.parse(item)

      // Validation optionnelle
      if (validator && !validator(parsed)) {
        if (!silentErrors) {
          console.warn(`Données invalides pour la clé ${normalizedKey}`)
        }
        return fallback
      }

      return parsed as T
    } catch (error) {
      if (!silentErrors) {
        console.error(`Erreur lors de la lecture de ${key}:`, error)
      }
      return fallback
    }
  }

  /**
   * Sauvegarde une valeur dans localStorage
   */
  const setItem = <T>(
    key: string,
    value: T,
    options: StorageOptions = {}
  ): boolean => {
    const { prefix = DEFAULT_PREFIX, silentErrors = false } = options

    if (!isAvailable()) {
      if (!silentErrors) {
        console.warn('localStorage non disponible')
      }
      return false
    }

    try {
      const normalizedKey = normalizeKey(key, prefix)
      const serialized = JSON.stringify(value)
      localStorage.setItem(normalizedKey, serialized)
      return true
    } catch (error) {
      if (!silentErrors) {
        console.error(`Erreur lors de la sauvegarde de ${key}:`, error)
      }
      return false
    }
  }

  /**
   * Supprime un élément du localStorage
   */
  const removeItem = (key: string, options: StorageOptions = {}): boolean => {
    const { prefix = DEFAULT_PREFIX, silentErrors = false } = options

    if (!isAvailable()) {
      if (!silentErrors) {
        console.warn('localStorage non disponible')
      }
      return false
    }

    try {
      const normalizedKey = normalizeKey(key, prefix)
      localStorage.removeItem(normalizedKey)
      return true
    } catch (error) {
      if (!silentErrors) {
        console.error(`Erreur lors de la suppression de ${key}:`, error)
      }
      return false
    }
  }

  /**
   * Vide tout le localStorage avec le préfixe donné
   */
  const clear = (options: StorageOptions = {}): boolean => {
    const { prefix = DEFAULT_PREFIX, silentErrors = false } = options

    if (!isAvailable()) {
      if (!silentErrors) {
        console.warn('localStorage non disponible')
      }
      return false
    }

    try {
      const keysToRemove: string[] = []

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key))
      return true
    } catch (error) {
      if (!silentErrors) {
        console.error('Erreur lors du nettoyage du localStorage:', error)
      }
      return false
    }
  }

  /**
   * Vérifie si une clé existe
   */
  const hasItem = (key: string, options: StorageOptions = {}): boolean => {
    const { prefix = DEFAULT_PREFIX } = options

    if (!isAvailable()) {
      return false
    }

    const normalizedKey = normalizeKey(key, prefix)
    return localStorage.getItem(normalizedKey) !== null
  }

  /**
   * Obtient la taille d'un élément en bytes
   */
  const getItemSize = (key: string, options: StorageOptions = {}): number => {
    const { prefix = DEFAULT_PREFIX } = options

    if (!isAvailable()) {
      return 0
    }

    try {
      const normalizedKey = normalizeKey(key, prefix)
      const item = localStorage.getItem(normalizedKey)
      return item ? new Blob([item]).size : 0
    } catch {
      return 0
    }
  }

  /**
   * Obtient toutes les clés avec le préfixe donné
   */
  const getKeys = (options: StorageOptions = {}): string[] => {
    const { prefix = DEFAULT_PREFIX } = options

    if (!isAvailable()) {
      return []
    }

    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) {
          keys.push(key.replace(prefix, ''))
        }
      }
      return keys
    } catch {
      return []
    }
  }

  /**
   * Crée un item réactif synchronisé avec localStorage
   */
  const useStorageItem = <T>(
    key: string,
    initialValue: T,
    options: StorageOptions = {}
  ): StorageItem<T> => {
    const {
      prefix = DEFAULT_PREFIX,
      disableSync = false,
      validator,
      fallback = initialValue,
      silentErrors = false,
    } = options

    const normalizedKey = normalizeKey(key, prefix)

    // Vérifier s'il existe déjà une instance globale pour cette clé
    if (globalInstances.has(normalizedKey)) {
      return globalInstances.get(normalizedKey) as StorageItem<T>
    }

    // Charger la valeur initiale depuis localStorage
    const loadedValue = getItem<T>(key, {
      prefix,
      validator,
      fallback: initialValue,
      silentErrors,
    })

    const data = ref(loadedValue) as Ref<UnwrapRef<T>>

    // Sauvegarder automatiquement lors des changements
    const stopWatcher = watch(
      data,
      newValue => {
        setItem(key, newValue, { prefix, silentErrors })
      },
      { deep: true }
    )

    // Écouter les changements d'autres onglets
    if (!disableSync && isAvailable()) {
      const handleStorageChange = (event: StorageEvent) => {
        const normalizedKey = normalizeKey(key, prefix)
        if (event.key === normalizedKey && event.newValue !== null) {
          try {
            const parsed = JSON.parse(event.newValue)
            if (!validator || validator(parsed)) {
              data.value = parsed as UnwrapRef<T>
            }
          } catch (error) {
            if (!silentErrors) {
              console.error(
                `Erreur lors de la synchronisation de ${key}:`,
                error
              )
            }
          }
        }
      }

      window.addEventListener('storage', handleStorageChange)

      // Nettoyer l'événement lors du démontage (optionnel, géré par le composant parent)
      const _cleanup = () => {
        window.removeEventListener('storage', handleStorageChange)
        stopWatcher()
      }
    }

    const save = (): boolean => {
      return setItem(key, data.value, { prefix, silentErrors })
    }

    const reload = (): boolean => {
      try {
        const loaded = getItem<T>(key, {
          prefix,
          validator,
          fallback,
          silentErrors,
        })
        if (loaded !== null) {
          data.value = loaded as UnwrapRef<T>
          return true
        }
        return false
      } catch {
        return false
      }
    }

    const remove = (): boolean => {
      if (removeItem(key, { prefix, silentErrors })) {
        data.value = initialValue as UnwrapRef<T>
        return true
      }
      return false
    }

    const exists = (): boolean => {
      return hasItem(key, { prefix })
    }

    const size = (): number => {
      return getItemSize(key, { prefix })
    }

    const storageItem = {
      data,
      save,
      reload,
      remove,
      exists,
      size,
    }

    // Stocker l'instance dans la Map globale pour la réutiliser
    globalInstances.set(normalizedKey, storageItem as StorageItem<unknown>)

    return storageItem
  }

  /**
   * Utilitaires pour les patterns courants de l'application
   */

  /**
   * Gestion des personnes (pattern PersonsManager)
   */
  const usePersonsStorage = () => {
    return useStorageItem('persons', [], {
      validator: data =>
        Array.isArray(data) &&
        data.every(
          person =>
            person &&
            typeof person.id === 'string' &&
            typeof person.name === 'string'
        ),
    })
  }

  /**
   * Gestion des catégories de remboursement
   */
  const useReimbursementCategoriesStorage = () => {
    return useStorageItem('reimbursement-categories', [], {
      validator: data =>
        Array.isArray(data) &&
        data.every(
          category =>
            category &&
            typeof category.id === 'string' &&
            typeof category.name === 'string'
        ),
    })
  }

  /**
   * Gestion des assignations d'expenses
   */
  const useExpenseAssignmentsStorage = () => {
    return useStorageItem('expense-assignments', [], {
      validator: data => Array.isArray(data),
    })
  }

  /**
   * Migration des données depuis l'ancien format
   */
  const migrateOldData = () => {
    const migrations = [
      // Migration des personnes
      {
        oldKey: 'bankin-analyzer-persons',
        newKey: 'persons',
      },
      // Ajout d'autres migrations si nécessaire
    ]

    migrations.forEach(({ oldKey, newKey }) => {
      if (localStorage.getItem(oldKey) && !hasItem(newKey)) {
        try {
          const oldData = localStorage.getItem(oldKey)
          if (oldData) {
            localStorage.setItem(normalizeKey(newKey), oldData)
            localStorage.removeItem(oldKey)
          }
        } catch (error) {
          console.warn(`Erreur lors de la migration de ${oldKey}:`, error)
        }
      }
    })
  }

  return {
    // API de base
    getItem,
    setItem,
    removeItem,
    hasItem,
    clear,
    getKeys,
    getItemSize,
    isAvailable,

    // API réactive
    useStorageItem,

    // Utilitaires spécialisés
    usePersonsStorage,
    useReimbursementCategoriesStorage,
    useExpenseAssignmentsStorage,

    // Migration
    migrateOldData,
  }
}
