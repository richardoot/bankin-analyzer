/**
 * Guessing where a legacy heading goes in the catalogue, so the migration
 * assistant opens already filled in and the user corrects rather than
 * types.
 *
 * ## What it knows
 *
 * The names people actually have: Bankin's own headings (every account seen
 * so far was born from a Bankin' export), the old seed's, and the variants
 * observed in production. Each maps to a catalogue key — a category
 * (`housing`) or a subcategory (`housing.rent`) — or to "unfile": a heading
 * like "Erreurs" or "Divers" that names no purpose, whose rows are better
 * sent back to the categoriser one by one than poured somewhere plausible.
 *
 * A few headings name a *context* the framework turned into a tag
 * ("Cadeaux", "Vacances", "Dépenses pro"). Those suggest the tag to attach
 * alongside the filing, so nothing the user encoded is lost.
 *
 * ## What it refuses to do
 *
 * Decide. Every guess is labelled with its basis and shown to the user; a
 * guess with no basis is a null, not a default. And a guess never crosses
 * the sign: an expense heading is never sent to an income category, or the
 * other way round — only transfers accept both.
 */

import { TransactionType } from '../generated/prisma'
import {
  CATEGORY_CATALOG,
  catalogCategory,
  catalogSubcategory,
} from './catalog'
import { normalizeName } from './category-catalog.plan'

export type SuggestionBasis =
  /** The legacy "category / subcategory" pair is known as such. */
  | 'pair'
  /** The legacy subcategory name is known on its own. */
  | 'subcategory'
  /** The legacy subcategory name is a catalogue label. */
  | 'catalog-label'
  /** Only the legacy category name is known; the row lands at the category. */
  | 'category'

export interface Suggestion {
  action: 'CATALOG' | 'UNFILE'
  /** Set on CATALOG. */
  categoryKey: string | null
  /** Set on CATALOG when the guess reaches a subcategory. */
  subcategoryKey: string | null
  /** A context the legacy heading encoded, to carry over as a tag. */
  tagName: string | null
  basis: SuggestionBasis
}

const UNFILE = 'unfile'

/** Legacy category name → catalogue key, or "unfile". */
const CATEGORY_HINTS: Record<string, string> = {
  // Bankin' expense headings, and the shapes they take once exported.
  'alimentation & restau.': 'food',
  'alimentation & restau': 'food',
  'alimentation et restau': 'food',
  'alimentation et restaurant': 'food',
  'alimentation compte joint': 'food',
  alimentation: 'food',
  'auto & transports': 'transport',
  'auto et transports': 'transport',
  transport: 'transport',
  transports: 'transport',
  logement: 'housing',
  'loisirs & sorties': 'leisure',
  'loisirs et sorties': 'leisure',
  loisirs: 'leisure',
  'achats & shopping': 'shopping',
  'achats et shopping': 'shopping',
  shopping: 'shopping',
  abonnements: 'telecom',
  sante: 'health',
  'esthetique & soins': 'shopping.beauty',
  'esthetique et soins': 'shopping.beauty',
  'impots & taxes': 'taxes',
  'impots et taxes': 'taxes',
  impots: 'taxes',
  banque: 'banking',
  'retraits, chq. et vir.': 'banking.cash-withdrawal',
  'retraits, cheques et virements': 'banking.cash-withdrawal',
  'scolarite et enfants': 'family',
  enfants: 'family',
  famille: 'family',
  divers: UNFILE,
  'depenses pro': UNFILE,
  // Headings seen in production.
  restaurant: 'dining.restaurant',
  restaurants: 'dining.restaurant',
  lessive: 'housing.laundry',
  hebergement: 'housing.lodging',
  coaching: 'leisure.lessons',
  formation: 'leisure.lessons',
  evenement: 'leisure.sports',
  'complements alimentaires': 'food.supplements',
  'high tech': 'shopping.tech',
  'high-tech': 'shopping.tech',
  cadeaux: 'shopping.other',
  parents: 'family.relatives',
  // Money lent to someone: filed with the family, netted by the ledger.
  prets: 'family.loan',
  pret: 'family.loan',
  vacances: UNFILE,
  voyages: UNFILE,
  erreurs: UNFILE,
  erreur: UNFILE,
  // Transfers, on either side.
  investissement: 'investment',
  epargne: 'emergency-savings',
  economies: 'emergency-savings',
  'virements internes': 'internal-transfer',
  'virement interne': 'internal-transfer',
  'alimenter compte joint': 'joint-contribution.mine',
  'alimenter compte courant': 'internal-transfer',
  "depot d'argent": 'joint-contribution',
  // Bankin' income headings.
  salaires: 'work-income.salary',
  salaire: 'work-income.salary',
  prime: 'work-income.bonus',
  primes: 'work-income.bonus',
  remboursements: 'refunds',
  remboursement: 'refunds',
  'remboursements (non actif)': 'refunds',
  'allocations et pensions': 'allowances',
  retraite: 'allowances.pension',
  ventes: 'occasional-income.sales',
  'autres rentrees': 'occasional-income.other',
  extra: 'occasional-income.other',
  services: 'work-income.freelance',
  'revenus locatifs': 'wealth-income.rent',
  'loyers recus': 'wealth-income.rent',
  interets: 'wealth-income.interest',
  emprunt: UNFILE,
}

