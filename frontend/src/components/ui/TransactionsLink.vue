<script setup lang="ts">
  import { computed } from 'vue'
  import { RouterLink, useRouter, type RouteLocationRaw } from 'vue-router'
  import IconArrowRight from '@/components/icons/IconArrowRight.vue'

  /**
   * « Voir les transactions → » — the one way a screen opens the
   * Transactions page on what it was showing. Styled as a link (primary,
   * the action hue), named for a screen reader by what it opens (« Voir
   * les transactions de Alimentation »), a 44px halo under a thumb, and
   * it stops the click from reaching the row or card it sits in: a link
   * is the end of a gesture, never the start of another.
   *
   * `to` comes from `transactionsLink()` in `lib/transactionsLink` — a
   * screen never spells the URL. `newTab` is for a link inside a dialog
   * holding a draft (a budget plan being written, a settlement being
   * composed): the draft stays where it is.
   */
  const props = withDefaults(
    defineProps<{
      to: RouteLocationRaw
      /** What the list will show: completes « Voir les transactions de … ». */
      subject?: string | undefined
      size?: 'sm' | 'md' | undefined
      newTab?: boolean | undefined
      /** The arrow alone, for a tight row; the name stays for a reader. */
      iconOnly?: boolean | undefined
    }>(),
    { subject: undefined, size: 'sm', newTab: false, iconOnly: false }
  )

  // A dialog mounted on its own in a spec has no router: the new-tab form
  // then points nowhere rather than throwing from a computed.
  const router = useRouter() as ReturnType<typeof useRouter> | undefined
  const href = computed(() => router?.resolve(props.to).href ?? '#')
  const name = computed(() =>
    props.subject
      ? `Voir les transactions de ${props.subject}`
      : 'Voir les transactions'
  )

  const classes = computed(() => [
    'relative inline-flex shrink-0 items-center gap-0.5 rounded font-medium text-primary-700 transition-colors hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
    "pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-3 pointer-coarse:before:content-['']",
    props.size === 'md' ? 'text-sm' : 'text-xs',
    props.iconOnly
      ? 'h-8 w-8 justify-center hover:bg-primary-50 dark:hover:bg-primary-900/20'
      : 'hover:underline underline-offset-2',
  ])
</script>

<template>
  <a
    v-if="newTab"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    :class="classes"
    :aria-label="name"
    :title="iconOnly ? name : undefined"
    data-testid="transactions-link"
    @click.stop
  >
    <span :class="iconOnly ? 'sr-only' : ''"
      ><slot>{{ name }}</slot></span
    >
    <IconArrowRight
      :class="size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'"
      aria-hidden="true"
    />
  </a>
  <RouterLink
    v-else
    :to="to"
    :class="classes"
    :aria-label="name"
    :title="iconOnly ? name : undefined"
    data-testid="transactions-link"
    @click.stop
  >
    <span :class="iconOnly ? 'sr-only' : ''"
      ><slot>{{ name }}</slot></span
    >
    <IconArrowRight
      :class="size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'"
      aria-hidden="true"
    />
  </RouterLink>
</template>
