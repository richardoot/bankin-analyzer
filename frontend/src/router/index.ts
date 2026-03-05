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
    meta: { guestOnly: true },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfilePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/email-confirmation',
    name: 'email-confirmation',
    component: () => import('@/views/EmailConfirmationPage.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/import',
    name: 'import',
    component: () => import('@/views/ImportPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/import/recap',
    name: 'import-recap',
    component: () => import('@/views/ImportRecapPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/reimbursements',
    name: 'reimbursements',
    component: () => import('@/views/ReimbursementPage.vue'),
    meta: { requiresAuth: true },
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
})

export default router

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
  }
}
