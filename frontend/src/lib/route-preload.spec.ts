import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { preloadRouteComponents } from './route-preload'

const Static = defineComponent({ render: () => h('div') })

function makeRouter() {
  const lazy = vi.fn(() => Promise.resolve({ default: Static }))
  const failing = vi.fn(() => Promise.reject(new Error('Failed to fetch')))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/accounts', component: lazy },
      { path: '/static', component: Static },
      { path: '/broken', component: failing },
      { path: '/data', redirect: '/accounts' },
    ],
  })
  return { router, lazy, failing }
}

describe('preloadRouteComponents', () => {
  it('calls the loader of the screen the URL points to', () => {
    const { router, lazy } = makeRouter()

    preloadRouteComponents(router, '/accounts?tab=1#top')

    expect(lazy).toHaveBeenCalledTimes(1)
  })

  it('leaves a redirect and a static component alone', () => {
    const { router, lazy } = makeRouter()

    preloadRouteComponents(router, '/data')
    preloadRouteComponents(router, '/static')
    preloadRouteComponents(router, '/nowhere')

    expect(lazy).not.toHaveBeenCalled()
  })

  it('swallows a failed fetch, which the router will report itself', async () => {
    const { router, failing } = makeRouter()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    preloadRouteComponents(router, '/broken')
    await new Promise(resolve => setTimeout(resolve, 0))

    process.off('unhandledRejection', unhandled)
    expect(failing).toHaveBeenCalledTimes(1)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
