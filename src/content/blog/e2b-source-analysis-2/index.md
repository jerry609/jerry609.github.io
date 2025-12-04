---
title: 'E2B 源码分析（二）：SDK 设计'
description: '从 SDK 视角拆解 E2B 的 JavaScript/Python 客户端：如何封装 Sandbox/Template 抽象、对接控制平面 API 和 ENVD RPC，并在多语言之间保持对称设计。'
publishDate: '2025-12-04'
tags: ['源码分析', 'e2b', 'sdk', 'typescript', 'python', 'connect-rpc']
language: 'zh-CN'
---

> 这一篇从「SDK 视角」继续拆 E2B：看它是如何把 Firecracker 沙箱、控制平面 API 和 ENVD 执行平面封装成 `Sandbox` / `Template` 这类高层抽象，以及 JS/Python 两个 SDK 在设计上的对称关系。

## 一、概览：SDK 在 E2B 架构中的位置

在前一篇中，我们从宏观角度看了 E2B 的整体架构：上层是用户应用（尤其是 AI Agent 系统），中间是 SDK 和 CLI，底层是控制平面的 HTTP API 和执行平面的 ENVD 服务。本篇开始正式下潜，重点拆解 **SDK 的源码设计**。

先明确一件事：  
**E2B 的 SDK 本质上是一个「把 HTTP / RPC 协议包装成 `Sandbox` / `Template` 等高层抽象的适配层」。**

从调用链的角度，可以把它理解成这张图：

- 对上：  
  - 用户代码只需要关心几个核心对象：
    - `Sandbox` / `AsyncSandbox`：代表一个云沙箱实例。
    - `Template`：代表一个可复用的环境配置。
    - `commands` / `files`：代表沙箱内部的「进程子系统」和「文件系统子系统」。
  - 典型调用类似：
    - JS：`const sandbox = await Sandbox.create('base')`
    - Python：`with Sandbox('base') as sbx: ...`

- 对下：  
  - 同一个 SDK 实际打到两条不同的后端通道：
   1. **控制平面（Control Plane）**  
     - 负责「资源管理」：创建/列出/删除模版、沙箱、团队等。
     - 对应的协议是 **HTTP + OpenAPI**，规范在 `spec/openapi.yml` 中。
     - JS SDK 中通过 `packages/js-sdk/src/api/*` 来访问；Python SDK 则是 `packages/python-sdk/e2b/api/*`。

    2. **执行平面 / 数据平面（Data Plane）**  
       - 负责「具体沙箱里的行为」：执行命令、读写文件、PTY 交互、获取指标等。
       - 对应的协议是 **Connect RPC + Protobuf**，规范在 `spec/envd/*` 中。
       - JS SDK 中由 `src/envd/*` 实现；Python SDK 中由 `e2b/envd/*` 和 `e2b_connect/*` 实现。

SDK 的职责，就是让绝大多数用户完全不用关心「OpenAPI / Protobuf / Connect RPC / 认证头怎么拼」这些细节，而是只操作几个高层对象。你在代码里写的 `sandbox.commands.run('echo 1')`，最终会被 SDK 拆解为一系列 HTTP 请求和 RPC 调用，在云端的 Firecracker microVM 内部起一个进程、收集 stdout/stderr 并流式返回。

为了保持跨语言的一致性，E2B 的 Python SDK 和 JavaScript SDK 在**抽象层级**上是高度对齐的：  
两边都有 `Sandbox`，都有「控制平面 API client + ENVD client」，都有统一的错误体系和连接配置类。这种对称设计也让文档、示例和用户心智模型变得非常简单：换语言，不用重新学一套完全不同的 API，只是语法差异。

接下来，我们先从 JavaScript SDK 入手，从它的入口文件开始，一步步拆到内部的配置、API 通信、`Sandbox` 实现，再和 Python 版本对照。

![E2B SDK 在整体架构中的调用链示意图](/src/content/blog/e2b-source-analysis-2/E2B2-1.png)

## 二、JavaScript SDK：总体结构与入口

E2B 的 JavaScript SDK 位于仓库的 `packages/js-sdk` 目录，`packages/js-sdk/package.json` 和 `packages/js-sdk/src/index.ts` 两个文件几乎可以勾勒出它的整体轮廓。

### 2.1 包配置与构建脚本

先看 package.json 中的关键信息（只摘取与架构相关的部分）：

- 包的基本定义：
  - `"name": "e2b"`
  - `"description": "E2B SDK that give agents cloud environments"`
- 构建与输出：
  - `"main": "dist/index.js"`：CommonJS 入口
  - `"module": "dist/index.mjs"`：ESM 入口
  - `"types": "dist/index.d.ts"`：TypeScript 类型声明入口
  - `"build": "tsc --noEmit && tsup"`：先做类型检查，再用 tsup 打包
- 测试与开发：
  - `"test": "vitest run"`
  - `"test:integration"`、`"test:bun"`、`"test:deno"` 等用来覆盖多运行时场景
- 代码生成相关脚本（非常关键）：
  - `generate:api`：
    - 调用 `python ./../../spec/remove_extra_tags.py ...`
    - 基于清洗过的 OpenAPI 文件 `spec/openapi_generated.yml`
    - 生成 `src/api/schema.gen.ts`
  - `generate:envd` / `generate:envd-api`：
    - 在 `spec/envd` 目录下用 `buf`（结合 `buf-js.gen.yaml`）生成 ENVD 的 RPC 客户端代码，输出到 `packages/js-sdk/src/envd/**/*`
    - 使用 `openapi-typescript` 将 `spec/envd/envd.yaml` 转成 TypeScript 类型，输出到 `packages/js-sdk/src/envd/schema.gen.ts`
  - `generate:mcp`：
    - 从 mcp-server.json 生成 `src/sandbox/mcp.d.ts` 类型定义
  - `generate_sdk_ref.sh`：
    - 使用 typedoc 生成 Markdown 形式的 SDK 参考文档
    - 配合自定义主题脚本 `scripts/CustomMarkdownTheme.js` 做样式加工

这些脚本背后反映的是一个设计理念：

> **尽量让「协议规范」成为单一事实来源（Single Source of Truth），SDK 代码尽可能从规范自动生成，而不是手写类型和接口。**

这样做的直接好处包括：

- 当 OpenAPI / Protobuf 发生变更时，只要重新生成代码，即可同步到 SDK；
- TypeScript 用户可以获得端到端的类型安全与智能提示；
- 减少了大量重复劳动和手动维护的风险。

### 2.2 入口文件：index.ts 的导出设计

JavaScript SDK 的主入口位于 `packages/js-sdk/src/index.ts`。这个文件没有复杂逻辑，但它决定了使用者在 `import 'e2b'` 时能拿到什么。

从上到下，主要的导出可以分为几类。

#### 2.2.1 控制平面 API 与类型

```ts
export { ApiClient } from './api'
export type { components, paths } from './api'
```

- `ApiClient` 是封装控制平面 HTTP 通信的客户端（后文会专门展开）。
- `components` / `paths` 是从 OpenAPI schema 自动生成的类型：
  - `paths['/templates']['post']...` 这样的类型可以被高级用户或内部工具直接复用；
  - 也方便在应用中精细描述某个 API 的请求/响应结构。

#### 2.2.2 连接配置与鉴权

```ts
export { ConnectionConfig } from './connectionConfig'
export type { ConnectionOpts, Username } from './connectionConfig'
```

- `ConnectionConfig` 是集中处理连接参数的类：
  - 负责从环境变量和调用参数中拼出：
    - 域名（API 域 + 沙箱域）
    - 认证信息（API Key、Access Token）
    - 请求超时时间
  - 为后续所有与 E2B 通信的模块提供统一的配置。
- `ConnectionOpts` 和 `Username` 则是对应的类型定义，方便在应用中进行类型标注。

除此之外，入口还导出了 `getSignature` 这样的工具函数（来自 `./sandbox/signature`），用于生成与沙箱上传/下载等相关的签名，在高级或内部场景下会被用到，普通使用者通常无需直接调用。

#### 2.2.3 错误体系

```ts
export {
  AuthenticationError,
  InvalidArgumentError,
  NotEnoughSpaceError,
  NotFoundError,
  SandboxError,
  TemplateError,
  TimeoutError,
  RateLimitError,
  BuildError,
  FileUploadError,
} from './errors'
```

- `SandboxError` 是大部分沙箱相关错误的基类。
- 其余子类则对应不同场景下的具体错误类型：
  - `AuthenticationError` / `RateLimitError`：鉴权与流量限制问题；
  - `TimeoutError`：请求或沙箱操作超时；
  - `TemplateError` / `BuildError`：模板构建失败；
  - `FileUploadError`：文件上传相关问题；
  - 等等。

这种集中定义的错误体系，让上层应用可以写出更清晰的错误处理逻辑，例如：

```ts
try {
  const sandbox = await Sandbox.create('base')
} catch (err) {
  if (err instanceof AuthenticationError) {
    // 引导用户检查 API Key / Token
  } else if (err instanceof RateLimitError) {
    // 做重试或熔断
  }
}
```

#### 2.2.4 Sandbox 相关的子系统类型

文件系统部分：

```ts
export { FileType } from './sandbox/filesystem'
export type { WriteInfo, EntryInfo, Filesystem } from './sandbox/filesystem'
export { FilesystemEventType } from './sandbox/filesystem/watchHandle'
export type {
  FilesystemEvent,
  WatchHandle,
} from './sandbox/filesystem/watchHandle'
```

进程/命令执行部分：

