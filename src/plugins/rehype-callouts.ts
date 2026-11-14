/**
 * Turns GitHub-style alert blockquotes into callout boxes:
 *
 *   > [!TAKEAWAY]
 *   > FUSE 回调里不要做阻塞 I/O。
 *
 *   > [!THEOREM] 4.5 轨迹层面的 Gibbs 最优解
 *   > 对每个 prompt x，最优条件分布为 …
 *
 * Systems-paper style: TAKEAWAY. ML-paper style: THEOREM, LEMMA, DEFINITION, PROPOSITION,
 * COROLLARY. GitHub's NOTE, TIP, IMPORTANT, WARNING, CAUTION are supported too.
 * Text after the marker on the first line becomes the box title.
 */
import type { Element, ElementContent, Root, RootContent, Text } from 'hast'

const KINDS: Record<string, { label: string; family: 'takeaway' | 'formal' | 'note' | 'warn' }> = {
  TAKEAWAY: { label: 'Takeaway', family: 'takeaway' },
  THEOREM: { label: 'Theorem', family: 'formal' },
  LEMMA: { label: 'Lemma', family: 'formal' },
  DEFINITION: { label: 'Definition', family: 'formal' },
  PROPOSITION: { label: 'Proposition', family: 'formal' },
  COROLLARY: { label: 'Corollary', family: 'formal' },
  NOTE: { label: 'Note', family: 'note' },
  TIP: { label: 'Tip', family: 'note' },
  IMPORTANT: { label: 'Important', family: 'note' },
  WARNING: { label: 'Warning', family: 'warn' },
  CAUTION: { label: 'Caution', family: 'warn' }
}

const MARKER = /^\s*\[!([A-Za-z]+)\][ \t]*([^\n]*)\n?/

function isElement(node: RootContent | ElementContent, tag?: string): node is Element {
  return node.type === 'element' && (!tag || node.tagName === tag)
}

function transform(node: Element) {
  const firstP = node.children.find((c) => isElement(c, 'p')) as Element | undefined
  if (!firstP) return
  const first = firstP.children[0]
  if (!first || first.type !== 'text') return
  const match = (first as Text).value.match(MARKER)
  if (!match) return
  const kind = KINDS[match[1].toUpperCase()]
  if (!kind) return

  const title = match[2].trim()
  ;(first as Text).value = (first as Text).value.slice(match[0].length)
  // Drop a leading line break left behind by the marker line
  if (!(first as Text).value) {
    firstP.children.shift()
    if (firstP.children[0] && isElement(firstP.children[0], 'br')) firstP.children.shift()
  }
  if (!firstP.children.length || firstP.children.every((c) => c.type === 'text' && !c.value.trim())) {
    node.children = node.children.filter((c) => c !== firstP)
  }

  const head: Element = {
    type: 'element',
    tagName: 'p',
    properties: { className: ['callout-head'] },
    children: [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['callout-label'] },
        children: [{ type: 'text', value: kind.label }]
      },
      ...(title
        ? [
            {
              type: 'element',
              tagName: 'span',
              properties: { className: ['callout-title'] },
              children: [{ type: 'text', value: title }]
            } as Element
          ]
        : [])
    ]
  }

  node.tagName = 'aside'
  node.properties = {
    ...node.properties,
    className: ['callout', `callout-${kind.family}`],
    dataCallout: match[1].toLowerCase()
  }
  node.children = [head, ...node.children]
}

function walk(node: Root | Element) {
  for (const child of node.children) {
    if (isElement(child as RootContent)) {
      const el = child as Element
      if (el.tagName === 'blockquote') transform(el)
      walk(el)
    }
  }
}

export default function rehypeCallouts() {
  return (tree: Root) => walk(tree)
}
