import type { CollectionEntry } from 'astro:content'

/**
 * Generated covers for posts without a hero image. A cover is a typographic poster:
 * a keyword (the post's most specific tag, or `cover.label` from frontmatter), the
 * stack glyph with the post's layer lit, and one of three backgrounds picked from the slug.
 */
export type CoverVariant = 'night' | 'paper' | 'mist'
export type Cover = { label: string; variant: CoverVariant; seed: number }

const STOP = new Set([
  'ai', 'llm', 'agent', 'python', 'tools', 'sdk', 'paper', 'notes', '专题', '翻译', '复盘',
  '源码分析', '调试', '工程实践', '机器学习', '数学', '教程', '学习笔记', 'source code analysis',
  'paper-reading', '讲义', '模板', '素材库', 'ai 整理生成'
])

export function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const isAscii = (s: string) => /^[\x20-\x7e]+$/.test(s)

export function buildCovers(posts: CollectionEntry<'blog'>[]): Map<string, Cover> {
  const count = new Map<string, number>()
  for (const p of posts) for (const t of p.data.tags) count.set(t, (count.get(t) ?? 0) + 1)
  const variants: CoverVariant[] = ['night', 'paper', 'mist']
  const out = new Map<string, Cover>()
  for (const p of posts) {
    const seed = hash(p.id)
    const tags = p.data.tags.filter((t) => !STOP.has(t) && t.length <= 18)
    // Prefer tags that appear in the title, then short ASCII tags, then the rarest one
    const title = p.data.title.toLowerCase()
    const inTitle = tags.filter((t) => title.includes(t.toLowerCase()))
    const pool = inTitle.length ? inTitle : tags
    const ranked = [...pool].sort(
      (a, b) =>
        Number(isAscii(b)) - Number(isAscii(a)) || (count.get(a) ?? 0) - (count.get(b) ?? 0)
    )
    const raw = p.data.cover?.label ?? ranked[0] ?? p.data.layer
    const label = isAscii(raw) ? raw.toUpperCase() : raw
    const variant = p.data.cover?.variant ?? variants[seed % variants.length]
    out.set(p.id, { label, variant, seed })
  }
  return out
}