```ts
export { CommandExitError } from './sandbox/commands/commandHandle'
export type {
  CommandResult,
  Stdout,
  Stderr,
  PtyOutput,
  CommandHandle,
} from './sandbox/commands/commandHandle'
export type {
  ProcessInfo,
  CommandRequestOpts,
  CommandConnectOpts,
  CommandStartOpts,
  Commands,
  Pty,
} from './sandbox/commands'
```

沙箱信息与网络配置：

```ts
export type {
  SandboxInfo,
  SandboxMetrics,
  SandboxOpts,
  SandboxApiOpts,
  SandboxConnectOpts,
  SandboxBetaCreateOpts,
  SandboxMetricsOpts,
  SandboxState,
  SandboxListOpts,
  SandboxPaginator,
  SandboxNetworkOpts,
} from './sandbox/sandboxApi'

export type { McpServer } from './sandbox/mcp'

export { ALL_TRAFFIC } from './sandbox/network'
```

这些导出让你在需要更强控制力时可以直接操作底层抽象，例如在自定义封装里显式标注类型：

```ts
import type { SandboxOpts, CommandResult } from 'e2b'

async function runInSandbox(
  code: string,
  opts?: SandboxOpts
): Promise<CommandResult> {
  const sandbox = await Sandbox.create(opts)
  return sandbox.commands.run(code)
}
```

#### 2.2.5 Sandbox 类本身与默认导出

```ts
export { Sandbox }
import { Sandbox } from './sandbox'

export default Sandbox
```

这里有一个小细节：SDK 同时提供了 **具名导出** 和 **默认导出**：

- 具名导出：
  ```ts
  import { Sandbox } from 'e2b'
  ```
- 默认导出：
  ```ts
  import Sandbox from 'e2b'
  ```

这对用户体验很友好：无论偏好哪种导入风格，都可以使用同一个核心类。

#### 2.2.6 模板与构建工具的导出

```ts
export * from './template'

export {
  ReadyCmd,
  waitForPort,
  waitForURL,
  waitForProcess,
  waitForFile,
  waitForTimeout,
} from './template/readycmd'

export {
  LogEntry,
  LogEntryStart,
  LogEntryEnd,
  type LogEntryLevel,
  defaultBuildLogger,
} from './template/logger'
```

- 通过 `export * from './template'`，SDK 直接把模板 DSL（`fromImage`、`copy`、`runCmd` 等）暴露出来。
- `readycmd` 则提供了一组常见的「就绪条件」工具函数：
  - `waitForPort`
  - `waitForURL`
  - `waitForProcess`
  - `waitForFile`
  - `waitForTimeout`
- `logger` 则负责构建过程中的日志结构与默认日志实现。

这部分为后续「模板管理与构建」篇文章打下基础，也说明：
> SDK 并不仅仅是「用现成模板起沙箱」，而是可以**在代码里声明、构建、发布模板**。

到这里，我们已经完成了对 JS SDK 的「外壳」和入口导出设计的梳理。下一步，我们会接着往下看 `ConnectionConfig` 和 `ApiClient`，也就是本文第三节要讲的「配置与 API 通信」。

## 三、JavaScript SDK：配置与 API 通信

在理解了 SDK 的入口和导出之后，接下来要看的两个核心模块是：

- `ConnectionConfig`：统一管理域名、认证、超时等连接参数；
- `ApiClient`：基于 OpenAPI schema 的控制平面 HTTP 客户端。

这两者共同构成了「SDK 和 E2B 控制平面打交道的基础设施」。

### 3.1 ConnectionConfig：连接配置的收敛点

在一个支持多种运行时（Node、浏览器、Serverless）、多种部署形态（SaaS、自建）的 SDK 里，连接配置往往是最容易变乱的一层：域名可以换、认证方式可以换、超时配置可以换，如果每个调用点都自己拼 URL 和 Header，代码会很快失控。

E2B 在 JS SDK 里通过一个集中定义的 `ConnectionConfig` 类来解决这个问题。

> 文件路径：`packages/js-sdk/src/connectionConfig.ts`

#### 3.1.1 配置来源：显式参数 + 环境变量 + 默认值

`ConnectionConfig` 的职责可以理解为：

> 把「用户传入的选项 + 环境变量 + SDK 默认值」融合成一份稳定的连接配置对象，供 SDK 其他模块复用。

典型的配置来源包括：

- 显式传入的 `ConnectionOpts`（例如在 `Sandbox.create(opts)` 时传入）：
  - 自定义 `apiKey` / `accessToken`
  - 自定义 `domain`
  - 自定义请求 `timeoutMs`
- 环境变量：
  - `E2B_API_KEY`：默认的 API Key
  - 可能还包括用于自建部署时的自定义域名、代理配置等
- SDK 内部约定的默认值：
  - 官方云的默认域名，例如 `api.e2b.dev` / `envd.e2b.dev`
  - 默认的请求超时

通过在构造函数中统一读取并归一化，`ConnectionConfig` 可以给后续所有模块提供一致的行为：无论你是通过 SDK 直接用，还是在 CLI、Web 环境或 CI/CD 里用，只要配置到位，后面所有请求都能「自动带对」域名和认证信息。

#### 3.1.2 URL 与 Host 构造

`ConnectionConfig` 除了保存配置，还承担了「帮你算 URL」的工作。典型方法包括：

- `getSandboxUrl(sandboxId, { sandboxDomain, envdPort })`
  - 用于构造指向某个具体沙箱 ENVD 服务的基础 URL，例如：
    - `https://<sandboxId>.<sandboxDomain>:<envdPort>`
  - 这个 URL 会被 `Sandbox` 用来创建 Connect RPC transport，并传给 `EnvdApiClient`、`Filesystem`、`Commands` 等模块。

- `getHost(sandboxId, port, sandboxDomain)`
  - 用于生成可以从外部访问沙箱端口的 Host 地址：
    - 例如在 `sandbox.getHost(3000)` 中使用，用来对接 HTTP 客户端或 WebSocket 客户端。

这种封装有两个好处：

1. 把 E2B 自己的域名路由/负载均衡规则封装在 SDK 内部，对使用者透明；
2. 为未来自建部署或多区域部署预留空间，只需要在 `ConnectionConfig` 一处改变 URL 构造规则，整个 SDK 其他模块都能自动适配。

#### 3.1.3 AbortSignal 与请求超时

很多接口都支持传入一个 `requestTimeoutMs`，而 `ConnectionConfig` 提供了便捷方法来基于这个值创建 `AbortSignal`：

- `getSignal(timeoutMs?: number): AbortSignal`

这个方法常见于：

```ts
const signal = this.connectionConfig.getSignal(opts?.requestTimeoutMs)

const res = await this.envdApi.api.GET('/health', { signal })
```

这样可以：

- 在 Node / 浏览器统一使用基于 AbortController 的超时取消；
- 让每个调用点只关心「我要的超时时间」，而不用手动写 `setTimeout + abort` 的样板代码。

从设计上看，`ConnectionConfig` 在 JS SDK 里的定位类似「一个轻量级的 client context」，集中管理与「连接」相关的一切细节。

### 3.2 ApiClient：基于 OpenAPI 的控制平面客户端

SDK 与控制平面（Control Plane）之间的交互主要集中在一个 `ApiClient` 上，它负责调用 openapi.yml 中定义的各类 HTTP 接口。

> 相关文件：
>
> - `packages/js-sdk/src/api/index.ts`
> - `packages/js-sdk/src/api/metadata.ts`
> - `packages/js-sdk/src/api/schema.gen.ts`（自动生成）

#### 3.2.1 从 OpenAPI 到 TypeScript 类型

`schema.gen.ts` 由 `generate:api` 脚本自动生成，这个脚本的核心流程大致是：

1. 通过 `remove_extra_tags.py` 对 OpenAPI 文件做预处理；
2. 生成 `spec/openapi_generated.yml`（去掉多余 tag 等）；
3. 使用 `openapi-typescript` 工具，将 OpenAPI 规范转换为 TypeScript 类型定义，输出到 `src/api/schema.gen.ts`。

`schema.gen.ts` 中包含了类似：

- `paths`：每个路径（如 `/templates`、`/sandboxes`）的请求/响应结构；
- `components['schemas']`：各种请求体 / 响应体的类型定义。

这些类型随后会被 `ApiClient` 包装起来，用于提供「带类型提示的 HTTP 客户端」。

#### 3.2.2 ApiClient 与 openapi-fetch

在 `src/api/index.ts` 中，SDK 使用 `openapi-fetch` 作为底层 HTTP 调用库，大致模式如下（伪代码）：

```ts
import createClient from 'openapi-fetch'
import type { paths } from './schema.gen'

export class ApiClient {
  private client

  constructor(config: ConnectionConfig) {
    this.client = createClient<paths>({
      baseUrl: config.apiBaseUrl,
      headers: {
        ...config.headers, // 包含 X-API-KEY / Authorization 等
        ...buildMetadataHeaders(), // 来自 metadata.ts
      },
      // 其它配置，如 fetch 实现、超时等
    })
  }

  get api() {
    return this.client
  }
}
```

这里有几个重点：

1. `createClient<paths>(...)` 这一步，把自动生成的 `paths` 类型和具体的 HTTP 客户端绑定了起来，之后：
   - `client.GET('/templates')` 会有完整的类型提示；
   - 如果拼错路径或者请求体结构不匹配，TypeScript 会在编译期报错。

2. `ConnectionConfig` 提供的 `headers` 被直接注入到 `ApiClient` 的默认请求头里，包括：
   - 认证相关的 `X-API-KEY`、`Authorization`；
   - 可能的 Team ID / 自定义 header 等。

