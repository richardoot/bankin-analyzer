import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TagFamilyField from './TagFamilyField.vue'
import { DEFAULT_TAG_COLOR, TAG_COLORS } from './tagFormModel'
import type { CreateTagFamilyDto, TagFamilyDto } from '@/lib/api'

function family(overrides: Partial<TagFamilyDto> = {}): TagFamilyDto {
  return {
    id: 'fam-1',
    name: 'Voyages',
    color: '#22c55e',
    icon: null,
    annualBudget: null,
    tagCount: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function mountField(
  options: {
    families?: TagFamilyDto[]
    familyId?: string | null
    createFamily?: (dto: CreateTagFamilyDto) => Promise<TagFamilyDto | null>
  } = {}
) {
  const createFamily =
    options.createFamily ?? vi.fn(() => Promise.resolve(null))
  const wrapper = mount(TagFamilyField, {
    props: {
      modelValue: options.familyId ?? null,
      families: options.families ?? [],
      createFamily,
      testId: 'tag',
      'onUpdate:modelValue': (value: string | null) =>
        wrapper.setProps({ modelValue: value }),
    },
  })
  return { wrapper, createFamily }
}

const select = (wrapper: ReturnType<typeof mountField>['wrapper']) =>
  wrapper.get<HTMLSelectElement>('select[data-testid="tag-family"]')

function optionTexts(
  wrapper: ReturnType<typeof mountField>['wrapper']
): string[] {
  return select(wrapper)
    .findAll('option')
    .map(o => o.text())
}

describe('TagFamilyField', () => {
  it('offers none, the user’s families and a new one', () => {
    const { wrapper } = mountField({
      families: [family(), family({ id: 'fam-2', name: 'HYROX' })],
      familyId: 'fam-2',
    })

    expect(optionTexts(wrapper)).toEqual([
      'Aucune',
      'Voyages',
      'HYROX',
      'Nouvelle famille…',
    ])
    expect(select(wrapper).element.value).toBe('fam-2')
  })

  it('suggests names while the user has no family, never « Gros achats »', () => {
    const { wrapper } = mountField()

    expect(optionTexts(wrapper)).toEqual([
      'Aucune',
      'Voyages',
      'Compétitions',
      'Concerts et fêtes',
      'Nouvelle famille…',
    ])
    expect(wrapper.text()).not.toContain('Gros achats')
  })

  it('writes nothing on a suggestion until the creation is confirmed', async () => {
    const created = family({ id: 'fam-new', name: 'Compétitions' })
    const createFamily = vi.fn(() => Promise.resolve(created))
    const { wrapper } = mountField({ createFamily })

    await select(wrapper).setValue('suggestion:Compétitions')

    expect(createFamily).not.toHaveBeenCalled()
    expect(wrapper.props('modelValue')).toBeNull()
    expect(
      wrapper.get<HTMLInputElement>('[data-testid="tag-new-family-name"]')
        .element.value
    ).toBe('Compétitions')

    // A colour of its own, then the confirmation.
    const swatches = wrapper
      .get('[data-testid="tag-new-family"]')
      .findAll('button[aria-pressed]')
    await swatches.at(3)?.trigger('click')
    await wrapper.get('[data-testid="tag-new-family-create"]').trigger('click')
    await flushPromises()

    expect(createFamily).toHaveBeenCalledWith({
      name: 'Compétitions',
      color: TAG_COLORS[3],
    })
    expect(wrapper.props('modelValue')).toBe('fam-new')
    expect(wrapper.find('[data-testid="tag-new-family"]').exists()).toBe(false)
  })

  it('creates a family named from scratch, with the default colour', async () => {
    const createFamily = vi.fn(() =>
      Promise.resolve(family({ id: 'fam-9', name: 'Mariages' }))
    )
    const { wrapper } = mountField({ families: [family()], createFamily })

    await select(wrapper).setValue('__new__')
    const create = wrapper.get('[data-testid="tag-new-family-create"]')
    expect(create.attributes('disabled')).toBeDefined()

    await wrapper
      .get('[data-testid="tag-new-family-name"]')
      .setValue('  Mariages ')
    await create.trigger('click')
    await flushPromises()

    expect(createFamily).toHaveBeenCalledWith({
      name: 'Mariages',
      color: DEFAULT_TAG_COLOR,
    })
    expect(wrapper.props('modelValue')).toBe('fam-9')
  })

  it('keeps the creation open when it failed', async () => {
    const createFamily = vi.fn(() => Promise.resolve(null))
    const { wrapper } = mountField({ createFamily })

    await select(wrapper).setValue('suggestion:Voyages')
    await wrapper.get('[data-testid="tag-new-family-create"]').trigger('click')
    await flushPromises()

    expect(wrapper.props('modelValue')).toBeNull()
    expect(wrapper.find('[data-testid="tag-new-family"]').exists()).toBe(true)
  })

  it('cancels back to the family that was chosen, writing nothing', async () => {
    const { wrapper, createFamily } = mountField({
      families: [family()],
      familyId: 'fam-1',
    })

    await select(wrapper).setValue('__new__')
    await wrapper.get('[data-testid="tag-new-family-cancel"]').trigger('click')

    expect(createFamily).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="tag-new-family"]').exists()).toBe(false)
    expect(select(wrapper).element.value).toBe('fam-1')
    expect(wrapper.props('modelValue')).toBe('fam-1')
  })

  it('takes the tag out of its family on « Aucune »', async () => {
    const { wrapper } = mountField({
      families: [family()],
      familyId: 'fam-1',
    })

    await select(wrapper).setValue('')

    expect(wrapper.props('modelValue')).toBeNull()
  })
})