/** A context the legacy category encoded, to carry over as a tag. */
const CATEGORY_TAGS: Record<string, string> = {
  cadeaux: 'Cadeaux',
  vacances: 'Vacances',
  voyages: 'Vacances',
  'depenses pro': 'Pro',
  parents: 'Parents',
}

/** "legacy category / legacy subcategory" → catalogue key, when the pair matters. */
const PAIR_HINTS: Record<string, string> = {
  'abonnements/sport': 'leisure.gym',
  'abonnements/salle de sport': 'leisure.gym',
  'loisirs & sorties/sport': 'leisure.sports',
  'loisirs et sorties/sport': 'leisure.sports',
  'auto & transports/entretien': 'transport.maintenance',
  'auto et transports/entretien': 'transport.maintenance',
  'auto & transports/location': 'transport.rental',
  'logement/entretien': 'housing.maintenance',
  'logement/logement - autres': 'housing.other',
  'achats & shopping/logement': 'shopping.home',
  'achats & shopping/appartement': 'shopping.home',
  'achats & shopping/vehicule': 'transport.maintenance',
  'hebergement/amis': 'food.local-shops',
  'remboursements/r sante': 'refunds.health',
  'remboursements/r achats et shopping': 'refunds.merchant',
  'remboursements/r articles de sport': 'refunds.merchant',
  'remboursements/r logement': 'refunds.health',
}