3. `metadata.ts` 补充了 SDK 侧的元信息，例如：
   - SDK 版本号；
   - 运行时环境（浏览器 / Node / Bun / Deno）；
   - 这些信息对后端运营和调试非常有用。

于是，在 SDK 其它部分（比如 CLI 或模板构建逻辑）里，就可以直接写出类似这样的代码：

```ts
const res = await client.api.POST('/templates', {
  body: {
    alias: name,
    startCmd,
    // ...
  },
})
```

而不用关注 URL 拼接、header 构造和类型细节。

#### 3.2.3 统一的错误处理：handleApiError

`ApiClient` 并不只是简单地把 HTTP 调用结果返回原样，它还会配合一个统一的错误处理函数，例如：

```ts
import { handleApiError } from './errors' // 伪路径

const res = await client.api.GET('/templates/{templateID}', {
  params: { path: { templateID } },
})

handleApiError(res, 'Error getting template')
```

`handleApiError` 的职责通常包括：

- 根据 HTTP 状态码和响应体判断是否有错误；
- 将其映射为合适的 SDK 错误类型：
  - 401 / 403 → `AuthenticationError`
  - 404 → `NotFoundError`
  - 429 → `RateLimitError`
  - 4xx 参数问题 → `InvalidArgumentError`
  - 5xx → `SandboxError` 或更具体类型
- 附加一些上下文信息（比如调用的是哪个 endpoint、request id 等），方便定位问题。

这种设计使得：

- 上层调用者只需要在统一的错误体系下做 `instanceof` 判断，无需关心具体 HTTP 码；
- 同一个错误类型不会在多处重复定义，保持一致性。

到这一节为止，我们已经把 JS SDK 如何「连上控制平面」讲清楚了：

- `ConnectionConfig` 决定「连到哪儿、带什么头、超时时间多少」；
- `ApiClient` 利用 OpenAPI 生成的类型和 `openapi-fetch` 提供一个强类型的 HTTP 客户端；
- `handleApiError` 将 HTTP 错误统一翻译成 SDK 自己的错误类型。

## 四、JavaScript SDK：Sandbox 核心类与生命周期

前面的内容主要在「壳」的层面：我们知道 SDK 怎么配置连接、怎么调控制平面 API。接下来要看的主角是 `Sandbox` 本身——也就是用户日常最常直接接触的那个类。

这一节我们从一个最典型的调用开始：

```ts
import { Sandbox } from 'e2b'

const sandbox = await Sandbox.create('base')
const result = await sandbox.commands.run('echo 1')
console.log(result.stdout)
```

沿着 `Sandbox.create()` 的路径，一步步跟到内部的 ENVD 调用。

![Sandbox.create 调用链的时序图](/src/content/blog/e2b-source-analysis-2/E2B2-2.png)

> 主要源码文件：
>
> - `packages/js-sdk/src/sandbox/index.ts`
> - `packages/js-sdk/src/sandbox/sandboxApi.ts`
> - `packages/js-sdk/src/api/index.ts`
> - `packages/js-sdk/src/envd/*`（process / filesystem RPC 客户端）

### 4.1 Sandbox 类的整体结构

`Sandbox` 类定义在 `packages/js-sdk/src/sandbox/index.ts` 中。开头的 JSDoc 对它的定位写得很清楚：

> E2B cloud sandbox is a secure and isolated cloud environment.  
> The sandbox allows you to:
> - Access Linux OS
> - Create, list, and delete files and directories
> - Run commands
> - Run isolated code
> - Access the internet

从字段和构造函数可以大致看出它的组成部分（简化后的结构）：

```ts
export class Sandbox extends SandboxApi {
  // 默认模板
  protected static readonly defaultTemplate: string = 'base'
  protected static readonly defaultMcpTemplate: string = 'mcp-gateway'
  protected static readonly defaultSandboxTimeoutMs = DEFAULT_SANDBOX_TIMEOUT_MS

  // 子模块
  readonly files: Filesystem
  readonly commands: Commands
  readonly pty: Pty

  // 标识与连接信息
  readonly sandboxId: string
  readonly sandboxDomain: string
  readonly trafficAccessToken?: string

  protected readonly connectionConfig: ConnectionConfig
  protected readonly envdPort = 49983
  protected readonly mcpPort = 50005
  protected readonly envdApi: EnvdApiClient
  private mcpToken?: string

  constructor(opts: SandboxConnectOpts & { ... }) {
    super()
    this.connectionConfig = new ConnectionConfig(opts)
    this.sandboxId = opts.sandboxId
    this.sandboxDomain = opts.sandboxDomain ?? this.connectionConfig.domain
    // ...
    const rpcTransport = createConnectTransport({ baseUrl: this.envdApiUrl, ... })

    this.envdApi = new EnvdApiClient(/* ... */)

    this.files = new Filesystem(rpcTransport, this.envdApi, this.connectionConfig)
    this.commands = new Commands(rpcTransport, this.connectionConfig, { version: opts.envdVersion })
    this.pty = new Pty(rpcTransport, this.connectionConfig, { version: opts.envdVersion })
  }
}
```

可以看到它本质上是一个「组合对象」：

- 自己持有标识、域名、访问 token 等；
- 同时组合了三个子客户端：
  - `Filesystem`：文件系统相关操作；
  - `Commands`：命令执行（子进程）相关操作；
  - `Pty`：伪终端（交互式 shell）相关操作；
- 还持有一个 `EnvdApiClient`，用来调 ENVD 的 HTTP 接口（健康检查、上传/下载 URL、metrics 等）。

所以，在用户代码里：

```ts
sandbox.files.read('/hello.txt')
sandbox.commands.run('echo 1')
sandbox.pty.create({ cmd: 'bash' })
```

这些其实都是在通过 `Sandbox` 间接使用同一个 ENVD 连接上下文（同一个 `sandboxId` + `envd` base URL）。

### 4.2 从 Sandbox.create() 到控制平面

#### 4.2.1 create 的重载形式

`Sandbox.create` 在源码里是一个重载方法，支持两种调用方式：

1. 只传 `opts`（用默认模板 `base`）：
   ```ts
   static async create<S extends typeof Sandbox>(
     this: S,
     opts?: SandboxOpts
   ): Promise<InstanceType<S>>
   ```
2. 显式指定模板：
   ```ts
   static async create<S extends typeof Sandbox>(
     this: S,
     template: string,
     opts?: SandboxOpts
   ): Promise<InstanceType<S>>
   ```

最终实现是一个合并逻辑：

```ts
static async create<S extends typeof Sandbox>(
  this: S,
  templateOrOpts?: SandboxOpts | string,
  opts?: SandboxOpts
): Promise<InstanceType<S>> {
  const { template, sandboxOpts } =
    typeof templateOrOpts === 'string'
      ? { template: templateOrOpts, sandboxOpts: opts }
      : {
          template: templateOrOpts?.mcp
            ? this.defaultMcpTemplate
            : this.defaultTemplate,
          sandboxOpts: templateOrOpts,
        }

  const config = new ConnectionConfig(sandboxOpts)

  if (config.debug) {
    // 调试模式：不真正创建沙箱，返回一个「假」 Sandbox
    return new this({
      sandboxId: 'debug_sandbox_id',
      envdVersion: ENVD_DEBUG_FALLBACK,
      ...config,
    }) as InstanceType<S>
  }

  const sandboxInfo = await SandboxApi.createSandbox(
    template,
    sandboxOpts?.timeoutMs ?? this.defaultSandboxTimeoutMs,
    sandboxOpts
  )

  const sandbox = new this({ ...sandboxInfo, ...config }) as InstanceType<S>

  // MCP 特殊处理（可选）
  if (sandboxOpts?.mcp) {
    sandbox.mcpToken = crypto.randomUUID()
    const res = await sandbox.commands.run(
      `mcp-gateway --config '${JSON.stringify(sandboxOpts?.mcp)}'`,
      {
        user: 'root',
        envs: {
          GATEWAY_ACCESS_TOKEN: sandbox.mcpToken ?? '',
        },
      }
    )
    if (res.exitCode !== 0) {
      throw new Error(`Failed to start MCP gateway: ${res.stderr}`)
    }
  }

  return sandbox
}
```

整个流程可以拆成三步：

1. 解析参数：决定使用哪个模板（默认是 `base`，如果配置了 MCP，则会使用 `defaultMcpTemplate`）。
2. 构造 `ConnectionConfig`：统一连接参数，为后续所有调用服务。
3. 调用 `SandboxApi.createSandbox(...)` 走一遍控制平面 API，拿到 `sandboxId` 和 ENVD 相关信息，然后 `new Sandbox(...)` 完成实例构造。

#### 4.2.2 SandboxApi.createSandbox：控制平面调用

`SandboxApi` 定义在 `src/sandbox/sandboxApi.ts`，它封装了与控制平面关于「沙箱资源」相关的所有 HTTP 调用，比如：

- 创建沙箱：`createSandbox(...)`
- 连接/恢复沙箱：`connectSandbox(...)`
- 设置超时：`setTimeout(...)`
- 终止：`kill(...)`
- 列表 & 分页：`listSandboxes(...)` / `SandboxPaginator`

`createSandbox` 的大致职责是：

- 调用控制平面的 `/sandboxes` 或类似 endpoint；
- 传入：
  - 模板 ID 或名称；
  - 希望的超时时间；
  - 可能的网络、资源限制等额外参数；
- 返回：
  - `sandboxId`
  - `envdVersion`
  - ENVD 访问 token
  - 沙箱域名等信息

这些字段随后会被 `Sandbox` 构造函数用来：

- 计算 ENVD 的 base URL；
- 初始化 `EnvdApiClient`；
- 创建 Connect RPC transport。

