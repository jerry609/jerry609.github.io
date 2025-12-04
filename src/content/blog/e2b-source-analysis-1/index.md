---
title: 'E2B 源码分析（一）：架构总览与核心概念'
description: '深入剖析 E2B 开源沙箱平台的整体架构、核心组件与技术选型，理解 AI Agent 安全执行环境的设计思路。'
publishDate: '2025-12-04'
tags: ['源码分析', '沙箱', 'ai', 'agent', 'firecracker', 'e2b']
language: 'zh-CN'
---

> E2B（Everything to Build）是一个为 AI 应用提供安全云端沙箱环境的开源平台。

## 一、E2B 是什么

**一句话总结**：E2B 为 AI Agent 提供安全的、即时可用的云端沙箱环境，让它们可以安全地执行代码、访问文件系统和与外部服务交互。

在《沙箱技术（一）》中我们梳理了沙箱技术的演进脉络，E2B 正是「AI 沙箱平台」这一阶段的典型代表——它把 Firecracker MicroVM 的强隔离能力与 Docker 的易用性结合起来，专门服务于 AI Agent 的代码执行场景。

## 二、项目结构：Monorepo 概览

E2B 使用 `pnpm` 管理的 monorepo 架构，核心包如下：

| 包 (Package)                  | 路径           | 描述                                                         |
| ----------------------------- | -------------- | ------------------------------------------------------------ |
| **JavaScript/TypeScript SDK** | `js-sdk`       | 官方 JS/TS SDK，用于创建和控制沙箱，包名为 `e2b`             |
| **Python SDK**                | `python-sdk`   | 官方 Python SDK，功能与 JS SDK 对齐，包名为 `e2b`            |
| **命令行工具 (CLI)**          | `cli`          | 用于构建和管理自定义沙箱模板，包名为 `@e2b/cli`              |
| **文档网站**                  | `web`          | 基于 Next.js 的官方文档网站 (e2b.dev)                        |
| **API 规范**                  | `spec`         | 包含 `openapi.yml` 等 API 定义文件，是 SDK 与后端通信的契约  |

这种 monorepo 结构的好处是：SDK、CLI、文档可以共享类型定义和 API 规范，保持一致性；同时各包又能独立发布和版本管理。

## 三、核心概念

### 1. 沙箱（Sandbox）

**是什么**：一个轻量级、隔离的云端 Linux 环境。

**技术选型**：基于 **Firecracker MicroVM**，这是 AWS Lambda 和 Fargate 底层使用的虚拟化技术。相比传统 Docker 容器：

| 特性         | Docker 容器                | Firecracker MicroVM        |
| ------------ | -------------------------- | -------------------------- |
| 隔离级别     | 共享宿主内核               | 独立内核                   |
| 安全边界     | 依赖 cgroups/namespaces    | 硬件虚拟化（KVM）          |
| 启动速度     | 毫秒级                     | 毫秒级（~125ms）           |
| 内存开销     | 较低                       | 约 5MB 起                  |
| 多租户安全性 | 需要额外加固               | 天然强隔离                 |

**用途**：AI Agent 可以在沙箱中安全地：
- 执行任意代码（Python、Bash、Node.js 等）
- 读写文件系统
- 安装依赖包
- 访问网络（受控）

而不会影响到宿主或其他沙箱。

### 2. 模板（Template）

**是什么**：沙箱的蓝图或配置，定义了沙箱的基础环境。

**如何定义**：用户通过编写标准的 **Dockerfile** 来定义模板。这个设计非常聪明：
- 降低学习成本（Dockerfile 大家都会写）
- 复用 Docker 庞大的生态（基础镜像、多阶段构建等）
- 与现有 CI/CD 流程兼容

### 3. 构建流程：从 Dockerfile 到 MicroVM

E2B 最有趣的设计之一是如何把 Docker 的易用性和 MicroVM 的安全性结合起来：

