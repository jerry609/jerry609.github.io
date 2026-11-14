/**
 * Wraps standalone Markdown images in a numbered figure:
 *
 *   ![Alt text becomes the figure title](image.png "Optional caption")
 *
 * renders as  FIG. N  ALT TEXT  /  [ image panel ]  /  caption
 * Numbering comes from a CSS counter (see .fig in global.css), so MDX <Figure>
 * components and Markdown images share one sequence.
 */
import type { Element, ElementContent, Root } from 'hast'

const isEl = (n: ElementContent | undefined, tag?: string): boolean =>
  !!n && n.type === 'element' && (!tag || (n as Element).tagName === tag)

function soleImage(p: Element): Element | undefined {
  const kids = p.children.filter((c) => !(c.type === 'text' && !c.value.trim()))
  if (kids.length !== 1) return undefined
  const k = kids[0] as Element
  if (isEl(k, 'img')) return k
  // An image wrapped in a link
  if (isEl(k, 'a') && k.children.length === 1 && isEl(k.children[0], 'img')) return k
  return undefined
}

function walk(node: Root | Element) {
  node.children.forEach((child, i) => {
    if (child.type !== 'element') return
    if (child.tagName === 'p') {
      const media = soleImage(child)
      if (media) {
        const img = isEl(media, 'img') ? media : (media.children[0] as Element)
        const alt = String(img.properties?.alt ?? '').trim()
        const caption = String(img.properties?.title ?? '').trim()
        const cls = img.properties.className
        img.properties.className = [...(Array.isArray(cls) ? cls : cls ? [String(cls)] : []), 'zoomable']
        delete img.properties.title
        const fig: Element = {
          type: 'element',
          tagName: 'figure',
          properties: { className: ['fig', 'not-prose-figure'] },
          children: [
            {
              type: 'element',
              tagName: 'div',
              properties: { className: ['fig-head'] },
              children: [
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { className: ['fig-title'] },
                  children: [{ type: 'text', value: alt }]
                }
              ]
            },
            {
              type: 'element',
              tagName: 'div',
              properties: { className: ['fig-panel'] },
              children: [media]
            },
            ...(caption
              ? [
                  {
                    type: 'element',
                    tagName: 'p',
                    properties: { className: ['fig-cap'] },
                    children: [{ type: 'text', value: caption }]
                  } as Element
                ]
              : [])
          ]
        }
        ;(node.children as ElementContent[])[i] = fig
        return
      }
    }
    walk(child)
  })
}

export default function rehypeFigures() {
  return (tree: Root) => walk(tree)
}