从这一点可以看到一个清晰的分层：

> `Sandbox.create` 负责 orchestrate：  
> 「调用控制平面创建资源」+「用返回信息初始化数据平面客户端」。

### 4.3 Sandbox 构造函数：挂上 ENVD

控制平面返回的信息会被传入 `Sandbox` 构造函数中，构造函数的主要工作就是：

1. 基于 `ConnectionConfig` 和返回的 `sandboxId` / 域名算出 ENVD 的 base URL；
2. 用 `createConnectTransport` 创建 Connect RPC transport；
3. 初始化 `EnvdApiClient`、`Filesystem`、`Commands`、`Pty` 等子模块。

关键代码（部分简化）：

```ts
constructor(
  opts: SandboxConnectOpts & {
    sandboxId: string
    sandboxDomain?: string
    envdVersion: string
    envdAccessToken?: string
    trafficAccessToken?: string
  }
) {
  super()

  this.connectionConfig = new ConnectionConfig(opts)

  this.sandboxId = opts.sandboxId
  this.sandboxDomain = opts.sandboxDomain ?? this.connectionConfig.domain

  this.envdAccessToken = opts.envdAccessToken
  this.trafficAccessToken = opts.trafficAccessToken
  this.envdApiUrl = this.connectionConfig.getSandboxUrl(this.sandboxId, {
    sandboxDomain: this.sandboxDomain,
    envdPort: this.envdPort,
  })

  const sandboxHeaders = {
    'E2b-Sandbox-Id': this.sandboxId,
    'E2b-Sandbox-Port': this.envdPort.toString(),
  }

  const rpcTransport = createConnectTransport({
    baseUrl: this.envdApiUrl,
    useBinaryFormat: false,
    interceptors: opts?.logger ? [createRpcLogger(opts.logger)] : undefined,
    fetch: (url, options) => {
      const headers = new Headers(this.connectionConfig.headers)
      new Headers(options?.headers).forEach((value, key) =>
        headers.append(key, value)
      )
      new Headers(sandboxHeaders).forEach((value, key) =>
        headers.append(key, value)
      )

      if (this.envdAccessToken) {
        headers.append('X-Access-Token', this.envdAccessToken)
      }

      options = {
        ...(options ?? {}),
        headers,
        redirect: 'follow',
      }

      return fetch(url, options)
    },
  })

  this.envdApi = new EnvdApiClient(
    {
      apiUrl: this.envdApiUrl,
      logger: opts?.logger,
      accessToken: this.envdAccessToken,
      headers: this.envdAccessToken
        ? { 'X-Access-Token': this.envdAccessToken }
        : {},
    },
    {
      version: opts.envdVersion,
    }
  )

  this.files = new Filesystem(
    rpcTransport,
    this.envdApi,
    this.connectionConfig
  )
  this.commands = new Commands(rpcTransport, this.connectionConfig, {
    version: opts.envdVersion,
  })
  this.pty = new Pty(rpcTransport, this.connectionConfig, {
    version: opts.envdVersion,
  })
}
```

这里有几个关键点值得注意：

1. **ENVD base URL 的生成**  
   使用 `ConnectionConfig.getSandboxUrl(...)`，把：
   - 控制平面返回的 `sandboxId`
   - 沙箱域名（可能是自建部署提供的）
   - 固定的 ENVD 端口号 `envdPort`（例如 49983）  
   组合成一个完整的 base URL，例如 `https://<sandboxId>.<sandboxDomain>:49983`。

2. **Connect RPC transport 的封装**  
   `createConnectTransport({ baseUrl, fetch: ... })` 用于创建一个适配 ENVD 的 Connect 客户端：
   - 每次请求都会自动带上：
     - 全局 header（来自 `ConnectionConfig.headers`，包括 SDK 版本、运行时信息等）；
     - 沙箱标识头：`E2b-Sandbox-Id`、`E2b-Sandbox-Port`；
     - ENVD 访问 token：`X-Access-Token`。
   - 同时还 patch 了 `fetch` 的 `redirect` 行为为 `follow`，以适配特定运行时（例如 edge runtime 不支持 `redirect: "error"`）。

3. **EnvdApiClient**  
   `EnvdApiClient` 用于访问 ENVD 提供的普通 HTTP 接口（非 RPC），例如：
   - `/health`：健康检查；
   - 上传/下载 URL；
   - metrics 等。  
   这里重新传入了：
   - `apiUrl`：与 Connect RPC 使用同一个 base URL；
   - `accessToken` 和 headers：保证 HTTP 请求也带上 ENVD 访问 token。

4. **子模块初始化**  
   - `Filesystem`、`Commands` 和 `Pty` 都接收：
     - 同一个 `rpcTransport`（保证共用底层连接和拦截器）；
     - `connectionConfig`（保证超时和 header 一致）；
     - ENVD 版本号（便于做版本兼容处理）。

**到这里为止，`Sandbox` 实例已经「挂好线」：  
控制平面已经创建了沙箱资源，数据平面也完成了和 ENVD 的绑定，后续所有的 `sandbox.files.*`、`sandbox.commands.*` 调用，都会通过这一层 transport 被路由到正确的沙箱实例上。**

### 4.4 生命周期方法：连接、检测、超时与销毁

除了 `create` 之外，`Sandbox` 还提供了一系列对生命周期有直接影响的方法：

#### 4.4.1 连接已存在的沙箱：静态 connect 与实例 connect

- 静态方法 `Sandbox.connect(sandboxId, opts?)`：

  ```ts
  static async connect<S extends typeof Sandbox>(
    this: S,
    sandboxId: string,
    opts?: SandboxConnectOpts
  ): Promise<InstanceType<S>> {
    const sandbox = await SandboxApi.connectSandbox(sandboxId, opts)
    const config = new ConnectionConfig(opts)

    return new this({
      sandboxId,
      sandboxDomain: sandbox.sandboxDomain,
      envdAccessToken: sandbox.envdAccessToken,
      trafficAccessToken: sandbox.trafficAccessToken,
      envdVersion: sandbox.envdVersion,
      ...config,
    }) as InstanceType<S>
  }
  ```

  - 通过控制平面的 `connectSandbox` endpoint 获取最新的沙箱状态与 ENVD 访问信息；
  - 随后调用构造函数初始化 ENVD 客户端；
  - 这允许在不同进程或环境中复用同一个沙箱（只要持有 `sandboxId`）。

- 实例方法 `sandbox.connect(opts?)`：  
  用于在当前实例上连接（尤其是从「暂停」状态恢复时）。

#### 4.4.2 状态检查：isRunning

```ts
async isRunning(
  opts?: Pick<ConnectionOpts, 'requestTimeoutMs'>
): Promise<boolean> {
  const signal = this.connectionConfig.getSignal(opts?.requestTimeoutMs)

  const res = await this.envdApi.api.GET('/health', {
    signal,
  })

  if (res.response.status == 502) {
    return false
  }

  const err = await handleEnvdApiError(res)
  if (err) {
    throw err
  }

  return true
}
```

- 直接通过 ENVD 的 `/health` endpoint 判断当前 sandbox 是否存活；
- 对 `502` 特殊处理为「not running」；
- 其它错误会通过统一的错误处理逻辑抛出。

#### 4.4.3 超时管理：setTimeout

```ts
async setTimeout(
  timeoutMs: number,
  opts?: Pick<SandboxOpts, 'requestTimeoutMs'>
) {
  if (this.connectionConfig.debug) {
    // 调试模式下跳过
    return
  }

  await SandboxApi.setTimeout(this.sandboxId, timeoutMs, {
    ...this.connectionConfig,
    ...opts,
  })
}
```

- 通过控制平面 API 更新沙箱的「自动销毁时间」；
- 支持延长或缩短；
- debug 模式下会被跳过，避免干扰本地开发。

#### 4.4.4 销毁：kill

```ts
async kill(opts?: Pick<SandboxOpts, 'requestTimeoutMs'>) {
  if (this.connectionConfig.debug) {
    // 调试模式下跳过
    return
  }

  await SandboxApi.kill(this.sandboxId, { ...this.connectionConfig, ...opts })
}
```

- 通过控制平面请求立刻销毁对应 `sandboxId` 的资源；
- 后续 `isRunning()` 将返回 `false`。

#### 4.4.5 暂停与恢复（beta）

`betaPause` 与 `connect` 联合提供了「暂停 / 恢复」能力：

- `await sandbox.betaPause()`：请求控制平面暂停该沙箱；
- `await Sandbox.connect(sandboxId)`：在之后的某个时间点恢复连接并继续使用。

这为需要持久状态但又不想一直占用资源的场景（例如长对话 agent）提供了一种折中方案。

### 4.5 小结：从 Sandbox.create 到 ENVD 的一条完整链路

把这一节的内容串起来，可以得到一条完整的调用链示意：

1. 用户代码调用：
   ```ts
   const sandbox = await Sandbox.create('base', { timeoutMs: 60_000 })
   ```

2. `Sandbox.create`：
   - 解析模板参数（`'base'`）和 `SandboxOpts`；
   - 构造 `ConnectionConfig`；
   - 调用 `SandboxApi.createSandbox(template, timeoutMs, sandboxOpts)`。

3. `SandboxApi.createSandbox`：
   - 使用 `ApiClient` 调用控制平面 OpenAPI endpoint（例如 `POST /sandboxes`）；
   - 返回 `sandboxId`、`sandboxDomain`、`envdVersion`、`envdAccessToken` 等信息。

