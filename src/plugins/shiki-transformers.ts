import { h } from 'hastscript'
import type { ShikiTransformer } from 'shiki'

export {
  transformerNotationDiff,
  transformerNotationHighlight
} from './shiki-official-transformers'

function parseMetaString(str = '') {
  return Object.fromEntries(
    str.split(' ').reduce((acc: [string, string | true][], cur) => {
      const matched = cur.match(/(.+)?=("(.+)"|'(.+)')$/)
      if (matched === null) return acc
      const key = matched[1]
      const value = matched[3] || matched[4] || true
      acc = [...acc, [key, value]]
      return acc
    }, [])
  )
}

// Nest a div in the outer layer
export const updateStyle = (): ShikiTransformer => {
  return {
    name: 'shiki-transformer-update-style',
    pre(node) {
      const container = h('pre', node.children)
      node.children = [container]
      node.tagName = 'div'
    }
  }
}

// Process meta string, like ```ts title="test.ts"
export const processMeta = (): ShikiTransformer => {
  return {
    name: 'shiki-transformer-process-meta',
    preprocess() {
      if (!this.options.meta) return
      const rawMeta = this.options.meta?.__raw
      if (!rawMeta) return
      const meta = parseMetaString(rawMeta)
      Object.assign(this.options.meta, meta)
    }
  }
}

// Add a title to the code block
export const addTitle = (): ShikiTransformer => {
  return {
    name: 'shiki-transformer-add-title',
    pre(node) {
      const rawMeta = this.options.meta?.__raw
      if (!rawMeta) return
      const meta = parseMetaString(rawMeta)
      // If meta is needed to parse in other transformers
      // if (this.options.meta) {
      //   Object.assign(this.options.meta, meta)
      // }

      if (!meta.title) return

      const div = h(
        'div',
        {
          class: 'title text-sm text-foreground px-3 py-1 bg-primary-foreground rounded-lg border'
        },
        meta.title.toString()
      )
      node.children.unshift(div)
    }
  }
}

// Add a language tag to the code block
export const addLanguage = (): ShikiTransformer => {
  return {
    name: 'shiki-transformer-add-language',
    pre(node) {
      const span = h(
        'span',
        {
          class: 'language ps-1 pe-3 text-sm bg-muted text-muted-foreground'
        },
        this.options.lang
      )
      node.children.push(span)
    }
  }
}

// Add a copy button to the code block
export const addCopyButton = (timeout?: number): ShikiTransformer => {
  const toggleMs = timeout || 3000

  return {
    name: 'shiki-transformer-copy-button',
    pre(node) {
      const button = h(
        'button',
        {
          class: 'copy text-muted-foreground p-1 box-content border rounded bg-primary-foreground',
          'aria-label': 'Copy code',
          'data-code': this.source,
          onclick: `
          navigator.clipboard.writeText(this.dataset.code);
          this.classList.add('copied');
          setTimeout(() => this.classList.remove('copied'), ${toggleMs})
        `
        },
        [
          h('div', { class: 'ready' }, [
            h(
              'svg',
              {
                class: 'size-5'
              },
              [
                h('use', {
                  href: '/icons/code.svg#mingcute-clipboard-line'
                })
              ]
            )
          ]),
          h('div', { class: 'success hidden' }, [
            h(
              'svg',
              {
                class: 'size-5'
              },
              [
                h('use', {
                  href: '/icons/code.svg#mingcute-file-check-line'
                })
              ]
            )
          ])
        ]
      )

      node.children.push(button)
    }
  }
}

// Add a collapse button to the code block
export const transformerCollapse = (): ShikiTransformer => {
  return {
    name: 'shiki-transformer-collapse',
    pre(node) {
      const rawMeta = this.options.meta?.__raw
      if (!rawMeta?.includes('collapsed')) return

      // Change div to details
      node.tagName = 'details'
      // Add group class for styling
      if (!node.properties) node.properties = {}
      const existingClass = (node.properties.class as string) || ''
      node.properties.class = existingClass + ' group rounded-lg overflow-hidden'

      // Find if there is a title
      const titleNodeIdx = node.children.findIndex(
        (n) => n.type === 'element' && n.properties?.class?.toString().includes('title')
      )

      let summaryContent: any[] = ['View Code']

      if (titleNodeIdx > -1) {
        const titleNode = node.children[titleNodeIdx] as any
        // Remove the original title node
        node.children.splice(titleNodeIdx, 1)
        // Use its children (text)
        summaryContent = titleNode.children
      }

      const summary = h(
        'summary',
        {
          class:
            'text-sm text-foreground px-3 py-2 bg-muted/50 rounded-t-lg border-b cursor-pointer hover:bg-muted/80 transition-colors select-none font-medium flex items-center gap-2'
        },
        [
          h(
            'svg',
            {
              class: 'size-5 transition-transform duration-200 group-open:rotate-90',
              fill: 'none',
              viewBox: '0 0 24 24',
              stroke: 'currentColor'
            },
            [
              h('path', {
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
                'stroke-width': '2',
                d: 'M9 5l7 7-7 7'
              })
            ]
          ),
          ...summaryContent
        ]
      )

      node.children.unshift(summary)
    }
  }
}
