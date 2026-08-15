<script setup lang="ts">
  import { computed, onBeforeUnmount, nextTick, ref, watch } from 'vue'
  import type { TagDto } from '@/lib/api'

  /**
   * Popover to attach/detach tags to an entity (typically a transaction) and to
   * create a new tag inline. Fully controlled: the parent owns persistence and
   * passes the current selection + the full tag list back in.
   */
  const props = withDefaults(
    defineProps<{
      selectedTagIds: string[]
      tags: TagDto[]
      /** Disable interactions while a mutation is in flight. */
      busy?: boolean
    }>(),
    { busy: false }
  )

  const emit = defineEmits<{
    (e: 'attach', tagId: string): void
    (e: 'detach', tagId: string): void
    (e: 'create', name: string): void
  }>()

  const open = ref(false)
  const search = ref('')
  const root = ref<HTMLElement | null>(null)
  const searchInput = ref<HTMLInputElement | null>(null)

  const selectedSet = computed(() => new Set(props.selectedTagIds))

  function normalize(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
  }

  const filteredTags = computed(() => {
    const q = normalize(search.value)
    if (!q) return props.tags
    return props.tags.filter(t => normalize(t.name).includes(q))
  })

  /** Whether the typed name would be a brand-new tag (no exact match). */
  const canCreate = computed(() => {
    const q = normalize(search.value)
    if (!q) return false
    return !props.tags.some(t => normalize(t.name) === q)
  })

  function toggle(tag: TagDto): void {
    if (props.busy) return
    if (selectedSet.value.has(tag.id)) emit('detach', tag.id)
    else emit('attach', tag.id)
  }

  function create(): void {
    const name = search.value.trim()
    if (!name || props.busy) return
    emit('create', name)
    search.value = ''
  }

  function onDocMouseDown(e: MouseEvent): void {
    if (root.value && !root.value.contains(e.target as Node)) {
      open.value = false
    }
  }

  watch(open, isOpen => {
    if (isOpen) {
      document.addEventListener('mousedown', onDocMouseDown)
      void nextTick(() => searchInput.value?.focus())
    } else {
      document.removeEventListener('mousedown', onDocMouseDown)
      search.value = ''
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocMouseDown)
  })
</script>

<template>
  <div ref="root" class="relative inline-block">
    <button
      type="button"
      class="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:border-emerald-400 hover:text-emerald-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 dark:border-slate-600 dark:text-slate-400 dark:hover:border-emerald-500"
      aria-label="Ajouter une étiquette"
      @click="open = !open"
    >
      <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
        <path
          d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
        />
      </svg>
      Étiquette
    </button>

    <div
      v-if="open"
      class="absolute z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
    >
      <input
        ref="searchInput"
        v-model="search"
        type="text"
        placeholder="Rechercher ou créer…"
        class="mb-2 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 focus:border-emerald-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        @keydown.enter.prevent="canCreate ? create() : null"
      />

      <ul class="max-h-52 space-y-0.5 overflow-y-auto">
        <li v-for="tag in filteredTags" :key="tag.id">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-slate-700"
            :disabled="busy"
            @click="toggle(tag)"
          >
            <span
              class="inline-block h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: tag.color ?? '#9ca3af' }"
            ></span>
            <span class="flex-1 truncate text-gray-700 dark:text-slate-200">{{
              tag.name
            }}</span>
            <svg
              v-if="selectedSet.has(tag.id)"
              class="h-3.5 w-3.5 text-emerald-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </li>

        <li v-if="filteredTags.length === 0 && !canCreate">
          <p class="px-2 py-1 text-xs text-gray-400">Aucune étiquette</p>
        </li>
      </ul>

      <button
        v-if="canCreate"
        type="button"
        class="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-slate-700"
        :disabled="busy"
        @click="create"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path
            d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
          />
        </svg>
        Créer « {{ search.trim() }} »
      </button>
    </div>
  </div>
</template>
