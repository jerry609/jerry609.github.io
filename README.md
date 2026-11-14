# jerry609.github.io

Jerry Zhang 的个人站点：Agent × Infra 全栈研究笔记。线上地址 <https://jerry609.github.io>。

## 结构

文章按「栈层」组织，每篇在 frontmatter 里声明一个 `layer`：

| layer      | 含义                               |
| ---------- | ---------------------------------- |
| `agent`    | L6 Agent：harness、上下文、工具调用 |
| `runtime`  | L5 Runtime：沙箱、网关、隔离执行    |
| `model`    | L4 Model：Attention、KV Cache、可解释性 |
| `training` | L3 Training：RL、GRPO、KL 投影      |
| `systems`  | L2 Systems：FUSE、构建、性能剖析    |
| `math`     | L1 Math：概率、优化、线性模型       |
| `notes`    | 随笔（默认值，不进栈图）            |

层的定义、连载（series）和项目列表都在 `src/data/stack.ts`。新增连载时把文章 id 按顺序加到 `SERIES` 里，文章页会自动出现连载导航。

```md
---
title: '...'
description: '...'
publishDate: '2026-06-07'
layer: training
tags: ['RL', 'KL']
---
```

主要页面：

- `/`：简介、研究方向、近况、写作轨迹图（Fig. 1）、项目、连载、最近文章
- `/blog`：全部文章，可按栈层筛选（`/blog?layer=systems`）和按标题过滤
- `/math-notes`：数学笔记与讲义 PDF
- `/roadmap`：算法刷题路线与进度
- `/projects`、`/about`

## 本地开发

需要 Node 18+。CI（GitHub Actions + `withastro/action`）使用 npm 和 `package-lock.json`。

```shell
npm ci
npm run dev      # http://localhost:4321
npm run build    # astro check + astro build
```

推送到 `main` 后由 `.github/workflows/deploy.yml` 构建并发布到 GitHub Pages。

## 致谢

基于 [Astro](https://astro.build/) 与 [astro-theme-pure](https://github.com/cworld1/astro-theme-pure)（Apache-2.0，见 `LICENSE` 与 `packages/pure`）改造。字体为 Source Serif 4、Geist、Geist Mono，经 Fontsource 自托管。
