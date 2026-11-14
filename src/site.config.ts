import type { Config, IntegrationUserConfig, ThemeUserConfig } from 'astro-pure/types'

export const theme: ThemeUserConfig = {
  // === Basic configuration ===
  /** Title for your website. Used in metadata and as the browser tab title. */
  title: 'Jerry Zhang',
  /** Used on the homepage and in the copyright line */
  author: 'Jerry Zhang',
  /** Description metadata for your website. */
  description:
    'Agent × Infra 全栈研究笔记：harness 与工具调用、沙箱运行时、模型机制与后训练、文件系统与构建。',
  /** The default favicon, a path in `public/`. */
  favicon: '/favicon/favicon.ico',
  /** The default social card image, a path in `public/`. */
  socialCard: '/images/social-card.png',
  locale: {
    lang: 'zh-CN',
    attrs: 'zh_CN',
    dateLocale: 'zh-CN',
    dateOptions: {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }
  },
  /** Avatar */
  logo: {
    src: '/src/assets/jerry.jpg',
    alt: 'Jerry Zhang'
  },

  // === Global configuration ===
  titleDelimiter: '·',
  prerender: true,
  npmCDN: 'https://cdn.jsdelivr.net/npm',

  head: [],
  customCss: [],

  /** Primary navigation. Links, archives and tags live in the footer. */
  header: {
    menu: [
      { title: '文章', link: '/blog' },
      { title: '数学', link: '/math-notes' },
      { title: '算法', link: '/roadmap' },
      { title: '碎碎念', link: '/murmurs' },
      { title: '照片', link: '/photos' }
    ]
  },

  footer: {
    year: `© ${new Date().getFullYear()}`,
    links: [],
    credits: false,
    social: { github: 'https://github.com/jerry609' }
  },

  content: {
    externalLinks: {
      content: ' ↗',
      properties: {
        style: 'user-select:none'
      }
    },
    blogPageSize: 12,
    share: ['weibo', 'x', 'bluesky']
  }
}

export const integ: IntegrationUserConfig = {
  links: {
    logbook: [],
    applyTip: [
      { name: 'Name', val: theme.title },
      { name: 'Desc', val: 'Agent × Infra 全栈研究笔记' },
      { name: 'Link', val: 'https://jerry609.github.io/' },
      { name: 'Avatar', val: 'https://jerry609.github.io/favicon/android-chrome-512x512.png' }
    ],
    cacheAvatar: false
  },
  // Full-site search (Pagefind)
  pagefind: true,
  // Required by the theme schema; the random-quote widget is not used on this site.
  quote: {
    server: '',
    target: `() => ''`
  },
  typography: {
    class: 'prose prose-t1',
    blockquoteStyle: 'normal',
    inlineCodeBlockStyle: 'modern'
  },
  mediumZoom: {
    enable: true,
    selector: '.prose .zoomable',
    options: {
      className: 'zoomable'
    }
  },
  // Comments are off until this site has its own Waline server.
  // To turn them back on, deploy Waline (https://waline.js.org) and set `server` + `enable: true`.
  waline: {
    enable: false,
    server: '',
    emoji: ['bmoji', 'weibo'],
    additionalConfigs: {
      pageview: true,
      comment: true,
      locale: {
        reaction0: 'Like',
        placeholder: '欢迎留言（填写邮箱可收到回复，无需登录）'
      },
      imageUploader: false
    }
  }
}

const config = { ...theme, integ } as Config
export default config
