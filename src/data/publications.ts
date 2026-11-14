/**
 * Publications shown on the homepage. The section stays hidden while this list is empty.
 * Add a paper once it is accepted or public (e.g. on arXiv); keep double-blind submissions out.
 *
 * Example:
 * {
 *   title: 'Paper title',
 *   authors: ['Jerry Zhang', 'Coauthor'],
 *   venue: 'OSDI',
 *   year: 2027,
 *   status: 'accepted',
 *   links: { pdf: 'https://…', code: 'https://github.com/…' },
 *   artifacts: ['available', 'functional']
 * }
 */
export type Publication = {
  title: string
  authors: string[]
  venue: string
  year: number
  status?: 'accepted' | 'preprint'
  links?: { pdf?: string; arxiv?: string; code?: string; slides?: string }
  /** USENIX / ACM artifact evaluation badges */
  artifacts?: ('available' | 'functional' | 'reproduced')[]
}

/** The name to bold in author lists */
export const ME = 'Jerry Zhang'

export const PUBLICATIONS: Publication[] = []
