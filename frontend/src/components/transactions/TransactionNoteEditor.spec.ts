import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import TransactionNoteEditor from './TransactionNoteEditor.vue'

enableAutoUnmount(afterEach)

describe('TransactionNoteEditor', () => {
  it('opens ready to type: focused and labelled', () => {
    const wrapper = mount(TransactionNoteEditor, { attachTo: document.body })
    const input = wrapper.get('input')

    expect(input.attributes('aria-label')).toBe('Note de la transaction')
    expect(document.activeElement).toBe(input.element)
  })

  it('names its two icon buttons', () => {
    const wrapper = mount(TransactionNoteEditor)
    const names = wrapper.findAll('button').map(b => b.attributes('aria-label'))
    expect(names).toEqual(['Enregistrer la note', 'Annuler la note'])
  })
})