4. `new Sandbox({ ...sandboxInfo, ...config })`：
   - 计算 ENVD base URL（`getSandboxUrl`）；
   - 创建 Connect RPC transport，并挂载统一 header 和 token；
   - 创建 `EnvdApiClient`（HTTP）；
   - 初始化 `Filesystem`、`Commands`、`Pty` 子模块。

5. 后续所有：
   - `sandbox.commands.run(...)` → 通过 ENVD process RPC；
   - `sandbox.files.read(...)` → 通过 ENVD filesystem RPC；
   - `sandbox.isRunning()` → 通过 ENVD `/health` HTTP；
   - `sandbox.setTimeout()` / `sandbox.kill()` → 再回到控制平面 API。

这条链路清晰地体现了 JS SDK 的分层设计：

- `Sandbox` 对用户而言是一个高层抽象；
- 控制平面 API 负责资源生命周期；
- ENVD + Connect RPC 负责具体的执行与数据平面操作。

在下一节里，可以继续从「命令执行与文件系统」的角度，拆 Commands / Filesystem 这两个子模块的接口与实现细节。

## 五、JavaScript SDK：命令执行与文件系统子模块

在前一节中，我们看到 `Sandbox` 是如何通过控制平面创建沙箱，并在构造函数里挂上 ENVD 的 HTTP / RPC 客户端。接下来要看的，是用户最常用的两个子模块：

- `sandbox.commands`：远程命令执行与进程管理；
- `sandbox.files`：远程文件系统操作与目录监听。

这两个模块在 JS SDK 里分别通过 Connect RPC 调用 ENVD 的 `process` 和 `filesystem` 服务，是「数据平面」里最核心的部分。

> 主要源码位置（只列关键目录）：
>
> - 命令/进程：
>   - `packages/js-sdk/src/sandbox/commands/index.ts`
>   - `packages/js-sdk/src/sandbox/commands/commandHandle.ts`
>   - `packages/js-sdk/src/envd/process/process_connect.ts`
>   - `packages/js-sdk/src/envd/process/process_pb.ts`
> - 文件系统：
>   - `packages/js-sdk/src/sandbox/filesystem/index.ts`
>   - `packages/js-sdk/src/sandbox/filesystem/watchHandle.ts`
>   - `packages/js-sdk/src/envd/filesystem/filesystem_connect.ts`
>   - `packages/js-sdk/src/envd/filesystem/filesystem_pb.ts`

![packages/js-sdk 目录下各子模块结构示意图](/src/content/blog/e2b-source-analysis-2/E2B2-5.png)

### 5.1 Commands：远程命令执行与进程管理

在用户代码中，`sandbox.commands` 的典型用法大致如下：

```ts
const sandbox = await Sandbox.create('base')

// 简单运行一个命令并等待完成
const result = await sandbox.commands.run('echo "hello"')
console.log(result.exitCode, result.stdout)

// 启动一个长时间运行的进程，并持续读取输出
const handle = await sandbox.commands.start('python server.py')
handle.onStdout((chunk) => console.log('OUT:', chunk))
handle.onStderr((chunk) => console.error('ERR:', chunk))
```

`commands` 模块的目标，就是把「在远程 VM 里启动 / 管理进程」这件事变成一套 JS 友好的 API。

#### 5.1.1 Commands 类：高层接口

> 文件：`packages/js-sdk/src/sandbox/commands/index.ts`

`Commands` 类是对外的主要入口，它持有：

- Connect RPC transport（来自 `Sandbox` 构造函数）；
- `ConnectionConfig`（用于超时控制、header 等）；
- ENVD 版本信息（便于处理不同版本行为差异）。

在接口层面，它通常提供以下几类方法（名字略有出入，以源码为准）：

- **一次性执行命令**：
  - `run(cmd: string, opts?: CommandRequestOpts): Promise<CommandResult>`
    - 封装了「创建进程 → 等待结束 → 收集 stdout/stderr/exitCode」的完整流程。
- **长生命周期命令**：
  - `start(cmd: string, opts?: CommandStartOpts): Promise<CommandHandle>`
    - 启动一个进程，但不立即等待结束，而是返回一个 `CommandHandle` 来做后续交互。
- **进程列表与控制**：
  - `list(): Promise<ProcessInfo[]>`
  - `kill(pidOrId: string | number): Promise<void>`
- **连接已有进程**（比如结合 `sandbox.connect` 使用）：
  - `connect(id: string, opts?: CommandConnectOpts): Promise<CommandHandle>`

`Commands` 内部并不直接处理二进制流和状态，它更像一个「薄的门面」，将参数转成 ENVD RPC 所需的格式，再把返回的信息组装成 `CommandResult` 或 `CommandHandle`。

#### 5.1.2 CommandHandle：命令生命周期的抽象

> 文件：`packages/js-sdk/src/sandbox/commands/commandHandle.ts`

对于需要持续交互或流式输出的进程，SDK 不会一次性返回所有结果，而是创造了一个 `CommandHandle` 对象，来代表「一个正在或已经执行完的命令实例」。

`CommandHandle` 大致会包含：

- 元信息：
  - `id`：进程标识；
  - `cmd`：执行的命令；
  - `pid`：远程进程号（如果 ENVD 暴露）。
- 结果：
  - `exitCode`：退出码；
  - `stdout` / `stderr`：缓冲后的输出（如果 SDK 做了聚合）；
- 事件/流接口：
  - `onStdout(callback: (chunk: Stdout) => void)`
  - `onStderr(callback: (chunk: Stderr) => void)`
  - `onExit(callback: (code: number) => void)`
- 控制方法：
  - `kill()`
  - 可能还有 `sendStdin()`、`resizePty()` 等。

它内部则持有一个到 ENVD process RPC 流的引用，负责把底层的流式数据事件转换为更易用的回调或 Promise。

这层抽象的价值在于：

- 简化了常见场景（一次性 `run` 直接返回 `CommandResult`）；
- 同时保留了对复杂交互场景（长命令、REPL、服务进程）的完整控制。

#### 5.1.3 ENVD process RPC：真正执行命令的那一层

> 文件：
>
> - `packages/js-sdk/src/envd/process/process_connect.ts`
> - `packages/js-sdk/src/envd/process/process_pb.ts`

这两个文件一般由代码生成工具产出，基于 `spec/envd/process/*` 中的 Protobuf/Connect 定义。

大致提供的能力包括：

- 创建进程 / 连接进程：
  - `startProcess(request)` / `connectProcess(request)`
- 列出进程：
  - `listProcesses(request)`
- 发送输入 / 读取输出：
  - 使用 Connect 的流式 RPC（server streaming / bidi streaming）；
- 更新进程配置：
  - 比如切换 PTY 模式、调整窗口大小等。
- 中断或终止进程。

`Commands` 与 `CommandHandle` 就是围绕这些底层 RPC 构建的：  
它们负责把「protobuf 消息 + ConnectError」包装成「JS 对象 + 自定义错误类型」。

### 5.2 Filesystem：远程文件系统操作与目录监听

与命令执行类似，`sandbox.files` 为远程文件系统提供了一组「看起来很本地」的 API：

```ts
const sandbox = await Sandbox.create('base')

// 写入文件
await sandbox.files.write('/app/main.py', 'print("hello")')

// 读取文件
const content = await sandbox.files.read('/app/main.py')

// 列出目录
const entries = await sandbox.files.list('/app')

// 检查存在性
if (await sandbox.files.exists('/data/config.json')) {
  // ...
}
```

#### 5.2.1 Filesystem 类：高层 API

> 文件：`packages/js-sdk/src/sandbox/filesystem/index.ts`

`Filesystem` 的方法设计基本覆盖了常规的 POSIX 文件操作：

- 读写：
  - `read(path, opts?)`
  - `write(path, data, opts?)`
- 目录操作：
  - `list(path)`
  - `makeDir(path, opts?)`
  - `remove(path, opts?)`
  - `rename(from, to)`
- 查询/元数据：
  - `exists(path)`
  - `getInfo(path)`：返回 `EntryInfo`，包含类型、大小、修改时间等。
- 监听：
  - `watchDir(path, opts?)`：返回一个 `WatchHandle`，可以订阅目录变更事件。

对应的类型有：

- `FileType`：文件类型枚举（文件 / 目录 / symlink 等）；
- `WriteInfo`：写入文件后的信息（例如字节数、是否新建等）；
- `EntryInfo`：目录项或文件的元信息结构。

这些类型都在 `index.ts` 与 `src/sandbox/filesystem/watchHandle.ts` 中定义，并在 SDK 入口的 index.ts 里导出，方便外部使用。

#### 5.2.2 WatchHandle：目录变更监听

> 文件：`packages/js-sdk/src/sandbox/filesystem/watchHandle.ts`

`watchDir` 返回的 `WatchHandle` 用于处理文件系统事件订阅，例如：

```ts
const handle = await sandbox.files.watchDir('/logs')

handle.onEvent((event) => {
  console.log('FS event:', event.type, event.path)
})

// 稍后取消监听
await handle.close()
```

典型事件结构包括：

- `FilesystemEventType.CREATED` / `MODIFIED` / `DELETED` 等；
- 对应发生变化的 `path`。

底层依然是通过 ENVD filesystem RPC 的流式接口来驱动，只是被封装成了一个更加符合 JS 习惯的监听对象。

#### 5.2.3 ENVD filesystem RPC：远程文件操作的实现

> 文件：
>
> - `packages/js-sdk/src/envd/filesystem/filesystem_connect.ts`
> - `packages/js-sdk/src/envd/filesystem/filesystem_pb.ts`

和 process 一样，filesystem 相关的代码也是由 Protobuf + Connect 定义生成的，典型能力包括：

