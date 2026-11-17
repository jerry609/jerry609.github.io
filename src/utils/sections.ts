/**
 * Section numbering shared by the rehype plugin (heading labels) and the post rail.
 *
 * Many posts number their own h2s ("1. …", "一、…", "第一章：…"). When most h2s in a
 * post carry their own number, the template stops adding its "01" label and the
 * rail shows the post's own numbers, so readers never see two numbering schemes.
 */
const PATTERNS = [
  /^\s*(\d{1,3}(?:\.\d{1,3})*)(?:[.、．:：)]\s*|\s+)/, // 1. / 1.5 / 01. / 0.
  /^\s*([一二三四五六七八九十百]+)\s*[、.．]\s*/, // 一、
  /^\s*第\s*([一二三四五六七八九十百\d]+)\s*[章节部分阶段讲篇步]\s*/ // 第一章 / 第一步
]

export function ownNumber(text: string): string | undefined {
  for (const re of PATTERNS) {
    const m = text.match(re)
    if (m) return m[1]
  }
  return undefined
}

export type SectionMode = 'own' | 'auto'

export function sectionLabels(texts: string[]): { mode: SectionMode; labels: string[] } {
  const nums = texts.map(ownNumber)
  const owned = nums.filter(Boolean).length
  const mode: SectionMode = owned >= Math.max(2, Math.ceil(texts.length / 2)) ? 'own' : 'auto'
  const labels =
    mode === 'own'
      ? nums.map((n) => n ?? '·')
      : texts.map((_, i) => String(i + 1).padStart(2, '0'))
  return { mode, labels }
}

/** Heading text without its own leading number (for the rail, where the number is the label). */
export function stripOwnNumber(text: string): string {
  for (const re of PATTERNS) {
    if (re.test(text)) return text.replace(re, '').trim() || text
  }
  return text
}