```
┌─────────────────────────────────────────────────────────────────┐
│                        构建流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Dockerfile  │───▶│ Docker 镜像  │───▶│  E2B 仓库    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│        │                   │                   │                │
│        │ e2b template      │ docker build      │ push           │
│        │ build             │                   │                │
│        ▼                   ▼                   ▼                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    E2B 后端                              │   │
│  │  ┌──────────────┐    ┌──────────────┐                   │   │
│  │  │ 提取 rootfs  │───▶│ MicroVM 镜像 │                   │   │
│  │  └──────────────┘    └──────────────┘                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              │ 用户请求创建沙箱                  │
│                              ▼                                  │
│                    ┌──────────────────┐                        │
│                    │ Firecracker VM   │                        │
│                    │ (运行中的沙箱)    │                        │
│                    └──────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**步骤分解**：

1. **本地构建**：开发者执行 `e2b template build`，CLI 调用本地 Docker 引擎构建标准 Docker 镜像
2. **推送镜像**：CLI 将镜像推送到 E2B 的私有镜像仓库
3. **云端转换**：当 SDK 请求创建沙箱时，后端提取 Docker 镜像的文件系统，转换为 Firecracker 可用的 **rootfs**
4. **启动沙箱**：启动 MicroVM，挂载 rootfs，得到与 Dockerfile 定义一致的隔离环境

这个流程的精妙之处在于：**开发者只需要会写 Dockerfile，就能获得 MicroVM 级别的安全隔离**。

## 四、技术栈一览

| 层次     | 技术选型                           |
| -------- | ---------------------------------- |
| SDK      | TypeScript, Python                 |
| CLI      | TypeScript                         |
| 文档     | Next.js                            |
| 构建系统 | pnpm, Turborepo                    |
| API 协议 | OpenAPI, Connect RPC               |
| 虚拟化   | Firecracker MicroVM (KVM)          |
| 容器     | Docker (用于模板定义)              |

## 五、快速上手示例

### 使用沙箱（应用开发者）

**安装 SDK**：

```bash
# Python
pip install e2b

# JavaScript
npm i e2b
```

**基本使用**：

```python
from e2b import Sandbox

# 创建默认沙箱
with Sandbox() as sandbox:
    # 运行 shell 命令
    proc = sandbox.process.start('echo "Hello from E2B!"')
    proc.wait()
    print(proc.stdout)

    # 读写文件
    sandbox.filesystem.write('hello.txt', 'This is inside the sandbox.')
    content = sandbox.filesystem.read('hello.txt')
    print(content)
```

### 自定义模板（模板开发者）

**安装 CLI 并认证**：

```bash
npm install -g @e2b/cli
e2b auth login
```

**创建 `e2b.Dockerfile`**：

```dockerfile
FROM python:3.11-slim

# 安装数据科学常用包
RUN pip install pandas numpy matplotlib

# 设置工作目录
WORKDIR /workspace
```

**构建并使用**：

```bash
e2b template build --name data-science-sandbox
```

```python
from e2b import Sandbox

with Sandbox(template='data-science-sandbox') as sandbox:
    code = '''
import pandas as pd
df = pd.DataFrame({'x': [1,2,3], 'y': [4,5,6]})
print(df.describe())
'''
    proc = sandbox.process.start(f'python -c "{code}"')
    proc.wait()
    print(proc.stdout)
```

## 六、与其他沙箱方案的对比

| 方案               | 隔离级别     | 启动速度 | 易用性 | 适用场景                   |
| ------------------ | ------------ | -------- | ------ | -------------------------- |
| Docker 容器        | 进程级       | ~100ms   | ⭐⭐⭐⭐⭐ | 开发/测试，信任代码        |
| gVisor             | 用户态内核   | ~200ms   | ⭐⭐⭐⭐  | 多租户容器，中等安全需求   |
| Firecracker (E2B)  | 硬件虚拟化   | ~125ms   | ⭐⭐⭐⭐  | AI Agent，不信任代码       |
| 传统 VM            | 硬件虚拟化   | 秒级     | ⭐⭐⭐   | 完全隔离，长期运行服务     |

E2B 的定位很清晰：**在保持 Docker 级别易用性的同时，提供 VM 级别的安全隔离**。

## 七、后续文章预告

本文从宏观角度介绍了 E2B 的架构和核心概念。后续文章将深入源码，分析：

- **E2B 源码分析（二）**：SDK 设计——如何封装沙箱操作为优雅的 API
- **E2B 源码分析（三）**：CLI 实现——从 Dockerfile 到模板的构建流程
- **E2B 源码分析（四）**：API 规范——OpenAPI 与 Connect RPC 的协作

---

## 参考资料

- [E2B GitHub 仓库](https://github.com/e2b-dev/e2b)
- [E2B 官方文档](https://e2b.dev/docs)
- [Firecracker 官方文档](https://firecracker-microvm.github.io/)
- [沙箱技术（一）：从 chroot 到 Serverless/AI 的统一时间线](/blog/sandbox-tech-1)