- 读文件 / 写文件（支持多种编码、二进制等）；
- 列目录 / 获取元信息；
- 创建/删除/移动文件和目录；
- 设置权限（如果有需要）；
- 打开目录监听流，推送变更事件。

`Filesystem` 在这层之上做了几件事：

1. 把 ENVD 返回的 protobuf 消息转换成易用的 JS 对象（`EntryInfo`、`FilesystemEvent` 等）；
2. 处理错误码并转换为 SDK 自己的错误类型（比如 `NotFoundError`、`NotEnoughSpaceError` 等）；
3. 在需要时，配合 `uploadUrl` / `downloadUrl`（通过控制平面或 ENVD HTTP API 提供的签名 URL）优化大文件传输。

### 5.3 从用户视角回头看：一行代码背后的多层封装

如果回到最开始的两行示例代码：

```ts
const result = await sandbox.commands.run('echo "hello"')
const content = await sandbox.files.read('/app/main.py')
```

这两行背后依次经过的层级大概是：

1. 用户层 API：
   - `Commands.run` / `Filesystem.read`，这是用户看到的接口；
2. SDK 封装层：
   - 将参数组装为 ENVD RPC 请求消息；
   - 利用已初始化好的 Connect transport 发送；
   - 将返回消息和错误映射为 JS 对象和自定义错误类型；
3. ENVD RPC 层：
   - 由 `process_connect.ts` / `filesystem_connect.ts` 自动生成的类型安全客户端；
   - 根据 Protobuf 定义进行序列化 / 反序列化，并进行网络通信；
4. ENVD 服务 + 沙箱 VM：
   - 实际在远程 VM 内开启进程、执行命令；
   - 操作挂载在 VM 内的文件系统；
   - 将 stdout/stderr、文件内容、元信息等通过 RPC 回传。

这种多层设计的好处在于：

- 用户只接触到简单直观的 API；
- SDK 作者只需要在封装层维护少量手写逻辑，其余全部交给代码生成与协议定义；
- 当 ENVD 协议或控制平面 API 升级时，只要更新 Protobuf / OpenAPI 并重新生成客户端，就可以相对低成本地演进整个系统。

到这里，JS 侧「命令 + 文件系统」子模块就讲完了，下一节我们换到 Python 视角，看另一门语言里的 SDK 如何按同样的架构复刻这一套设计。

![用户层 API、SDK 封装层与协议/服务层的三层分层示意图](/src/content/blog/e2b-source-analysis-2/E2B2-6.png)

> 补充：常用术语对照表
>
> | 概念         | JS SDK 中的命名            | Python SDK 中的命名   | 含义                                                             |
> | ------------ | -------------------------- | ---------------------- | ---------------------------------------------------------------- |
> | 进程 / 命令  | `sandbox.commands` / `Commands` | `sbx.process` / `process` | 在沙箱内启动和管理进程，执行命令，获取 stdout/stderr 等         |
> | 文件系统     | `sandbox.files` / `Filesystem` | `sbx.files` / `files`     | 读写文件、列目录、创建/删除/移动文件和目录、监听目录变更事件等 |
> | 模板         | `template.*`                | `template.*`           | 描述「如何构建一个沙箱镜像/模板」的 DSL，供后续 Sandbox 复用    |
> | 控制平面 API | `ApiClient` + `src/api/*`   | `e2b.api.*`            | 管理模板、沙箱、团队、密钥等控制平面资源                         |
> | ENVD 客户端  | `src/envd/*`                | `e2b.envd.*` + `e2b_connect.*` | 面向单个沙箱实例的进程 / 文件系统 / PTY / metrics 等数据平面操作 |

## 六、JavaScript SDK：ENVD 服务交互

前两节更多站在「Sandbox 视角」看文件/命令，这一节单独站在 ENVD 客户端视角看一下：

**位置**：`packages/js-sdk/src/envd/*`

主要文件：

- `api.ts`：`EnvdApiClient`，负责：
  - 健康检查（`GET /health`，被 `sandbox.isRunning` 使用）；
  - 初始化环境、上传/下载文件、获取指标等；
- `rpc.ts`：Connect RPC 客户端与错误映射工具；
- `versions.ts`：ENVD 版本相关常量。

`rpc.ts` 的关键职责：

- 基于 `ConnectionConfig` 生成带鉴权头的 Connect RPC 客户端；
- 将 `ConnectError` 按 code 转换为 SDK 自定义错误：
  - 超时 → `TimeoutError`
  - 资源不存在 → `NotFoundError`
  - 权限 / 认证错误 → `AuthenticationError` 等。

控制平面（REST）与 ENVD（RPC）在职责上非常清晰：

- 控制平面：负责「账号/团队/模板/沙箱元数据」等管理类操作；
- ENVD：负责「某个具体沙箱 VM 内的文件 + 进程」这类高频、对时延敏感的操作。

SDK 通过 `ApiClient` + EnvdApiClient + Connect RPC 客户端，把这两层统一封装在 `Sandbox` 的方法里，对调用方屏蔽了层次差异。

## 七、Python SDK：对称设计与实现

前面几节我们围绕 JavaScript SDK 展开，从入口导出、配置与 API 通信，一直讲到 `Sandbox` 的生命周期和命令/文件子模块。  
这节我们换个视角，看看 **Python SDK 是如何在另一门语言里复刻同样的设计的**。

整体来说，Python 版和 JS 版在抽象层级上是高度对齐的：

- 都有 `Sandbox`（以及 Python 独有的 `AsyncSandbox`）；
- 都有统一的 `ConnectionConfig`；
- 都通过一层 `api/` 模块访问控制平面 OpenAPI；
- 都通过 `envd/` 客户端访问 ENVD 的 process / filesystem RPC；
- JS 用的是 `connect-es` 生成的客户端，Python 用的是 `connect-python` + `e2b_connect`。

这种对称性让你在两门语言之间迁移时，几乎不需要重新建立心智模型。

> 主要源码目录：
>
> - `packages/python-sdk/e2b/__init__.py`
> - `packages/python-sdk/e2b/connection_config.py`
> - `packages/python-sdk/e2b/api/*`
> - `packages/python-sdk/e2b/sandbox_sync/*`
> - `packages/python-sdk/e2b/sandbox_async/*`
> - `packages/python-sdk/e2b/envd/*`
> - `packages/python-sdk/e2b_connect/*`

### 7.1 入口与公共 API：`e2b.__init__`

在 JS 里我们有 index.ts，而在 Python 里，扮演同样角色的是 `e2b/__init__.py`。  
用户的典型调用就是从这里开始的：

```python
from e2b import Sandbox, AsyncSandbox

with Sandbox("base") as sbx:
    proc = sbx.process.start("echo 1")
    print(proc.stdout)

async with AsyncSandbox("base") as sbx:
    proc = await sbx.process.start("echo 1")
    print(proc.stdout)
```

`__init__.py` 里会集中导出：

- 核心类：
  - `Sandbox`（同步）
  - `AsyncSandbox`（异步）
- 配置相关：
  - `ConnectionConfig`
- 错误/异常：
  - 各种自定义异常类（认证错误、超时、资源不足等）
- 模板 API：
  - 用于声明/构建模板的 DSL（对应 JS 的 `template` 模块）

这与 JS SDK 的 index.ts 结构非常类似：  
**把真正干活的子模块藏在包内，通过一个统一入口暴露有限且清晰的 API 面。**

### 7.2 ConnectionConfig：Python 版本的连接配置中心

> 文件：`packages/python-sdk/e2b/connection_config.py`

Python 版的 `ConnectionConfig` 做的事情和 JS 版几乎一样：

- 聚合配置来源：
  - 显式传入参数（构造 `Sandbox` / `AsyncSandbox` 时）
  - 环境变量（如 `E2B_API_KEY`、自定义域名等）
  - 默认值（官方云默认域名、默认超时）
- 负责生成：
  - 控制平面 API base URL；
  - 针对某个 `sandbox_id` 的 ENVD base URL；
  - 请求的额外 header（认证、客户端标识等）；
  - 超时配置与重试策略所需参数。

典型的属性会包括：

- `api_key` / `access_token`
- `api_url` / `sandbox_domain`
- `request_timeout`
- 可能还有代理设置等（根据实现而定）

在 Python 中，因为 `httpx`/`httpcore` 会直接使用这些配置，`ConnectionConfig` 通常还会暴露一些便于初始化 HTTP 客户端的辅助方法或属性。

### 7.3 控制平面 API：`e2b.api` 模块

> 目录：`packages/python-sdk/e2b/api`

和 JS SDK 的 `src/api/*` 类似，Python 版 API 客户端的职责是：

- 基于 OpenAPI 规范（或手写/生成的 Client）提供一组方法，用于：
  - 创建 / 列出 / 删除沙箱；
  - 管理模板（创建构建任务、查询构建状态等）；
  - 管理团队、访问密钥等资源；
- 把 HTTP 层的错误统一翻译成 SDK 的异常类。

典型的实现会基于：

- `httpx` 作为 HTTP 客户端；
- 一个包内的 `Client` 类封装：
  - 基础 URL；
  - 认证头（`X-API-KEY` / `Authorization`）；
  - 超时、重试逻辑；  
- 错误处理逻辑：
  - 401/403 → `AuthenticationException`
  - 404 → `NotFoundException`
  - 429 → `RateLimitException`
  - 5xx → 通用 `SandboxException` 或类似。

这样，在 `Sandbox` 层就可以写出类型清晰的调用：

```python
from e2b.api import client

sandbox_info = client.create_sandbox(
    template="base",
    timeout_ms=timeout_ms,
    # ...
)
```

