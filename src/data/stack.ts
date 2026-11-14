/**
 * The "stack" this site is organised around. Every blog post declares one `layer`
 * in its frontmatter; the homepage trace, the filters and the post header all read from here.
 * Order is top (closest to the agent) to bottom (closest to the math).
 */
export const LAYERS = [
  { id: 'agent', code: 'L6', name: 'Agent', zh: 'Harness · 上下文 · 工具调用' },
  { id: 'runtime', code: 'L5', name: 'Runtime', zh: '沙箱 · 网关 · 隔离执行' },
  { id: 'model', code: 'L4', name: 'Model', zh: 'Attention · KV Cache · 可解释性' },
  { id: 'training', code: 'L3', name: 'Training', zh: 'RL · GRPO · KL 投影' },
  { id: 'systems', code: 'L2', name: 'Systems', zh: 'FUSE · 构建 · 性能剖析' },
  { id: 'math', code: 'L1', name: 'Math', zh: '概率 · 优化 · 线性模型' }
] as const

export const NOTES_LAYER = { id: 'notes', code: '', name: '随笔', zh: '读书、年度总结与方法论' } as const

export const LAYER_IDS = ['agent', 'runtime', 'model', 'training', 'systems', 'math', 'notes'] as const
export type LayerId = (typeof LAYER_IDS)[number]

export const ALL_LAYERS = [...LAYERS, NOTES_LAYER]

export function layerLabel(id: string) {
  const layer = ALL_LAYERS.find((l) => l.id === id)
  if (!layer) return id
  return layer.code ? `${layer.code} ${layer.name}` : layer.name
}

/** Source types a post can declare in frontmatter (`source.kind`). */
export const SOURCE_KINDS = ['paper', 'tech-report', 'postmortem', 'code', 'translation', 'lecture'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]
const SOURCE_LABELS: Record<SourceKind, string> = {
  paper: 'paper',
  'tech-report': 'tech report',
  postmortem: 'postmortem',
  code: 'code reading',
  translation: 'translation',
  lecture: 'lecture · PDF'
}
/** `ICML ’20` for venue papers, otherwise the kind ("postmortem", "tech report", …). */
export function sourceLabel(src?: { kind: SourceKind; venue?: string; year?: number }) {
  if (!src) return ''
  if (src.kind === 'paper' && src.venue) {
    return src.year ? `${src.venue} ’${String(src.year).slice(-2)}` : src.venue
  }
  return SOURCE_LABELS[src.kind]
}

/** Ordered reading lists. Slugs are post ids under src/content/blog. */
export const SERIES = [
  {
    id: 'attention',
    layer: 'model',
    title: 'Attention 机制完全指南',
    desc: '16 讲，从“为什么需要 Attention”一路讲到工程实现。',
    planned: 16,
    unit: '讲',
    slugs: [
      'attention-series-outline',
      'attention-01-why-attention',
      'attention-02-qkv-intuition',
      'attention-03-single-head-math',
      'attention-04-qkt-meaning',
      'attention-05-softmax-weights'
    ]
  },
  {
    id: 'rl',
    layer: 'training',
    title: '从 REINFORCE 到 GRPO',
    desc: '策略梯度、PPO、GRPO，再用 KL 投影统一看 SFT 和 RL。',
    slugs: [
      'reinforce-to-ppo-policy-gradient',
      'rl-maxent-ppo-grpo-objectives',
      'grpo-seven-dimensions',
      'gaussian-policy-maximum-entropy',
      'sft-forward-kl-formal-modeling',
      'rl-reward-tilting-kl-regularized-projection'
    ]
  },
  {
    id: 'coding-agent',
    layer: 'agent',
    title: 'Coding Agent 源码拆解',
    desc: 'Claude Agent SDK、Claude Code 的工具与上下文，以及 oh-my-codex 的 Ralph Loop。',
    slugs: [
      'claude-agent-sdk-1',
      'claude-agent-sdk-security-1',
      'claude-sdk-vs-google-adk-1',
      'claude-code-tools-implementation',
      'claude-code-cccontext-deep-dive',
      'oh-my-codex-ralph-loop'
    ]
  },
  {
    id: 'fuse',
    layer: 'systems',
    title: 'FUSE × Buck2 深度复盘',
    desc: 'Mega 的虚拟文件系统上，异步阻塞、测试超时、copy-up 与 ESTALE 的排查记录。',
    slugs: [
      'scorpio-fuse-explained',
      'fuse-development-pitfalls-async-optimization',
      'dicfuse-test-timeout-debugging',
      'buck2-fuse-build-debugging',
      'buck2-sqlite-xshmmap-copyup',
      'orion-buck2-mount-path-postmortem',
      'estale-root-cause'
    ]
  }
] as const

export type Project = {
  name: string
  href: string
  layers: string[]
  summary: string
  detail?: string
  pipeline?: string[]
  stack: string[]
  stars?: number
  note?: string
}

export const PROJECTS: Project[] = [
  {
    name: 'PaperBot',
    href: 'https://github.com/jerry609/PaperBot',
    layers: ['agent', 'runtime'],
    summary: 'Academic Personal AI Infrastructure。从找论文到复现代码的端到端科研助手。',
    pipeline: ['论文发现', 'LLM 分析与评审', '学者追踪', 'Paper2Code', '多 Agent 工作室'],
    detail:
      '数据源覆盖 arXiv、Semantic Scholar、OpenAlex、HF Daily Papers。后端 FastAPI + SSE 流式输出，前端 Next.js，另有 Ink CLI 和 API 两种入口。',
    stack: ['Python', 'FastAPI', 'Next.js'],
    stars: 108
  },
  {
    name: 'Mega · Scorpio · Dicfuse',
    href: '/blog/scorpio-fuse-explained',
    layers: ['systems'],
    summary:
      'Monorepo 虚拟文件系统上的 FUSE 实践：异步阻塞、测试超时、Buck2 构建与 OverlayFS copy-up 的排查。',
    stack: ['Rust', 'FUSE', 'Buck2'],
    note: '7 篇复盘'
  },
  {
    name: 'Harness-Template',
    href: 'https://github.com/jerry609/Harness-Template',
    layers: ['agent'],
    summary: '给 coding agent 用的仓库 harness 模板，随实践持续更新。',
    stack: ['Python']
  },
  {
    name: 'LLM-REVIEW',
    href: 'https://github.com/jerry609/LLM-REVIEW',
    layers: ['model'],
    summary: 'LLM 知识库：模型机制与训练方法的整理。',
    stack: ['HTML'],
    stars: 3
  }
]
