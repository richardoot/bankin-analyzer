import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useIsMobile, useMediaQuery } from './useMediaQuery'

type Listener = (event: { matches: boolean }) => void

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>()
  const list = {
    matches: initial,
    addEventListener: vi.fn((_: string, cb: Listener) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: Listener) =>
      listeners.delete(cb)
    ),
  }
  const matchMedia = vi.fn(() => list)
  Object.defineProperty(window, 'matchMedia', {
    value: matchMedia,
    writable: true,
    configurable: true,
  })
  return {
    matchMedia,
    list,
    fire(matches: boolean) {
      listeners.forEach(cb => cb({ matches }))
    },
  }
}

const Probe = defineComponent({
  props: { query: { type: String, default: '(max-width: 767.98px)' } },
  setup(props) {
    const matches = useMediaQuery(props.query)
    return () => h('span', matches.value ? 'yes' : 'no')
  },
})

const originalMatchMedia = window.matchMedia

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: originalMatchMedia,
    writable: true,
    configurable: true,
  })
})

describe('useMediaQuery', () => {
  it('reads the initial match on mount and follows changes', async () => {
    const stub = stubMatchMedia(true)
    const wrapper = mount(Probe, { props: { query: '(max-width: 500px)' } })
    expect(stub.matchMedia).toHaveBeenCalledWith('(max-width: 500px)')
    expect(wrapper.text()).toBe('yes')

    stub.fire(false)
    await nextTick()
    expect(wrapper.text()).toBe('no')
  })

  it('stops listening when the component unmounts', () => {
    const stub = stubMatchMedia(false)
    const wrapper = mount(Probe)
    wrapper.unmount()
    expect(stub.list.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('answers false when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    const wrapper = mount(Probe)
    expect(wrapper.text()).toBe('no')
  })

  it('useIsMobile asks for widths below the md breakpoint', () => {
    const stub = stubMatchMedia(false)
    mount(
      defineComponent({
        setup() {
          const mobile = useIsMobile()
          return () => h('span', String(mobile.value))
        },
      })
    )
    expect(stub.matchMedia).toHaveBeenCalledWith('(max-width: 767.98px)')
  })
})