/** Legacy subcategory name → catalogue key, wherever it sits. */
const SUBCATEGORY_HINTS: Record<string, string> = {
  // Food
  'supermarche / epicerie': 'food.supermarket',
  'supermarche/epicerie': 'food.supermarket',
  supermarche: 'food.supermarket',
  epicerie: 'food.supermarket',
  courses: 'food.supermarket',
  boulangerie: 'food.local-shops',
  marche: 'food.local-shops',
  boucherie: 'food.local-shops',
  'complements alimentaires': 'food.supplements',
  'alimentation - autres': 'food.other',
  // Dining
  restaurants: 'dining.restaurant',
  restaurant: 'dining.restaurant',
  'sortie au restaurant': 'dining.restaurant',
  'fast foods': 'dining.fast-food',
  'fast-food': 'dining.fast-food',
  'fast food': 'dining.fast-food',
  livraison: 'dining.fast-food',
  cafe: 'dining.cafe-bar',
  'bars / clubs': 'dining.cafe-bar',
  'bars/clubs': 'dining.cafe-bar',
  bar: 'dining.cafe-bar',
  // Housing
  loyer: 'housing.rent',
  hypotheque: 'housing.rent',
  charges: 'housing.charges',
  'charges diverses': 'housing.charges',
  electricite: 'housing.energy',
  gaz: 'housing.energy',
  energie: 'housing.energy',
  eau: 'housing.water',
  'assurance habitation': 'housing.insurance',
  travaux: 'housing.maintenance',
  'exterieur / jardin': 'housing.maintenance',
  'exterieur et jardin': 'housing.maintenance',
  'exterieur/jardin': 'housing.maintenance',
  decoration: 'shopping.home',
  hotel: 'housing.lodging',
  airbnb: 'housing.lodging',
  hebergement: 'housing.lodging',
  lessive: 'housing.laundry',
  laverie: 'housing.laundry',
  pressing: 'housing.laundry',
  // Transport
  carburant: 'transport.fuel',
  essence: 'transport.fuel',
  // Bankin' lumps tickets and passes together; the pass is the exception.
  'transports en commun': 'transport.transit-tickets',
  'billets de train': 'transport.train',
  "billets d'avion": 'transport.plane',
  train: 'transport.train',
  avion: 'transport.plane',
  peage: 'transport.tolls',
  stationnement: 'transport.parking',
  parking: 'transport.parking',
  'entretien vehicule': 'transport.maintenance',
  'assurance vehicule': 'transport.insurance',
  'assurance auto': 'transport.insurance',
  'location de vehicule': 'transport.rental',
  taxi: 'transport.taxi',
  vtc: 'transport.taxi',
  vehicule: 'transport.vehicle-purchase',
  'auto & transports - autres': 'transport.other',
  // Health
  medecin: 'health.doctors',
  dentiste: 'health.optical-dental',
  opticien: 'health.optical-dental',
  optique: 'health.optical-dental',
  pharmacie: 'health.pharmacy',
  mutuelle: 'health.insurance',
  'sante - autres': 'health.other',
  // Telecom
  'telephonie mobile': 'telecom.phone',
  'telephonie fixe': 'telecom.phone',
  telephone: 'telecom.phone',
  internet: 'telecom.internet',
  'cable/satellite': 'telecom.internet',
  cloud: 'telecom.software',
  app: 'telecom.software',
  apps: 'telecom.software',
  ai: 'telecom.software',
  ia: 'telecom.software',
  logiciels: 'telecom.software',
  licenses: 'telecom.software',
  'services en ligne': 'telecom.software',
  'abonnements - autres': 'telecom.other',
  // Leisure
  musique: 'leisure.streaming',
  streaming: 'leisure.streaming',
  netflix: 'leisure.streaming',
  spotify: 'leisure.streaming',
  'films & dvd': 'leisure.streaming',
  'salle de sport': 'leisure.gym',
  sport: 'leisure.sports',
  sportif: 'leisure.sports',
  "sports d'hiver": 'leisure.sports',
  divertissements: 'leisure.outings',
  'sorties culturelles': 'leisure.outings',
  cinema: 'leisure.outings',
  concert: 'leisure.shows',
  concerts: 'leisure.shows',
  festival: 'leisure.shows',
  festivals: 'leisure.shows',
  spectacle: 'leisure.shows',
  spectacles: 'leisure.shows',
  theatre: 'leisure.shows',
  culturelle: 'leisure.outings',
  hobbies: 'leisure.hobbies',
  jeux: 'leisure.hobbies',
  loisir: 'leisure.other',
  livres: 'leisure.books',
  lecture: 'leisure.books',
  presse: 'leisure.books',
  'loisirs & sorties - autres': 'leisure.other',
  // Shopping
  'vetements/chaussures': 'shopping.clothing',
  vetements: 'shopping.clothing',
  chaussures: 'shopping.clothing',
  'high tech': 'shopping.tech',
  'high-tech': 'shopping.tech',
  electronique: 'shopping.tech',
  'articles de sport': 'shopping.sports-gear',
  maison: 'shopping.home',
  mobilier: 'shopping.home',
  electromenager: 'shopping.home',
  coiffeur: 'shopping.beauty',
  cosmetique: 'shopping.beauty',
  esthetique: 'shopping.beauty',
  'spa et massage': 'shopping.beauty',
  'esthetique & soins - autres': 'shopping.beauty',
  cadeaux: 'shopping.other',
  'achats & shopping - autres': 'shopping.other',
  // Family
  garde: 'family.childcare',
  'baby-sitters/creches': 'family.childcare',
  ecole: 'family.school',
  scolarite: 'family.school',
  'fournitures scolaires': 'family.school',
  jouets: 'family.kids-activities',
  pensions: 'family.alimony',
  dons: 'donations.associations',
  'frais animaux': 'family.pets',
  animaux: 'family.pets',
  // Taxes
  'impots sur le revenu': 'taxes.income-tax',
  'impots revenu': 'taxes.income-tax',
  'impots fonciers': 'taxes.property-tax',
  'taxe fonciere': 'taxes.property-tax',
  amendes: 'taxes.fines',
  taxes: 'taxes.other-taxes',
  tva: 'taxes.other-taxes',
  // Banking and transfers
  'frais bancaires': 'banking.fees',
  'services bancaires': 'banking.fees',
  'remboursement emprunt': 'banking.consumer-loan',
  prets: 'family.loan',
  retraits: 'banking.cash-withdrawal',
  epargne: 'emergency-savings',
  pea: 'investment',
  peg: 'investment',
  'assurance vie': 'investment',
  'virements internes': 'internal-transfer',
  // Headings that name no purpose: back to the categoriser, row by row.
  virements: UNFILE,
  'a categoriser': UNFILE,
  // Income
  'r sante': 'refunds.health',
  'r achats et shopping': 'refunds.merchant',
  'r articles de sport': 'refunds.merchant',
  'r erreur': 'refunds.other',
  'r erreurs': 'refunds.other',
}

