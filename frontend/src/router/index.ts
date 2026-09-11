import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomePage.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginPage.vue'),
    meta: { title: 'Connexion', guestOnly: true },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfilePage.vue'),
    meta: { title: 'Mon profil', requiresAuth: true },
  },
  {
    path: '/email-confirmation',
    name: 'email-confirmation',
    component: () => import('@/views/EmailConfirmationPage.vue'),
    meta: { title: 'Confirmation d’e-mail', guestOnly: true },
  },
  {
    path: '/oauth/consent',
    name: 'oauth-consent',
    component: () => import('@/views/OAuthConsentPage.vue'),
    meta: { title: 'Autorisation', requiresAuth: true },
  },
  // Where the bank redirects after authorization. Public on purpose: the
  // request arrives from the bank in whatever session state the browser was
  // left in, and bouncing it to the login screen would drop the code from the
  // URL — the only thing the redirect carries.
  {
    path: '/bank-callback',
    name: 'bank-callback',
    component: () => import('@/views/BankCallbackPage.vue'),
    meta: { title: 'Connexion bancaire' },
  },
  {
    path: '/import',
    name: 'import',
    component: () => import('@/views/ImportPage.vue'),
    meta: { title: 'Import de transactions', requiresAuth: true },
  },
  {
    path: '/import/recap',
    name: 'import-recap',
    component: () => import('@/views/ImportRecapPage.vue'),
    meta: { title: 'Récapitulatif d’import', requiresAuth: true },
  },
  {
    path: '/import/history',
    name: 'import-history',
    component: () => import('@/views/ImportHistoryPage.vue'),
    meta: { title: 'Historique des imports', requiresAuth: true },
  },
  {
    path: '/bank-sync/history',
    name: 'bank-sync-history',
    component: () => import('@/views/BankSyncHistoryPage.vue'),
    meta: { title: 'Historique des synchronisations', requiresAuth: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardPage.vue'),
    meta: { title: 'Dashboard', requiresAuth: true },
  },
  {
    path: '/transactions',
    name: 'transactions',
    component: () => import('@/views/TransactionsPage.vue'),
    meta: { title: 'Transactions', requiresAuth: true },
  },
  {
    path: '/reimbursements',
    name: 'reimbursements',
    component: () => import('@/views/ReimbursementsPage.vue'),
    meta: { title: 'Remboursements', requiresAuth: true },
  },
  {
    path: '/budget',
    name: 'budget',
    component: () => import('@/views/BudgetPage.vue'),
    meta: { title: 'Budget', requiresAuth: true },
  },
  {
    path: '/tags',
    name: 'tags',
    component: () => import('@/views/TagsPage.vue'),
    meta: { title: 'Étiquettes', requiresAuth: true },
  },
  {
    path: '/tags/:id',
    name: 'tag-analysis',
    component: () => import('@/views/TagAnalysisPage.vue'),
    meta: { title: 'Analyse d’étiquette', requiresAuth: true },
  },
  {
    path: '/settings',
    component: () => import('@/views/settings/SettingsLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/settings/accounts' },
      {
        path: 'accounts',
        name: 'settings-accounts',
        meta: { title: 'Réglages · Comptes' },
        component: () => import('@/views/settings/AccountsSettingsPage.vue'),
      },
      {
        path: 'categories',
        name: 'settings-categories',
        meta: { title: 'Réglages · Catégories' },
        component: () => import('@/views/settings/CategoriesSettingsPage.vue'),
      },
      {
        path: 'general',
        name: 'settings-general',
        meta: { title: 'Réglages · Général' },
        component: () => import('@/views/settings/GeneralSettingsPage.vue'),
      },
    ],
  },
  // The settings hub replaced the single preferences page; keep old links working.
  {
    path: '/preferences',
    redirect: '/settings',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async to => {
  const authStore = useAuthStore()

  // Wait for auth to be initialized
  if (authStore.loading) {
    await new Promise<void>(resolve => {
      const unwatch = authStore.$subscribe(() => {
        if (!authStore.loading) {
          unwatch()
          resolve()
        }
      })
    })
  }

  // Redirect to login if route requires auth and user is not authenticated
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  // Redirect to profile if route is guest-only and user is authenticated
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return { name: 'profile' }
  }

  // Nothing to redirect to: let the navigation through. Said explicitly, since
  // falling off the end and returning a redirect are different instructions.
  return true
})

// One place names every page: the tab, the browser history and screen
// readers all read document.title, so a single afterEach keeps the routes
// from each remembering (or forgetting) to set it.
router.afterEach(to => {
  const title = to.meta.title
  document.title = title ? `${title} — Finance Analyzer` : 'Finance Analyzer'
})

export default router

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    /** Page name shown in the tab; the product name is appended once. */
    title?: string
  }
}
