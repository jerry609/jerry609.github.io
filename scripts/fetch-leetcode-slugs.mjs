#!/usr/bin/env node
/**
 * Refresh src/data/algorithms/leetcode.json: frontend id → { slug, difficulty, paid }
 * for every problem referenced in src/data/algorithms/topics.ts.
 * Uses LeetCode CN's public problem list (no login). Run after editing the topic lists:
 *
 *   node scripts/fetch-leetcode-slugs.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const TOPICS = new URL('../src/data/algorithms/topics.ts', import.meta.url)
const OUT = new URL('../src/data/algorithms/leetcode.json', import.meta.url)
const wanted = new Set([...readFileSync(TOPICS, 'utf8').matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]))

const QUERY = `query q($skip: Int, $limit: Int) {
  problemsetQuestionList(categorySlug: "", limit: $limit, skip: $skip, filters: {}) {
    total
    questions { frontendQuestionId titleSlug difficulty paidOnly }
  }
}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function page(skip, limit = 100) {
  const res = await fetch('https://leetcode.cn/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.cn/problemset/' },
    body: JSON.stringify({ query: QUERY, variables: { skip, limit } })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} at skip=${skip}`)
  const json = await res.json()
  return json.data.problemsetQuestionList
}

const out = {}
let skip = 0
let total = Infinity
while (skip < total) {
  const { total: t, questions } = await page(skip)
  total = t
  for (const q of questions) {
    if (wanted.has(q.frontendQuestionId)) {
      out[q.frontendQuestionId] = { slug: q.titleSlug, difficulty: q.difficulty.toLowerCase(), paid: q.paidOnly }
    }
  }
  skip += questions.length
  if (!questions.length) break
  await sleep(250)
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })))
writeFileSync(OUT, JSON.stringify(sorted, null, 0).replace(/},"/g, '},\n"') + '\n')
const missing = [...wanted].filter((id) => !out[id])
console.log(`matched ${Object.keys(out).length} / ${wanted.size} problems (scanned ${skip})`)
if (missing.length) console.log('not found:', missing.slice(0, 30).join(' '), missing.length > 30 ? '…' : '')