而不用亲自操作 `httpx` 或解析 JSON 响应。

### 7.4 Sandbox 与 AsyncSandbox：同步与异步双实现

> 目录：
>
> - 同步版：`packages/python-sdk/e2b/sandbox_sync`
> - 异步版：`packages/python-sdk/e2b/sandbox_async`
> - 公共定义：`packages/python-sdk/e2b/sandbox`

Python SDK 的一个显著差异是：  
它同时提供了同步和异步两个版本的 `Sandbox` 实现，分别适配：

- 传统同步代码（脚本、简单服务）；
- `asyncio` 驱动的异步应用（如 FastAPI、异步 Agent 框架等）。

#### 7.4.1 Sync Sandbox：`e2b.sandbox_sync.Sandbox`

同步版的 `Sandbox` 入口类似：

```python
from e2b import Sandbox

with Sandbox("base") as sbx:
    sbx.process.start("echo 1")
```

它的职责对应 JS 版 `Sandbox`：

- 生命周期管理：
  - `create` / `connect` / `kill` / `pause` / `set_timeout`；
- 子模块：
  - `sbx.process`：进程/命令相关操作（Python 这边叫 process，前文 JS 里对应的是 `sandbox.commands`）；
  - `sbx.files`：文件系统操作；
- 内部组合：
  - 控制平面 API 客户端（`e2b.api`）；
  - ENVD 客户端（`e2b.envd` + `e2b_connect`）。

#### 7.4.2 AsyncSandbox：`e2b.sandbox_async.AsyncSandbox`

异步版的 `AsyncSandbox` 则使用 `async with` 和 `await`：

```python
from e2b import AsyncSandbox

async with AsyncSandbox("base") as sbx:
    proc = await sbx.process.start("echo 1")
    print(await proc.stdout.read())
```

它的 API 设计基本和同步版镜像对称，只是所有 IO 操作都变成了可等待的 coroutine。  
内部实现上通常会：

- 共享相同的类型定义（在 `e2b/sandbox` 目录下）；
- 使用异步版的 HTTP / RPC 客户端（比如 `httpx.AsyncClient` + 异步 Connect 客户端）；
- 保持一样的错误体系和参数结构。

这种设计让你可以根据项目架构选择同步/异步实现，而不需要重新学习一套完全不同的 API。

### 7.5 ENVD 客户端：`e2b.envd` 与 `e2b_connect`

> 目录：
>
> - `packages/python-sdk/e2b/envd/*`
> - `packages/python-sdk/e2b_connect/*`
> - `packages/connect-python/*`（独立的 Connect RPC Python 客户端实现）

和 JS 中的 `src/envd/*` 一样，Python 通过 `e2b.envd` 模块来访问 ENVD 的 process / filesystem 服务。这层再向下，则建立在 `e2b_connect` 包之上。

#### 7.5.1 e2b.envd：高层封装

`e2b.envd` 中通常包括：

- `filesystem/filesystem_connect.py`：
  - 同步和异步版本的文件系统客户端；
  - 方法与 JS `Filesystem` 对应：`read`, `write`, `list`, `make_dir`, `remove`, `watch_dir` 等。
- `process/process_connect.py`：
  - 同步和异步版本的进程客户端；
  - 方法对应 JS 里的 `Commands` / `CommandHandle` 所依赖的 RPC。
- 若对应 JS 里的 `*_pb.ts` 类型文件，这里则是诸如 `filesystem/filesystem_pb2.py`、`process/process_pb2.py` 这样的 Protobuf 生成文件。
- `rpc.py`：
  - 统一处理 Connect RPC 错误，将其映射为 `e2b.exceptions` 中的具体异常；
  - 构造认证 header（通常带上 ENVD 访问 token）。

#### 7.5.2 e2b_connect：Connect RPC Python 客户端

> 目录：`packages/python-sdk/e2b_connect/*`  
> 相关生成工具：`cmd/protoc-gen-connect-python`

`e2b_connect` 是一个泛用的 Connect RPC Python 客户端实现，和具体的 E2B 业务逻辑解耦，它提供：

- `Client` 类：
  - 支持 unary / server-streaming / bidi-streaming 等多种 RPC 模式；
  - 支持 JSON / Protobuf 序列化；
  - 支持 Gzip 压缩和重试策略；
- 自定义异常：
  - `ConnectException` 等，用于描述 RPC 层面的错误。

此外，`protoc-gen-connect-python` 这个 protoc 插件（用 Go 实现）会：

- 从 Protobuf 服务定义生成 Python 客户端 stub；
- 生成的方法会直接使用 `Client` 做底层调用；
- 自动区分 unary / streaming 等不同 RPC 类型。

在 E2B 的 Python SDK 中，`e2b.envd` 就是在这层之上再包装一层，把「通用 RPC 客户端」变成「针对 ENVD 的领域客户端」。

### 7.6 错误与异常体系：与 JS 对齐的 Python 异常

> 文件：`packages/python-sdk/e2b/exceptions.py`

Python SDK 也定义了一组与 JS 错误类型对齐的异常类，例如：

- 通用基类：
  - `E2BException` 或类似名称；
- 控制平面相关：
  - `AuthenticationException`
  - `RateLimitException`
  - `NotFoundException`
  - `TimeoutException`
- 沙箱/模板相关：
  - `SandboxException`
  - `TemplateException`
  - `BuildException` 等。

这些异常会在两处被抛出：

1. 控制平面 API 客户端（`e2b.api`）里，将 HTTP 状态码与响应体映射为异常；
2. ENVD 客户端（`e2b.envd` + `e2b_connect`）里，将 Connect RPC 错误映射为异常。

这样，使用 Python SDK 的调用者可以：

```python
from e2b import Sandbox
from e2b.exceptions import AuthenticationException, TimeoutException

try:
    with Sandbox("base") as sbx:
        sbx.process.start("echo 1")
except AuthenticationException:
    # 引导用户检查 API Key / Token
except TimeoutException:
    # 做重试或记录慢调用
```

和 JS SDK 一样，错误/异常集中在一个模块里定义，确保在不同调用路径上表现一致。

### 7.7 小结：跨语言的一致性

到这里，我们可以对比着总结一下 JS 和 Python 这两个 SDK 的设计：

- **入口层**：
  - JS：index.ts
  - Python：`e2b/__init__.py`
- **连接配置**：
  - JS：`ConnectionConfig`（`src/connectionConfig.ts`）
  - Python：`ConnectionConfig`（`e2b/connection_config.py`）
- **控制平面 API**：
  - JS：`src/api/*` + OpenAPI → TS 类型
  - Python：`e2b/api/*` + HTTP 客户端
- **沙箱抽象**：
  - JS：`Sandbox`（同步，基于 Promise）
  - Python：`Sandbox` + `AsyncSandbox`（同步 + asyncio）
- **ENVD 客户端**：
  - JS：`src/envd/*`（Connect + Protobuf）
  - Python：`e2b/envd/*` + `e2b_connect/*`（Connect + Protobuf）
- **错误体系**：
  - JS：`src/errors.ts`
  - Python：`e2b/exceptions.py`

从架构角度看，这是一套**先定义清晰领域模型和分层，再按层次用代码生成工具和语言特性去填充实现**的设计：

- OpenAPI 和 Protobuf/Connect schema 是协议层的单一事实来源；
- JS/Python SDK 则是在不同语言下对同一协议的两种「友好包装」。

![JavaScript SDK 与 Python SDK 模块层级的对照图](/src/content/blog/e2b-source-analysis-2/E2B2-4.png)

在后续关于 CLI 或 API 设计的分析中，你可以继续沿着这个思路，去拆 CLI 如何在 Node 里利用 JS SDK 和 Docker，把本地 `Dockerfile` + 代码构建成模板；以及 openapi.yml / `spec/envd/*` 本身的接口设计和演进策略。

## 八、模板管理 API 概览（为 CLI 篇埋伏笔）

模板管理这块，我们会在下一篇 CLI 篇里从 `e2b template build` 的执行流程来完整展开，这里先做一个「纯 SDK 视角」的 API 概览，方便你建立整体心智模型。

在 JS SDK 中，模板相关能力主要位于：

- `packages/js-sdk/src/template/index.ts`
- `packages/js-sdk/src/template/dockerfileParser.ts`
- `packages/js-sdk/src/template/readycmd.ts`
- `packages/js-sdk/src/template/logger.ts`

在 Python SDK 中，则主要在：

- `packages/python-sdk/e2b/template/main.py`
- `packages/python-sdk/e2b/template/dockerfile_parser.py`
- `packages/python-sdk/e2b/template/readycmd.py`
- `packages/python-sdk/e2b/template/logger.py`

从抽象层级上看，两端都是：

- 用一个「模板描述 DSL」来表达：
  - 以什么基础镜像为起点（`fromImage` / `from_image`）；
  - 如何修改文件系统（`copy` / `remove` / `makeDir` / `make_dir` 等）；
  - 在构建阶段需要跑哪些命令（`runCmd` / `run_cmd`，以及常用的 `pipInstall` / `npmInstall` / `aptInstall` 等 helper）；
  - 模板启动后应该跑什么（`setStartCmd` / `set_start_cmd`）；
  - 以及「什么时候算就绪」（`setReadyCmd` / `set_ready_cmd` + `waitForPort` / `waitForURL` / `waitForFile` / `waitForTimeout` 等）。
- 把这些 DSL 最终转换为：
  - 控制平面模板 API 的调用参数；
  - 本地需要打包上传的文件列表（gzipped tarball）；
  - 以及本地/远端构建日志的消费逻辑。

