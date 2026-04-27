import type { CollectionEntry } from 'astro:content'

type BlogPost = CollectionEntry<'blog'>

const getPinnedPriority = (post: BlogPost) => post.data.pinned ?? 0

const getPostDate = (post: BlogPost) =>
  new Date(post.data.updatedDate ?? post.data.publishDate ?? 0).valueOf()

export const sortBlogPosts = (posts: BlogPost[]) =>
  [...posts].sort((a, b) => {
    const pinnedDiff = getPinnedPriority(b) - getPinnedPriority(a)
    if (pinnedDiff !== 0) return pinnedDiff
    return getPostDate(b) - getPostDate(a)
  })
