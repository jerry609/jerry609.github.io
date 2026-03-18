import { parse as htmlParser } from 'node-html-parser'

class LRU<K, V> extends Map<K, V> {
  constructor(private readonly maxSize: number) {
    super()
  }

  override get(key: K): V | undefined {
    const value = super.get(key)
    if (value) this.#touch(key, value)
    return value
  }

  override set(key: K, value: V): this {
    this.#touch(key, value)
    if (this.size > this.maxSize) {
      const firstKey = this.keys().next().value
      if (firstKey !== undefined) this.delete(firstKey)
    }
    return this
  }

  #touch(key: K, value: V): void {
    this.delete(key)
    super.set(key, value)
  }
}

const formatError = (...lines: string[]) => lines.join('\n         ')
const warnedUrls = new Set<string>()
const REQUEST_TIMEOUT_MS = 5000

function warnOnce(url: string, error: unknown) {
  if (warnedUrls.has(url)) return
  warnedUrls.add(url)
  console.warn(
    formatError(
      `[warn] astro-embed`,
      (error as Error)?.message ?? String(error),
      `URL: ${url}`,
      `Falling back to a plain link preview.`
    )
  )
}

/**
 * Fetch a URL and parse it as JSON, but catch errors to stop builds erroring.
 * @param url URL to fetch
 * @returns {Promise<Record<string, unknown> | undefined>}
 */
export const safeGet = makeSafeGetter<Record<string, unknown>>((res) => res.json())

/**
 * Fetch a URL and parse it as HTML, but catch errors to stop builds erroring.
 * @param url URL to fetch
 * @returns {Promise<Document | undefined>}
 */
const safeGetDOM = makeSafeGetter(async (res) => htmlParser.parse(await res.text()))

/** Factory to create safe, caching fetch functions. */
function makeSafeGetter<T>(
  handleResponse: (res: Response) => T | Promise<T>,
  { cacheSize = 1000 }: { cacheSize?: number } = {}
) {
  const cache = new LRU<string, T>(cacheSize)
  return async function safeGet(url: string): Promise<T | undefined> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const cached = cache.get(url)
      if (cached) return cached
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok)
        throw new Error(
          formatError(`Failed to fetch ${url}`, `Error ${response.status}: ${response.statusText}`)
        )
      const result = await handleResponse(response)
      cache.set(url, result)
      return result
    } catch (e) {
      warnOnce(url, e)
      return undefined
    } finally {
      clearTimeout(timeout)
    }
  }
}

/** Helper to get the `content` attribute of an element. */
const getContent = (el: HTMLElement | null) => el?.getAttribute('content')
/** Helper to filter out insecure or non-absolute URLs. */
const urlOrNull = (url: string | null | undefined) => (url?.slice(0, 8) === 'https://' ? url : null)

/**
 * Loads and parses an HTML page to return Open Graph metadata.
 * @param pageUrl URL to parse
 */
async function parseOpenGraph(pageUrl: string) {
  const html = await safeGetDOM(pageUrl)
  if (!html) return

  const getMetaProperty = (prop: string) =>
    getContent(html.querySelector(`meta[property=${JSON.stringify(prop)}]`) as HTMLElement | null)
  const getMetaName = (name: string) =>
    getContent(html.querySelector(`meta[name=${JSON.stringify(name)}]`) as HTMLElement | null)

  const title = getMetaProperty('og:title') || html.querySelector('title')?.textContent
  const description = getMetaProperty('og:description') || getMetaName('description')
  const image = urlOrNull(
    getMetaProperty('og:image:secure_url') ||
      getMetaProperty('og:image:url') ||
      getMetaProperty('og:image')
  )
  const imageAlt = getMetaProperty('og:image:alt')
  const video = urlOrNull(
    getMetaProperty('og:video:secure_url') ||
      getMetaProperty('og:video:url') ||
      getMetaProperty('og:video')
  )
  const videoType = getMetaProperty('og:video:type')
  const url =
    urlOrNull(
      getMetaProperty('og:url') || html.querySelector("link[rel='canonical']")?.getAttribute('href')
    ) || pageUrl

  return { title, description, image, imageAlt, url, video, videoType }
}

export { safeGetDOM, parseOpenGraph }
