/**
 * Code themes matching the site palette (theme v2):
 * keywords scarf orange, types / constants blue, strings green, comments grey italic,
 * everything else ink. Light and dark share scopes; only the colours differ.
 */
import type { ThemeRegistration } from 'shiki'

type Palette = {
  bg: string
  fg: string
  muted: string
  comment: string
  keyword: string
  type: string
  string: string
  add: string
  del: string
}

const scopes = (c: Palette) => [
  { scope: ['comment', 'punctuation.definition.comment', 'string.comment'], settings: { foreground: c.comment, fontStyle: 'italic' } },
  {
    scope: [
      'keyword',
      'keyword.control',
      'keyword.other',
      'keyword.operator.new',
      'keyword.operator.expression',
      'keyword.operator.logical.python',
      'storage',
      'storage.type',
      'storage.modifier',
      'variable.language.this',
      'variable.language.self',
      'support.type.property-name.toml'
    ],
    settings: { foreground: c.keyword }
  },
  {
    scope: [
      'entity.name.type',
      'entity.name.class',
      'entity.other.inherited-class',
      'support.type',
      'support.class',
      'storage.type.primitive',
      'storage.type.numeric',
      'constant.numeric',
      'constant.language',
      'constant.character',
      'constant.other',
      'support.constant',
      'variable.other.constant',
      'variable.other.enummember',
      'entity.name.type.lifetime.rust',
      'entity.name.namespace'
    ],
    settings: { foreground: c.type }
  },
  {
    scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string', 'string.regexp', 'markup.inline.raw'],
    settings: { foreground: c.string }
  },
  {
    scope: ['punctuation', 'meta.brace', 'keyword.operator', 'punctuation.separator', 'punctuation.terminator'],
    settings: { foreground: c.muted }
  },
  { scope: ['entity.name.function', 'support.function', 'meta.function-call.generic'], settings: { foreground: c.fg } },
  { scope: ['markup.heading', 'entity.name.section'], settings: { foreground: c.keyword, fontStyle: 'bold' } },
  { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
  { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
  { scope: ['markup.inserted', 'meta.diff.header.to-file'], settings: { foreground: c.add } },
  { scope: ['markup.deleted', 'meta.diff.header.from-file'], settings: { foreground: c.del } },
  { scope: ['invalid'], settings: { foreground: c.del } }
]

const make = (name: string, type: 'light' | 'dark', c: Palette): ThemeRegistration => ({
  name,
  type,
  colors: { 'editor.background': c.bg, 'editor.foreground': c.fg },
  fg: c.fg,
  bg: c.bg,
  tokenColors: scopes(c)
})

export const jerryLight = make('jerry609-light', 'light', {
  bg: '#ffffff',
  fg: '#12161b',
  muted: '#525c68',
  comment: '#66707c',
  keyword: '#b04a16',
  type: '#3558b8',
  string: '#237a4b',
  add: '#237a4b',
  del: '#c0342a'
})

export const jerryDark = make('jerry609-dark', 'dark', {
  bg: '#161a1f',
  fg: '#e6e9ec',
  muted: '#9aa3ad',
  comment: '#7d8792',
  keyword: '#f4a06a',
  type: '#7d9bff',
  string: '#5cc28a',
  add: '#5cc28a',
  del: '#f2756a'
})
