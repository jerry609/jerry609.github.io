/**
 * Marks h2s in posts that number their own sections (see src/utils/sections.ts).
 * Those h2s get class `h2-own`, and CSS drops the template's "01" counter label
 * for them, leaving only the section rule.
 */
import type { Element, ElementContent, Root } from 'hast'

import { sectionLabels } from '../utils/sections.ts'

function textOf(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return ''
  const cls = node.properties?.className
  if (Array.isArray(cls) && cls.includes('anchor')) return ''
  return node.children.map(textOf).join('')
}

function collect(node: Root | Element, out: Element[]) {
  for (const c of node.children) {
    if (c.type !== 'element') continue
    if (c.tagName === 'h2') out.push(c)
    else collect(c, out)
  }
}

export default function rehypeSectionNumbers() {
  return (tree: Root) => {
    const h2s: Element[] = []
    collect(tree, h2s)
    if (!h2s.length) return
    const { mode } = sectionLabels(h2s.map((h) => textOf(h)))
    if (mode !== 'own') return
    for (const h of h2s) {
      const cls = h.properties.className
      h.properties.className = [...(Array.isArray(cls) ? cls.map(String) : cls ? [String(cls)] : []), 'h2-own']
    }
  }
}
