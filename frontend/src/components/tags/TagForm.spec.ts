import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TagForm from './TagForm.vue'
import { emptyTagForm, TAG_COLORS } from './tagFormModel'

describe('TagForm', () => {
  it('hands every change back as one value', async () => {
    const wrapper = mount(TagForm, {
      props: {
        modelValue: emptyTagForm(),
        testId: 'tag',
        'onUpdate:modelValue': (value: unknown) =>
          wrapper.setProps({
            modelValue: value as ReturnType<typeof emptyTagForm>,
          }),
      },
    })

    await wrapper.find('[data-testid="tag-name"]').setValue('Vacances')
    await wrapper.findAll('button[aria-pressed]').at(2)?.trigger('click')
    await wrapper.find('[data-testid="tag-exceptional"]').setValue(true)
    // The event fields only exist for an exceptional tag.
    await wrapper.find('[data-testid="tag-event-start"]').setValue('2026-07-01')
    await wrapper.find('[data-testid="tag-event-end"]').setValue('2026-07-14')
    await wrapper.find('[data-testid="tag-budget"]').setValue('1 200,50')

    expect(wrapper.props('modelValue')).toEqual({
      name: 'Vacances',
      color: TAG_COLORS[2],
      isExceptional: true,
      eventStart: '2026-07-01',
      eventEnd: '2026-07-14',
      budget: 1200.5,
    })
  })

  it('keeps the event fields away from an everyday tag', () => {
    const wrapper = mount(TagForm, {
      props: { modelValue: emptyTagForm(), testId: 'tag' },
    })
    expect(wrapper.find('[data-testid="tag-event-start"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tag-budget"]').exists()).toBe(false)
  })
})
