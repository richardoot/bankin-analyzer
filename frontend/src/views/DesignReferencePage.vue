<script setup lang="ts">
  /**
   * The design reference: tokens and bricks side by side, so a visual
   * review has one page to look at and a new screen has one page to copy
   * from. Registered in dev builds only — it documents the system, it is
   * not part of the product.
   */
  import { ref } from 'vue'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import BaseMenu from '@/components/ui/BaseMenu.vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
  import StepIndicator from '@/components/ui/StepIndicator.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
  import BaseSwitchRow from '@/components/ui/BaseSwitchRow.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import FilterChips from '@/components/ui/FilterChips.vue'
  import FilterDisclosure from '@/components/ui/FilterDisclosure.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'
  import type { FilterChip } from '@/components/ui/FilterChips.vue'
  import * as icons from '@/components/icons'
  import MonthBand from '@/components/dashboard/MonthBand.vue'
  import TodoCard from '@/components/dashboard/TodoCard.vue'
  import StructureLines from '@/components/dashboard/StructureLines.vue'
  import PeriodSummaryLines from '@/components/dashboard/PeriodSummaryLines.vue'
  import { DATA_HUE, STATE_BADGE_CLASSES } from '@/lib/stateTints'
  import {
    MONTH_SAMPLES,
    MONTH_SAMPLE_OPTIONS,
    STRUCTURE_SAMPLE,
    SUMMARY_SAMPLE,
    TODO_SAMPLE,
    type MonthSampleState,
  } from './designReferenceSamples'
  import {
    formatCompactCurrency,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatMonth,
  } from '@/lib/formatters'

  const PRIMARY_SHADES = [
    '50',
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
    '950',
  ] as const

  /**
   * The roles of style.css, one row each: what the hue is for, what it is
   * never for, and a sample drawn with the very classes a screen uses.
   */
  const ROLES = [
    {
      hue: 'primary',
      cls: 'bg-primary-600',
      use: 'Action et sélection : boutons, liens, segment ou ligne choisis, progression, anneaux de focus. Plein en 600 (survol 700), texte en 700 / 400 en sombre. Sur Budget, les chiffres du plan.',
      never: 'une donnée positive (c’est green).',
      sample:
        'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
      sampleLabel: 'Sélectionné',
    },
    {
      hue: 'red',
      cls: 'bg-red-600',
      use: 'Danger et négatif : destruction, erreurs, dépenses, tout dépassement (enveloppe, mois, réserve, épargne sous zéro).',
      never:
        'réinitialiser un filtre ou un brouillon, réessayer ; un chiffre ou un dépassement du tableau de bord (teintes d’état).',
      sample: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      sampleLabel: '⚠ Dépassé',
    },
    {
      hue: 'green',
      cls: 'bg-green-600',
      use: 'Donnée positive : revenus, argent reçu, dette réglée, épargne ou marge positive, import réussi, succès.',
      never:
        'une action (« Valider », « Pointer » sont primary) ; un chiffre du tableau de bord (teintes d’état).',
      sample:
        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      sampleLabel: 'Réglé',
    },
    {
      hue: 'amber',
      cls: 'bg-amber-500',
      use: 'Avertissement (InlineAlert warning, « À migrer », doublons à trancher) et donnée exceptionnelle : événements, projets, leur surcoût, mois en cours.',
      never: 'une action, un anneau de focus, un réglage neutre.',
      sample:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      sampleLabel: 'Exceptionnel',
    },
    {
      hue: 'teal',
      cls: 'bg-teal-500',
      use: 'Tableau de bord : l’état « sous l’habitude » ou une baisse (teintes d’état). Ailleurs : un achat lissé, ses tranches.',
      never: 'une action ; un chiffre lui-même (il reste à l’encre du texte).',
      sample: STATE_BADGE_CLASSES.under,
      sampleLabel: '−17 %',
    },
    {
      hue: 'debt',
      cls: 'bg-debt-500',
      use: 'Donnée de remboursement : montant dû, avatar de la personne, « Partiel », badge en attente. Alias d’amber.',
      never: 'une action ; une dette réglée (green).',
      sample:
        'bg-debt-100 text-debt-700 dark:bg-debt-900/30 dark:text-debt-300',
      sampleLabel: 'Partiel',
    },
    {
      hue: 'indigo',
      cls: 'bg-indigo-500',
      use: 'Donnée de référence : la colonne et le résumé « Historique » du budget, la période de comparaison du graphique.',
      never: 'une action, une sélection, un statut.',
      sample:
        'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
      sampleLabel: 'Historique',
    },
    {
      hue: 'blue',
      cls: 'bg-blue-600',
      use: 'Information : messages info, comptes ni bons ni mauvais, statut factuel (« À venir », « Auto », type de compte), abonnement sur une transaction.',
      never: 'une action.',
      sample:
        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      sampleLabel: 'À venir',
    },
    {
      hue: 'gray',
      cls: 'bg-gray-400',
      use: 'Tout le reste : textes, bordures, un virement (l’argent qui ne fait que bouger), un réglage (« Hors budget »).',
      never:
        'text-slate-* (le sombre pose ses surfaces en slate, le texte reste gray).',
      sample: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
      sampleLabel: 'Hors budget',
    },
  ]

  /** The dark theme's surface ladder, darkest last. */
  const DARK_SURFACES = [
    {
      cls: 'bg-slate-800',
      name: 'slate-800',
      use: 'Page (PageShell), champ, panneau dans une carte',
    },
    { cls: 'bg-slate-900', name: 'slate-900', use: 'Carte (BaseCard), modale' },
    {
      cls: 'bg-slate-700',
      name: 'slate-700',
      use: 'Bordure, survol, pastille neutre',
    },
  ]

  const WIDTHS = [
    {
      name: 'wide',
      px: '1 280 px',
      use: 'Dashboard, Transactions, Budget, Remboursements — tableaux et grilles denses',
    },
    {
      name: 'default',
      px: '1 024 px',
      use: 'Comptes, Récurrences, Étiquettes, Réglages, historiques — listes',
    },
    {
      name: 'narrow',
      px: '768 px',
      use: 'Import, Profil, pages légales, authentification — lecture et formulaire unique',
    },
  ]

  const SAMPLE_DATE = '2026-10-17T14:32:00'
  const FORMATS = [
    { call: 'formatDate(d)', out: formatDate(SAMPLE_DATE) },
    { call: "formatDate(d, 'medium')", out: formatDate(SAMPLE_DATE, 'medium') },
    { call: "formatDate(d, 'long')", out: formatDate(SAMPLE_DATE, 'long') },
    { call: 'formatDateTime(d)', out: formatDateTime(SAMPLE_DATE) },
    { call: "formatMonth('2026-02')", out: formatMonth('2026-02') },
    {
      call: "formatMonth(d, { style: 'long' })",
      out: formatMonth(SAMPLE_DATE, { style: 'long' }),
    },
    { call: 'formatCurrency(1234.5)', out: formatCurrency(1234.5) },
    {
      call: 'formatCompactCurrency(1234.5)',
      out: formatCompactCurrency(1234.5),
    },
    {
      call: 'formatCompactCurrency(3450, { compact: true })',
      out: formatCompactCurrency(3450, { compact: true }),
    },
  ]

  const ICONS = Object.entries(icons)

  const isModalOpen = ref(false)
  const isConfirmOpen = ref(false)
  const isWizardOpen = ref(false)
  const wizardStep = ref(1)
  const isTypedConfirmOpen = ref(false)

  function openWizard(): void {
    wizardStep.value = 1
    isWizardOpen.value = true
  }
  const demoMenuPick = ref('')
  const isButtonLoading = ref(false)
  const demoFilterOpen = ref(true)
  const demoField = ref('')
  const demoFieldError = ref<string | undefined>(undefined)
  const demoSelect = ref('date')
  const demoAmount = ref<number | null>(12.5)
  const demoDate = ref('2026-10-17')
  const demoChecked = ref(true)
  const demoSwitch = ref(false)
  const demoSwitchBusy = ref(false)
  const demoPeriod = ref('6m')
  const demoReading = ref<'everyday' | 'actual'>('everyday')
  const demoRetrying = ref(false)
  const demoMonthState = ref<MonthSampleState>('under')

  const demoChips = ref<FilterChip[]>([
    { key: 'type', label: 'Dépenses' },
    { key: 'category', label: 'Catégorie : Alimentation' },
    { key: 'q', label: '« carrefour »' },
  ])

  function simulateLoading(): void {
    isButtonLoading.value = true
    setTimeout(() => (isButtonLoading.value = false), 1500)
  }

  function simulateRetry(): void {
    demoRetrying.value = true
    setTimeout(() => (demoRetrying.value = false), 1500)
  }

  function flipSwitch(next: boolean): void {
    demoSwitchBusy.value = true
    setTimeout(() => {
      demoSwitch.value = next
      demoSwitchBusy.value = false
    }, 800)
  }

  function toggleFieldError(): void {
    demoFieldError.value = demoFieldError.value
      ? undefined
      : 'Ce champ est requis'
  }
