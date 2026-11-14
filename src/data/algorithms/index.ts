/**
 * Helpers over the algorithm topics: flattening, de-duplication, rating bands,
 * graph levels and problem links. Shared by /roadmap and /roadmap/[topic].
 */
import leetcode from './leetcode.json'
import { EDGES, MAIN_LINE, TOPIC_SLUGS, TOPICS, type Problem, type Section, type Topic } from './topics'

export { EDGES, MAIN_LINE, TOPIC_SLUGS, TOPICS }
export type { Problem, Section, Topic }

type Meta = { slug: string; difficulty: 'easy' | 'medium' | 'hard'; paid: boolean }
const META = leetcode as Record<string, Meta>

export type Flat = Problem & { section: string }

export function flatten(topic: Topic): Flat[] {
  if (topic.problems) return topic.problems.map((p) => ({ ...p, section: topic.title }))
  const out: Flat[] = []
  const walk = (s: Section) => {
    for (const p of s.problems ?? []) out.push({ ...p, section: s.title })
    for (const c of s.children ?? []) walk(c)
  }
  if (topic.rootSection) walk(topic.rootSection)
  return out
}

export const rating = (p: Problem) => {
  const n = Number(p.score)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

export const meta = (id: string): Meta | undefined => META[id]

export function problemUrl(p: Problem) {
  if (p.url) return p.url
  const m = META[p.id]
  return m ? `https://leetcode.cn/problems/${m.slug}/` : `https://leetcode.cn/problemset/?search=${encodeURIComponent(p.id)}`
}

/** Rating bands used by filters and the histogram */
export const BANDS = [
  { id: 'b1', label: '<1600', min: 0, max: 1600 },
  { id: 'b2', label: '1600–2000', min: 1600, max: 2000 },
  { id: 'b3', label: '2000–2400', min: 2000, max: 2400 },
  { id: 'b4', label: '≥2400', min: 2400, max: Infinity }
] as const
export function band(p: Problem) {
  const r = rating(p)
  if (r === undefined) return 'unrated'
  return BANDS.find((b) => r >= b.min && r < b.max)!.id
}

/** 200-point histogram bins over the given problems */
export function bins(ps: Problem[]) {
  const out: Record<number, number> = {}
  for (const p of ps) {
    const r = rating(p)
    if (r !== undefined) {
      const k = Math.floor(r / 200) * 200
      out[k] = (out[k] ?? 0) + 1
    }
  }
  return out
}

export function median(ps: Problem[]) {
  const rs = ps.map(rating).filter((r): r is number => r !== undefined).sort((a, b) => a - b)
  return rs.length ? rs[Math.floor(rs.length / 2)] : undefined
}

/** Longest-path depth of every topic in the prerequisite graph */
export function levels(): Record<string, number> {
  const depth: Record<string, number> = Object.fromEntries(Object.keys(TOPICS).map((k) => [k, 0]))
  Object.keys(TOPICS).forEach(() => {
    EDGES.forEach(([a, b]) => {
      depth[b] = Math.max(depth[b], depth[a] + 1)
    })
  })
  return depth
}

export const prereqs = (id: string) => EDGES.filter(([, b]) => b === id).map(([a]) => a)
export const nexts = (id: string) => EDGES.filter(([a]) => a === id).map(([, b]) => b)

/** Unique problems across all topics (a problem can appear in several lists) */
export function uniqueProblems(): Problem[] {
  const seen = new Map<string, Problem>()
  for (const t of Object.values(TOPICS)) for (const p of flatten(t)) if (!seen.has(p.id)) seen.set(p.id, p)
  return [...seen.values()]
}

export const topicHref = (id: string) => `/roadmap/${TOPIC_SLUGS[id]}`