/** A context the legacy subcategory encoded, to carry over as a tag. */
const SUBCATEGORY_TAGS: Record<string, string> = {
  cadeaux: 'Cadeaux',
  'voyages / vacances': 'Vacances',
  'voyages/vacances': 'Vacances',
  voyages: 'Vacances',
  vacances: 'Vacances',
  'notes de frais': 'Pro',
}

/**
 * Bankin' files every refund under "R <heading of the expense>". Anything
 * not caught above is money a person gave back, which is what the ledger
 * of reimbursements tracks.
 */
function refundPrefixHint(name: string): string | null {
  return /^r [a-z]/.test(name) ? 'refunds.person' : null
}

function isCompatible(key: string, legacyType: TransactionType): boolean {
  const categoryKey = key.includes('.') ? key.slice(0, key.indexOf('.')) : key
  const category = catalogCategory(categoryKey)
  if (!category) return false
  return (
    category.type === TransactionType.TRANSFER || category.type === legacyType
  )
}

function fromKey(
  key: string,
  basis: SuggestionBasis,
  tagName: string | null
): Suggestion {
  if (key.includes('.')) {
    const entry = catalogSubcategory(key)
    if (!entry) throw new Error(`Dictionary names an unknown key "${key}"`)
    return {
      action: 'CATALOG',
      categoryKey: entry.category.key,
      subcategoryKey: key,
      tagName,
      basis,
    }
  }
  if (!catalogCategory(key)) {
    throw new Error(`Dictionary names an unknown key "${key}"`)
  }
  return {
    action: 'CATALOG',
    categoryKey: key,
    subcategoryKey: null,
    tagName,
    basis,
  }
}

const unfile = (
  basis: SuggestionBasis,
  tagName: string | null
): Suggestion => ({
  action: 'UNFILE',
  categoryKey: null,
  subcategoryKey: null,
  tagName,
  basis,
})

/** A catalogue subcategory whose label is exactly this name, of a compatible type. */
function catalogLabelMatch(
  name: string,
  legacyType: TransactionType
): string | null {
  for (const category of CATEGORY_CATALOG) {
    if (
      category.type !== TransactionType.TRANSFER &&
      category.type !== legacyType
    )
      continue
    for (const sub of category.subcategories) {
      if (normalizeName(sub.label) === name && !sub.key.endsWith('.other')) {
        return sub.key
      }
    }
  }
  return null
}

/**
 * Where a legacy subcategory (or, with `legacySubcategory` null, the
 * transactions filed at the legacy category alone) most likely goes.
 */
export function suggestFiling(
  legacyCategory: string,
  legacySubcategory: string | null,
  legacyType: TransactionType
): Suggestion | null {
  const category = normalizeName(legacyCategory)
  const sub =
    legacySubcategory === null ? null : normalizeName(legacySubcategory)
  // The context the line encoded, at either level; the finer one wins.
  const tagName =
    (sub !== null ? SUBCATEGORY_TAGS[sub] : undefined) ??
    CATEGORY_TAGS[category] ??
    null

  if (sub !== null) {
    const pair = PAIR_HINTS[`${category}/${sub}`]
    if (pair && isCompatible(pair, legacyType)) {
      return fromKey(pair, 'pair', tagName)
    }

    const own = SUBCATEGORY_HINTS[sub] ?? refundPrefixHint(sub)
    if (own === UNFILE) return unfile('subcategory', tagName)
    if (own && isCompatible(own, legacyType)) {
      return fromKey(own, 'subcategory', tagName)
    }

    const label = catalogLabelMatch(sub, legacyType)
    if (label) return fromKey(label, 'catalog-label', tagName)
  }

  const hint = CATEGORY_HINTS[category]
  if (hint === UNFILE) return unfile('category', tagName)
  if (hint && isCompatible(hint, legacyType)) {
    return fromKey(hint, 'category', tagName)
  }

  // The legacy category bears a catalogue label outright.
  for (const entry of CATEGORY_CATALOG) {
    if (
      normalizeName(entry.label) === category &&
      isCompatible(entry.key, legacyType)
    ) {
      return fromKey(entry.key, 'category', tagName)
    }
  }

  return null
}