</script>

<template>
  <PageShell>
    <PageHeader
      title="Référence design"
      subtitle="Jetons et briques, côte à côte — la page à copier pour tout nouvel écran"
    />

    <div class="space-y-8">
      <!-- Tokens -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Couleurs et rôles
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Une teinte, un sens — défini dans
          <code class="font-mono text-xs">style.css</code>. Une action passe par
          <code class="font-mono text-xs">BaseButton</code> /
          <code class="font-mono text-xs">BaseIconButton</code>, jamais par une
          teinte choisie pour son allure. Catégories, étiquettes et séries de
          graphiques sont des données, hors de ces rôles.
        </p>
        <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
          Échelle <code class="font-mono text-xs">primary-*</code> :
        </p>
        <div class="mb-6 flex flex-wrap gap-1">
          <div
            v-for="shade in PRIMARY_SHADES"
            :key="shade"
            class="flex flex-col items-center gap-1"
          >
            <!-- Theme CSS variables, not dynamic classes: Tailwind only
                   generates class names it can read statically. -->
            <div
              class="h-10 w-12 rounded"
              :style="{ backgroundColor: `var(--color-primary-${shade})` }"
            ></div>
            <span
              class="font-mono text-[10px] text-gray-500 dark:text-gray-400"
              >{{ shade }}</span
            >
          </div>
        </div>
        <ul
          class="divide-y divide-gray-100 dark:divide-slate-700"
          data-testid="design-color-roles"
        >
          <li
            v-for="entry in ROLES"
            :key="entry.hue"
            class="grid gap-2 py-3 text-sm sm:grid-cols-[7rem_1fr_auto] sm:items-start sm:gap-4"
          >
            <span class="flex items-center gap-2">
              <span class="h-4 w-4 shrink-0 rounded" :class="entry.cls"></span>
              <code
                class="font-mono text-xs text-gray-900 dark:text-gray-100"
                >{{ entry.hue }}</code
              >
            </span>
            <span class="text-gray-700 dark:text-gray-300">
              {{ entry.use }}
              <span
                class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400"
              >
                Jamais : {{ entry.never }}
              </span>
            </span>
            <span
              class="justify-self-start rounded-full px-2 py-0.5 text-xs font-medium"
              :class="entry.sample"
              >{{ entry.sampleLabel }}</span
            >
          </li>
        </ul>
        <SectionLabel as="h3" class="mt-6 mb-2">Surfaces sombres</SectionLabel>
        <ul class="flex flex-wrap gap-3">
          <li
            v-for="surface in DARK_SURFACES"
            :key="surface.name"
            class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
          >
            <span
              class="h-6 w-6 shrink-0 rounded border border-gray-200 dark:border-slate-600"
              :class="surface.cls"
            ></span>
            <code class="font-mono">{{ surface.name }}</code>
            · {{ surface.use }}
          </li>
        </ul>
      </BaseCard>

      <!-- Page shell & cards -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          PageShell · BaseCard · SectionLabel
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Cette page est dans un
          <code class="font-mono text-xs">PageShell</code>
          (fond, padding vertical, hauteur sous la navbar). Trois largeurs, pas
          une de plus :
        </p>
        <dl class="mb-6 grid gap-3 sm:grid-cols-3">
          <div
            v-for="w in WIDTHS"
            :key="w.name"
            class="rounded-lg border border-gray-200 p-3 dark:border-slate-700"
          >
            <dt class="font-mono text-xs text-gray-900 dark:text-gray-100">
              width="{{ w.name }}" · {{ w.px }}
            </dt>
            <dd class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ w.use }}
            </dd>
          </div>
        </dl>
        <div class="grid gap-4 bg-gray-50 p-4 sm:grid-cols-2 dark:bg-slate-800">
          <BaseCard>
            <SectionLabel class="mb-2">Carte par défaut</SectionLabel>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              <code class="font-mono text-xs">rounded-xl shadow-sm</code>,
              padding <code class="font-mono text-xs">p-4 sm:p-6</code>.
            </p>
          </BaseCard>
          <BaseCard variant="raised" padding="lg">
            <SectionLabel as="h3" class="mb-2">Carte « raised »</SectionLabel>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              La carte qui <em>est</em> la page (connexion, réglages, import) :
              <code class="font-mono text-xs">rounded-2xl shadow-lg</code>.
            </p>
          </BaseCard>
        </div>
      </BaseCard>

      <!-- Buttons -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          BaseButton · BaseIconButton
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Un seul état désactivé (opacité 50 %), 44 px sous le pouce, et
          <code class="font-mono text-xs">to</code> rend un RouterLink au même
          aspect. L'icône seule porte toujours un
          <code class="font-mono text-xs">label</code> et son halo tactile.
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <BaseButton>Primaire</BaseButton>
          <BaseButton variant="tinted">Teinté</BaseButton>
          <BaseButton variant="secondary">Secondaire</BaseButton>
          <BaseButton variant="danger">Danger</BaseButton>
          <BaseButton variant="danger-outline">Danger discret</BaseButton>
          <BaseButton variant="ghost">Fantôme</BaseButton>
          <BaseButton size="sm">Petit</BaseButton>
          <BaseButton disabled>Désactivé</BaseButton>
          <BaseButton to="/design" variant="secondary">
            <icons.IconArrowLeft class="h-4 w-4" />
            Lien-bouton
          </BaseButton>
          <BaseButton :loading="isButtonLoading" @click="simulateLoading">
            {{ isButtonLoading ? 'Chargement…' : 'Simuler un chargement' }}
          </BaseButton>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <BaseIconButton label="Modifier">
            <icons.IconPencil />
          </BaseIconButton>
          <BaseIconButton label="Supprimer" variant="danger">
            <icons.IconTrash />
          </BaseIconButton>
          <BaseIconButton label="Fermer" size="sm">
            <icons.IconClose />
          </BaseIconButton>
          <BaseIconButton label="Voir" variant="primary" size="sm">
            <icons.IconEye />
          </BaseIconButton>
          <BaseIconButton label="Chargement" loading>
            <icons.IconRefresh />
          </BaseIconButton>
          <BaseIconButton label="Désactivé" disabled>
            <icons.IconTrash />
          </BaseIconButton>
        </div>
      </BaseCard>

      <!-- Menu -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          BaseMenu
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Les actions d'une ligne à la demande, derrière un « … » : un bouton de
          menu qui dit s'il est déplié, des flèches pour parcourir, Échap pour
          fermer et revenir au bouton, l'élément en focus dessiné. Il s'ouvre
          vers le haut quand la fenêtre n'a plus de place en bas.
        </p>
        <div class="flex items-center gap-3">
          <BaseMenu
            label="Actions de la ligne"
            :items="[
              {
                key: 'note',
                label: 'Ajouter une note',
                icon: icons.IconPencil,
              },
              {
                key: 'tag',
                label: 'Ajouter une étiquette',
                icon: icons.IconTag,
              },
              { key: 'off', label: 'Indisponible', disabled: true },
              {
                key: 'unlink',
                label: 'Détacher',
                icon: icons.IconClose,
                danger: true,
              },
            ]"
            @select="key => (demoMenuPick = key)"
          />
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{
              demoMenuPick ? `Choisi : ${demoMenuPick}` : 'Rien choisi encore'
            }}
          </span>
        </div>
      </BaseCard>

      <!-- Segmented control -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          SegmentedControl
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Un groupe radio : flèches pour changer, un seul arrêt Tab, sélection
          en primary, 44 px sous le pouce.
          <code class="font-mono text-xs">fullWidth</code> étale les options sur
          un téléphone.
        </p>
        <div class="space-y-4">
          <SegmentedControl
            v-model="demoPeriod"
            label="Période"
            full-width
            :options="[
              { value: '3m', label: '3 mois', shortLabel: '3M' },
              { value: '6m', label: '6 mois', shortLabel: '6M' },
              { value: '1y', label: '1 an', shortLabel: '1A' },
              { value: 'all', label: 'Tout' },
              { value: 'custom', label: 'Personnalisé', shortLabel: 'Perso.' },
            ]"
          />
          <div class="flex items-center gap-3">
            <SectionLabel id="design-reading-label" as="span">
              Lecture
            </SectionLabel>
            <SegmentedControl
              v-model="demoReading"
              labelled-by="design-reading-label"
              size="sm"
              :options="[
                { value: 'everyday', label: 'Vie courante' },
                { value: 'actual', label: 'Réel' },
              ]"
            />
          </div>
        </div>
      </BaseCard>

      <!-- Inline alerts -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          InlineAlert
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Le message qui appartient à la page. L'erreur est annoncée tout de
          suite (<code class="font-mono text-xs">role="alert"</code>), les
          autres attendent (<code class="font-mono text-xs">status</code>). «
          Réessayer » vit dans le message.
        </p>
        <div class="space-y-3">
          <InlineAlert
            title="Le tableau de bord n'a pas pu être chargé."
            retry-label="Réessayer"
            :retrying="demoRetrying"
            @retry="simulateRetry"
          >
            Les chiffres affichés sont ceux du dernier chargement réussi.
          </InlineAlert>
          <InlineAlert variant="warning">
            Votre consentement bancaire expire dans 3 jours.
          </InlineAlert>
          <InlineAlert variant="info">
            Les moyennes excluent les dépenses exceptionnelles.
          </InlineAlert>
          <InlineAlert variant="success">Règlement enregistré.</InlineAlert>
        </div>
      </BaseCard>

      <!-- Modals -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
          BaseModal · ConfirmDialog
        </h2>
        <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
          Échap ferme, Tab reste dedans, le focus revient au déclencheur —
          fourni par la brique, jamais réécrit. Sous <code>sm</code> la boîte
          devient une feuille en bas d'écran et le pied s'empile. Un assistant
          prend une flèche de retour (<code>backLabel</code>), un sous-en-tête
          fixe (<code>#subheader</code>) et une garde de brouillon
          (<code>dirty</code>) ; une suppression irréversible demande le nom
          (<code>typedConfirmation</code>).
        </p>
        <div class="flex flex-wrap gap-3">
          <BaseButton variant="secondary" @click="isModalOpen = true">
            Ouvrir une BaseModal
          </BaseButton>
          <BaseButton variant="secondary" @click="openWizard">
            Ouvrir un assistant
          </BaseButton>
          <BaseButton variant="danger-outline" @click="isConfirmOpen = true">
            Ouvrir un ConfirmDialog
          </BaseButton>
          <BaseButton
            variant="danger-outline"
            @click="isTypedConfirmOpen = true"
          >
            ConfirmDialog avec saisie du nom
          </BaseButton>
        </div>
      </BaseCard>

      <!-- Fields -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          BaseField · BaseCheckbox · BaseSwitchRow · FilterChips
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Un champ, trois contrôles (<code class="font-mono text-xs">input</code
          >, <code class="font-mono text-xs">select</code>,
          <code class="font-mono text-xs">textarea</code>) ; le mode
          <code class="font-mono text-xs">amount</code> lit « 12,5 » comme 12.5
          ; <code class="font-mono text-xs">size="sm"</code> pour les
          formulaires de réglages.
        </p>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-4">
            <BaseField
              v-model="demoField"
              label="Un champ avec erreur annoncée"
              placeholder="Tapez quelque chose…"
              :error="demoFieldError"
            />
            <BaseButton variant="secondary" size="sm" @click="toggleFieldError">
              Basculer l'erreur
            </BaseButton>
            <BaseField
              v-model="demoAmount"
              label="Montant"
              amount
              hint="Clavier décimal, virgule acceptée"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Modèle : <code class="font-mono">{{ demoAmount }}</code>
            </p>
          </div>
          <div class="space-y-4">
            <BaseField
              v-model="demoSelect"
              label="Trier par"
              as="select"
              size="sm"
            >
              <option value="date">Date</option>
              <option value="amount">Montant</option>
            </BaseField>
            <BaseField v-model="demoDate" label="Du" type="date" size="sm" />
            <BaseCheckbox
              v-model="demoChecked"
              label="Importer cette ligne"
              description="La case est petite, la ligne entière est la cible."
            />
            <BaseSwitchRow
              :checked="demoSwitch"
              :loading="demoSwitchBusy"
              label="Déduire les remboursements en attente"
              description="Le texte bascule aussi l'interrupteur."
              @change="flipSwitch"
            />
          </div>
        </div>
        <div class="mt-6">
          <FilterChips
            :chips="demoChips"
            @remove="key => (demoChips = demoChips.filter(c => c.key !== key))"
            @clear="demoChips = []"
          />
          <p
            v-if="demoChips.length === 0"
            class="text-sm text-gray-500 dark:text-gray-400"
          >
            (toutes retirées — rechargez la page)
          </p>
        </div>
      </BaseCard>

      <!-- Filter card -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          FilterDisclosure
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Tout visible sur un bureau ; sous 768px les contrôles se replient
          derrière « Filtres » et la recherche reste seule en tête. Ci-dessous :
          repliée par défaut, puis ouverte.
        </p>
        <div class="space-y-4 bg-gray-50 p-3 dark:bg-slate-800">
          <FilterDisclosure
            v-for="variant in ['folded', 'open']"
            :key="variant"
            :active-count="variant === 'open' ? 2 : 0"
            :expanded="variant === 'open' ? demoFilterOpen : false"
            @update:expanded="variant === 'open' && (demoFilterOpen = $event)"
          >
            <template #search>
              <BaseField
                label="Rechercher"
                label-hidden
                type="search"
                placeholder="Rechercher…"
                size="sm"
              />
            </template>
            <div class="grid grid-cols-2 gap-3 md:flex md:items-end">
              <BaseField
                v-for="name in ['Type', 'Catégorie', 'Compte']"
                :key="name"
                :label="name"
                as="select"
                size="sm"
                class="md:w-36"
              >
                <option>Tous</option>
              </BaseField>
            </div>
            <template #summary>2 213 transaction(s)</template>
            <template #actions>
              <BaseButton variant="secondary" size="sm">Action</BaseButton>
            </template>
          </FilterDisclosure>
        </div>
      </BaseCard>

      <!-- Links to the Transactions page -->
      <BaseCard
        as="section"
        padding="lg"
        data-testid="design-transactions-link"
      >
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Voir les transactions · TransactionsLink
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Partout où un écran montre des transactions ou un chiffre qui en
          additionne, ce lien ouvre la page Transactions sur exactement ce qu'on
          regardait. La route vient toujours de
          <code class="font-mono text-xs">transactionsLink()</code>
          (<code class="font-mono text-xs">lib/transactionsLink</code>) : champs
          nommés, jamais une URL écrite à la main. Un lien remplace les filtres
          de la page ; <code class="font-mono text-xs">gross</code> fait dire au
          bandeau que les montants sont complets quand le chiffre de départ
          était net ou partagé. Le nom accessible est « Voir les transactions de
          … » ; le clic ne remonte pas à la ligne qui l'héberge.
        </p>
        <div class="flex flex-wrap items-center gap-6">
          <TransactionsLink
            :to="transactionsLink({ categoryId: 'demo', gross: true })"
            subject="Alimentation"
          />
          <TransactionsLink
            :to="transactionsLink({ tagId: 'demo' })"
            subject="Vacances"
            size="md"
          >
            Voir les 12 transactions
          </TransactionsLink>
          <TransactionsLink
            :to="transactionsLink({ ids: ['demo'] })"
            subject="cette dette"
            icon-only
          />
          <TransactionsLink
            :to="transactionsLink({ importId: 'demo' })"
            subject="cet import"
            new-tab
          >
            Dans un nouvel onglet
          </TransactionsLink>
        </div>
      </BaseCard>

      <!-- Icons -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Icônes
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          <code class="font-mono text-xs">components/icons/</code> : filaires,
          24 unités, couleur du texte, taille par la classe. Une icône de plus
          est un fichier de plus, jamais un
          <code class="font-mono text-xs">&lt;svg&gt;</code> inline.
        </p>
        <ul class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          <li
            v-for="[name, Icon] in ICONS"
            :key="name"
            class="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-slate-700"
          >
            <component
              :is="Icon"
              class="h-6 w-6 text-gray-700 dark:text-gray-200"
            />
            <span class="font-mono text-[10px] text-gray-500">{{ name }}</span>
          </li>
        </ul>
      </BaseCard>

      <!-- Mobile navigation -->
      <BaseCard as="section" padding="lg" data-testid="design-tab-bar">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Navigation mobile · AppTabBar
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Sous <code class="font-mono text-xs">lg</code>, sur les pages
          connectées (pas la vitrine, la connexion, les pages légales ni le
          retour bancaire ; <code class="font-mono text-xs">meta.tabBar</code> à
          <code class="font-mono text-xs">false</code> pour en exclure une) :
          Dashboard · Transactions · Budget · Récurrences · Plus. « Plus » ouvre
          le menu, en feuille posée sur la barre ; le hamburger du haut ne reste
          que là où la barre n'est pas.
        </p>
        <ul
          class="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300"
        >
          <li>
            La place est réservée par
            <code class="font-mono text-xs">--tab-bar-space</code> (fond de
            page, menu, toasts) — un élément fixé en bas s'appuie dessus, jamais
            sur <code class="font-mono text-xs">bottom-0</code> seul.
          </li>
          <li>
            Un mode qui apporte sa propre barre basse (sélection de
            Transactions, édition du Budget) prend la place de la barre :
            <code class="font-mono text-xs">useSuppressTabBar(mode)</code>.
          </li>
          <li>
            La barre s'efface pendant la saisie sur écran tactile, sans rendre
            sa place : la page ne saute pas quand le clavier s'ouvre.
          </li>
          <li>Les modales et les toasts passent toujours par-dessus.</li>
        </ul>
      </BaseCard>

      <!-- Dashboard: the state tints and the bricks of the page -->
      <BaseCard as="section" padding="lg" data-testid="design-state-tints">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Teintes d'état
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Sur le tableau de bord, les chiffres sont à l'encre du texte ; la
          couleur ne dit qu'un état, en trois teintes tirées de
          <code class="font-mono text-xs">lib/stateTints</code>. L'ambre sert
          aussi « À faire », et rien d'autre ; jamais de rouge ni de vert sur
          une donnée. La donnée elle-même (une barre, la ligne d'une sparkline)
          a une seule teinte.
        </p>
        <ul class="grid gap-3 text-sm sm:grid-cols-2">
          <li class="flex items-center gap-3">
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums"
              :class="STATE_BADGE_CLASSES.under"
              >−17 %</span
            >
            <span class="text-gray-700 dark:text-gray-300"
              >teal : sous l'habitude, une baisse</span
            >
          </li>
          <li class="flex items-center gap-3">
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums"
              :class="STATE_BADGE_CLASSES.over"
              >+16 %</span
            >
            <span class="text-gray-700 dark:text-gray-300"
              >ambre : au-dessus, une hausse, un dépassement, « À faire »</span
            >
          </li>
          <li class="flex items-center gap-3">
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
              :class="STATE_BADGE_CLASSES.neutral"
              >dans l'habitude</span
            >
            <span class="text-gray-700 dark:text-gray-300"
              >gris : à ±5 % près, ou rien à comparer</span
            >
          </li>
          <li class="flex items-center gap-3">
            <span
              class="h-3 w-10 shrink-0 rounded-full"
              :style="{ backgroundColor: DATA_HUE }"
            ></span>
            <span class="text-gray-700 dark:text-gray-300"
              ><code class="font-mono text-xs">blue-400</code> : la donnée, les
              événements en hachures de la même teinte</span
            >
          </li>
        </ul>
      </BaseCard>

      <BaseCard as="section" padding="lg" data-testid="design-dashboard">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Tableau de bord
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Les briques de la page, sur des chiffres inventés.
          <code class="font-mono text-xs">MonthBand</code> dans chacun de ses
          états : la page possède la requête, une erreur reste dans la bande.
        </p>
        <SegmentedControl
          v-model="demoMonthState"
          label="État de la bande du mois"
          size="sm"
          scrollable
          class="mb-4"
          :options="MONTH_SAMPLE_OPTIONS"
        />
        <MonthBand
          :data="MONTH_SAMPLES[demoMonthState].data"
          :error="MONTH_SAMPLES[demoMonthState].error"
          reading="everyday"
        />

        <SectionLabel as="h3" class="mt-8 mb-2">TodoCard</SectionLabel>
        <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Quatre lignes, puis « et N autres » ; absente quand rien n'est à
          faire.
        </p>
        <TodoCard :items="TODO_SAMPLE" />

        <SectionLabel as="h3" class="mt-8 mb-2">
          StructureLines · PeriodSummaryLines
        </SectionLabel>
        <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Le haut et le bas de « Où part l'argent », sur douze mois dont onze
          clos.
        </p>
        <div class="space-y-6">
          <StructureLines
            :actual="STRUCTURE_SAMPLE.actual"
            :everyday="STRUCTURE_SAMPLE.everyday"
            reading="everyday"
            :period-months="STRUCTURE_SAMPLE.periodMonths"
          />
          <PeriodSummaryLines
            :average-income="SUMMARY_SAMPLE.averageIncome"
            :average-savings="SUMMARY_SAMPLE.averageSavings"
            :period-months="SUMMARY_SAMPLE.periodMonths"
            :income-sources="SUMMARY_SAMPLE.incomeSources"
            :income-link="transactionsLink({ type: 'INCOME' })"
            :events="SUMMARY_SAMPLE.events"
            :families="SUMMARY_SAMPLE.families"
            has-exceptional-expenses
          />
        </div>
      </BaseCard>

      <!-- Formatters -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Formats
        </h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          <code class="font-mono text-xs">lib/formatters</code> : une date se
          lit « 17/10/2026 » dans une liste, « 17 oct. 2026 » dans une puce, «
          17 octobre 2026 » dans une phrase ; un mois s'abrège toujours de la
          même façon.
        </p>
        <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <template v-for="f in FORMATS" :key="f.call">
            <dt class="font-mono text-xs text-gray-500 dark:text-gray-400">
              {{ f.call }}
            </dt>
            <dd class="text-gray-900 dark:text-gray-100">{{ f.out }}</dd>
          </template>
        </dl>
      </BaseCard>

      <!-- Empty & loading -->
      <BaseCard as="section" padding="lg">
        <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
          EmptyState · SkeletonBlock
        </h2>
        <div class="grid gap-6 md:grid-cols-2">
          <div class="rounded-lg border border-gray-200 dark:border-slate-700">
            <EmptyState
              title="Aucun élément"
              description="Une page vide dit pourquoi, et offre une issue."
            >
              <template #icon>
                <icons.IconSearch class="h-8 w-8" :stroke-width="1.5" />
              </template>
              <template #action>
                <BaseButton size="sm">L'issue</BaseButton>
              </template>
            </EmptyState>
          </div>
          <div class="space-y-3 p-4">
            <SkeletonBlock class="h-24 rounded-xl" />
            <SkeletonBlock :lines="3" />
          </div>
        </div>
      </BaseCard>
    </div>

    <BaseModal
      :open="isModalOpen"
      title="Une BaseModal"
      @close="isModalOpen = false"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Essayez Échap, Tab et Maj+Tab : le clavier ne quitte pas cette boîte, et
        le focus reviendra sur le bouton qui l'a ouverte.
      </p>
      <template #footer>
        <BaseButton variant="secondary" @click="isModalOpen = false">
          Fermer
        </BaseButton>
        <BaseButton @click="isModalOpen = false">Valider</BaseButton>
      </template>
    </BaseModal>

    <BaseModal
      :open="isWizardOpen"
      title="Un assistant"
      :subtitle="wizardStep === 1 ? 'Étape 1 : choisir' : 'Étape 2 : vérifier'"
      max-width="lg"
      :back-label="wizardStep > 1 ? 'Retour' : undefined"
      dirty
      @back="wizardStep = 1"
      @close="isWizardOpen = false"
    >
      <template #subheader>
        <StepIndicator :steps="['Choisir', 'Vérifier']" :current="wizardStep" />
      </template>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Le fond, la croix et Échap demandent confirmation avant de jeter le
        brouillon ; la flèche d'en-tête ramène à l'étape précédente.
      </p>
      <template #footer-start>
        <span class="text-gray-500 dark:text-gray-400">
          Récapitulatif en pied, à gauche des actions.
        </span>
      </template>
      <template #footer>
        <BaseButton variant="secondary" @click="isWizardOpen = false">
          Annuler
        </BaseButton>
        <BaseButton v-if="wizardStep === 1" @click="wizardStep = 2">
          Suivant
        </BaseButton>
        <BaseButton v-else @click="isWizardOpen = false">Terminer</BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="isConfirmOpen"
      title="Supprimer cet exemple ?"
      @confirm="isConfirmOpen = false"
      @cancel="isConfirmOpen = false"
    >
      La question destructrice standard : annuler discret à gauche, confirmer
      rouge à droite.
    </ConfirmDialog>

    <ConfirmDialog
      :open="isTypedConfirmOpen"
      title="Supprimer « Livret A » ?"
      typed-confirmation="Livret A"
      @confirm="isTypedConfirmOpen = false"
      @cancel="isTypedConfirmOpen = false"
    >
      Le bouton rouge reste verrouillé tant que le nom n'est pas retapé.
    </ConfirmDialog>
  </PageShell>
</template>
