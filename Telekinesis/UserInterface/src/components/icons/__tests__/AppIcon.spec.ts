import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppIcon from '../AppIcon.vue'
import { ICONS, type IconName } from '../icons'

const names = Object.keys(ICONS) as IconName[]
const TAGS = new Set(['path', 'circle', 'rect', 'line', 'ellipse', 'polyline'])

describe('icon set', () => {
  it('has a reasonable number of icons, each with at least one shape', () => {
    expect(names.length).toBeGreaterThan(30)
    for (const n of names) expect(ICONS[n].length, n).toBeGreaterThan(0)
  })

  it('only uses supported SVG elements and non-empty attributes', () => {
    for (const n of names)
      for (const [tag, attrs] of ICONS[n]) {
        expect(TAGS.has(tag), `${n}: ${tag}`).toBe(true)
        expect(Object.keys(attrs).length, n).toBeGreaterThan(0)
        for (const v of Object.values(attrs)) expect(String(v).length, n).toBeGreaterThan(0)
      }
  })

  it('every icon renders an svg with one element per shape', () => {
    for (const n of names) {
      const w = mount(AppIcon, { props: { name: n } })
      const svg = w.find('svg')
      expect(svg.exists(), n).toBe(true)
      expect(svg.attributes('data-icon-name')).toBe(n)
      expect(svg.element.querySelectorAll('path,circle,rect,line,ellipse,polyline').length, n).toBe(
        ICONS[n].length,
      )
    }
  })
})

describe('AppIcon', () => {
  it('is decorative by default (hidden from assistive tech) and 16 px', () => {
    const svg = mount(AppIcon, { props: { name: 'plug' } }).find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('role')).toBeUndefined()
    expect(svg.attributes('width')).toBe('16')
    expect(svg.attributes('height')).toBe('16')
    expect(svg.attributes('data-icon')).toBeDefined()
  })

  it('takes a size', () => {
    const svg = mount(AppIcon, { props: { name: 'plug', size: 32 } }).find('svg')
    expect(svg.attributes('width')).toBe('32')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
  })

  it('becomes an labelled image when given a title', () => {
    const w = mount(AppIcon, { props: { name: 'alert', title: 'Problem' } })
    const svg = w.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Problem')
    expect(svg.attributes('aria-hidden')).toBeUndefined()
    expect(w.find('title').text()).toBe('Problem')
  })

  it('follows the text colour and merges classes', () => {
    const svg = mount(AppIcon, {
      props: { name: 'loader' },
      attrs: { class: 'animate-spin text-accent' },
    }).find('svg')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.classes()).toEqual(
      expect.arrayContaining(['animate-spin', 'text-accent', 'shrink-0']),
    )
  })
})