如果你已经看完了前面关于 `Sandbox` 的几节，可以把模板管理理解成是「在控制平面这头生产一个长期可重用的 Sandbox 蓝图」：

- 在 SDK 里，模板 API 负责描述镜像/文件/命令/就绪条件；
- 在云端控制平面里，这些信息会被编译成实际的镜像构建任务；
- 构建产物会注册为某个模板 ID，后续所有 `Sandbox.create`/`AsyncSandbox` 的调用，就只是指定这个模板 ID 即可。

换句话说：

> 模板管理 API 是「事前准备」；
> Sandbox 相关 API 则是「事中使用」。

CLI 的 `e2b template build` 命令本质上就是：

1. 用 Docker 把你的本地代码和依赖打包成镜像或压缩包；
2. 调用 SDK 所封装的模板 API，把构建信息和文件上传到控制平面；
3. 轮询模板构建状态，并把构建日志回显到终端。

![模板 DSL → SDK 模板 API → 控制平面模板构建任务 → 模板 ID 的流程图](/src/content/blog/e2b-source-analysis-2/E2B2-3.png)

第三篇我们会从 `packages/cli` 的源码里，沿着这条调用链把每一个步骤拆开。

下面用一个极简的「最小 Web 模板」伪代码，直观感受一下这套 DSL 的使用方式（伪代码，重点是结构而不是准确 API 名）：

**JavaScript 版本示意：**

```ts
import { template } from '@e2b/sdk'

// 声明一个最小的 Node.js Web 模板
const webTemplate = template()
  .fromImage('node:20-alpine')
  .copy('./app', '/app')
  .runCmd('cd /app && npm install')
  .setStartCmd(['node', 'server.js'])
  .setReadyCmd((ready) =>
    ready
      .waitForPort(3000)        // 等 3000 端口打开
      .waitForURL('http://127.0.0.1:3000/health'),
  )

// 交给控制平面去构建这个模板
await webTemplate.build({ name: 'minimal-node-web' })
```

**Python 版本示意：**

```python
from e2b.template import Template

web_template = (
    Template()
    .from_image('python:3.12-slim')
    .copy('./app', '/app')
    .run_cmd('cd /app && pip install -r requirements.txt')
    .set_start_cmd(['python', 'server.py'])
    .set_ready_cmd(lambda ready: (
        ready
        .wait_for_port(8000)
        .wait_for_url('http://127.0.0.1:8000/health')
    ))
)

web_template.build(name='minimal-python-web')
```

真实仓库里的 API 命名可能会有细微差异，但整体结构就是：

- 先选基础镜像；
- 再描述「把哪些文件放到哪里」和「构建阶段要执行哪些命令」；
- 最后声明「容器里要如何启动应用」和「就绪条件是什么」，然后交给控制平面去构建。

## 九、小结：从 SDK 出发看 E2B 的分层设计

这一篇我们几乎完全站在「客户端」视角，沿着 SDK 的源码一路往下看，梳理出了这样一条结构非常清晰的分层：

- 最上层：`Sandbox` / `AsyncSandbox` / `Template` 等高层抽象；
- 中间层：
  - 控制平面客户端（JS 的 `src/api/*`，Python 的 `e2b/api/*`）；
  - ENVD 客户端（JS 的 `src/envd/*`，Python 的 `e2b/envd/*` + `e2b_connect`）；
  - 连接配置（`ConnectionConfig`）与统一错误体系；
- 最底层：OpenAPI + Protobuf/Connect schema，和云端真正执行命令、读写文件的 Firecracker 沙箱。

从实现方式来看，E2B 的 SDK 有几个非常鲜明的特点：

1. **协议优先（spec-first）**  
   控制平面和 ENVD 的协议都先用 OpenAPI 和 Protobuf/Connect 定义好，再通过代码生成工具产出类型和客户端，实现「协议是唯一真相源，SDK 是协议上的外壳」。

2. **跨语言一致的抽象**  
   JS / Python 两个 SDK 在抽象层级和命名上高度对齐：  
   无论你用哪种语言，都可以用同样的心智模型来理解 `Sandbox` / `Template` / `commands` / `files`，这对多语言团队和文档维护都非常友好。

3. **控制平面 / 数据平面清晰分离**  
   - 控制平面 API 只负责资源生命周期（创建/列出/删除模板和沙箱、设置超时等）；
   - 数据平面（ENVD）只负责具体的执行（进程 / 文件系统 / PTY / metrics）。
   SDK 在 `Sandbox.create` 和构造函数这两个关键点上，把两者黏合到一起。

4. **丰富但分层良好的 API 面**  
   - 对普通使用者：只需关心几行简单的 `Sandbox.create` + `commands.run` + `files.read/write`。
   - 对高级使用者：可以直接拿到 `ApiClient` / `ConnectionConfig` / ENVD 客户端类型，去做更底层或更定制化的集成。

如果从「用户调用 → 协议」的角度，把本文的内容压缩成一条抽象的调用链，可以写成：

```text
用户代码
  ↓
Sandbox / Template （高层抽象）
  ↓
JS/Python SDK 层：
  - ConnectionConfig
  - ApiClient（OpenAPI → HTTP）
  - ENVD 客户端（Connect RPC → process/filesystem）
  ↓
E2B 控制平面服务 + ENVD 守护进程
  ↓
Firecracker VM 内实际执行代码、读写文件、跑服务
```

在接下来的两篇里，我们可以换到另外两个视角继续把这条链路补完，把「本篇的 JS/Python SDK 视角」和「CLI / 协议设计」拼成一整张图：

- **《E2B 源码分析（三）：CLI 与模板构建》**  
  从 cli 入手，追踪 `e2b template build` 如何：
  - 解析本地 `Dockerfile` / e2b.toml；
  - 调用本地 Docker 做 `build` + `push`；
  - 通过 SDK / ApiClient 调用控制平面模板 API；
  - 轮询模板构建日志并输出到本地终端。

- **《E2B 源码分析（四）：API 规范与协议设计》**  
  回到 spec 目录，从：
  - openapi.yml（控制平面）
  - `spec/envd/*`（ENVD Protobuf/Connect 定义）  
  这两个入口出发，分析：
  - 资源建模（Template / Sandbox / Team / Key 等）；
  - 行为建模（命令执行、文件系统、PTY、metrics）；
  - 以及它们与 SDK 中类型和客户端的映射关系。

模板管理的细节会在第三篇结合 CLI 一起拆，这里只做一个简要的 SDK 视角概览。

在 JS SDK 中，模板相关能力主要位于：

- `packages/js-sdk/src/template/index.ts`
- `packages/js-sdk/src/template/dockerfileParser.ts`
- `packages/js-sdk/src/template/readycmd.ts`
- `packages/js-sdk/src/template/logger.ts`

在 Python SDK 中，则主要在：

- `packages/python-sdk/e2b/template/main.py`
- `packages/python-sdk/e2b/template/dockerfile_parser.py`
- `packages/python-sdk/e2b/template/readycmd.py`
- `packages/python-sdk/e2b/template/logger.py`

SDK 提供了一套「声明式构建模板」的 API：

- 选择基础镜像：`fromImage` / `from_image`；
- 描述文件系统变更：`copy` / `remove` / `makeDir` / `make_symlink` 等；
- 运行命令：`runCmd` / `run_cmd`，以及常用的 `pipInstall` / `npmInstall` / `aptInstall` 等；
- 设置启动命令和就绪检查：`setStartCmd` / `set_start_cmd` + `setReadyCmd` / `set_ready_cmd`；
- 就绪检查 helper：`waitForPort`、`waitForURL`、`waitForFile`、`waitForTimeout` 等。

SDK 在内部负责：

- 解析 Dockerfile（如果用户走 Dockerfile 路径）；
- 读取 `.dockerignore`、计算文件哈希来做缓存；
- 将本地文件打包成 gzipped tar 上传；
- 调用控制平面的构建 API，流式消费构建日志，直到构建完成或失败。

可以把它理解为：

> **一套「把 Dockerfile/本地目录 → E2B 模板」的编程接口，CLI 的 `e2b template build` 只是这套接口的一个「命令行皮肤」。**

## 十、小结：SDK 设计的几个关键点

从 SDK 这一层往回看 E2B，可以总结出几个有意思的设计点：

1. **强类型接口 + 自动生成**
   - 控制平面：通过 OpenAPI 生成 `schema.gen.ts` / Python 客户端；
   - ENVD：通过 Protobuf + Connect RPC 生成双端客户端；
   - 让「文档 → 类型 → 代码」形成一条自动化链路，减少手写胶水代码。

2. **Control plane vs Data plane 的清晰分层**
   - Control plane：负责账号、团队、模板、沙箱元数据等管理操作；
   - Data plane（ENVD）：负责具体沙箱实例内的文件与进程操作；
   - SDK 在中间负责「一次方法调用 → 多个后端服务的协作」。

3. **多语言 SDK 的对称设计**
   - JS / Python 在模块划分和抽象上尽量对齐：同名类、相似方法；
   - 降低跨语言切换成本，也让文档/示例更容易维护。

4. **生命周期与资源管理内聚在 Sandbox 中**
   - SDK 从用户视角把「创建/连接/暂停/销毁 + 文件/命令/PTY」都收束到 `Sandbox` 这个中心对象上；
   - 既方便 Agent 框架集成，也便于后续扩展子能力。

在下一篇《E2B 源码分析（三）：CLI 与模板构建》中，我们会顺着本文第九节的线索，拆开 `packages/cli` 里的命令实现，看 `e2b template build` 如何把本地 Dockerfile / 目录变成一个可重用的 E2B 模板，以及它与 SDK 模板 API 的边界在哪里。
