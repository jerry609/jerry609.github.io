------------

title: 'Claude Agent SDK 源码与实战（一）：整体架构与快速上手'

description: '从使用者视角出发，先跑通 Claude Agent SDK 的最小示例，再从项目结构和抽象设计上看清这套 Python SDK 在解决什么问题。'title: 'Claude Agent SDK 源码与实战（一）：整体架构与快速上手'

publishDate: '2025-12-05'

tags: ['源码分析', 'claude', 'sdk', 'python', 'agent']description: '从使用者视角出发，先跑通 Claude Agent SDK 的最小示例，再从项目结构和抽象设计上看清这套 Python SDK 在解决什么问题。'title: 'Claude Agent SDK 源码与实战（一）：整体架构与快速上手'title: 'Claude Agent SDK 源码与实战（一）：整体架构与快速上手'

language: 'zh-CN'

---publishDate: '2025-12-05'



> 这一篇是 Claude Agent SDK 源码分析系列的开篇：先不急着钻函数细节，而是**跑通最小示例 + 读懂项目结构 + 理解它到底在解决什么问题**。后面几篇再一点点下潜到类型系统、内部 Client、消息解析、MCP 工具等实现细节。tags: ['源码分析', 'claude', 'sdk', 'python', 'agent']description: '从使用者视角出发，先跑通 Claude Agent SDK 的最小示例，再从项目结构和抽象设计上看清这套 Python SDK 在解决什么问题。'description: '从使用者视角### 1.3 本系列的节奏



## 一、为啥要关心 Claude Agent SDK？language: 'zh-CN'



### 1.1 它到底在解决什么问题？---publishDate: '2025-12-05'



如果你已经写过几次 LLM 应用，大概率遇到过这些情况：



- 直接 HTTP 调 Claude API，每次都要自己拼 JSON，**tools / messages / metadata 写多了非常痛苦**；> 这一篇是 Claude Agent SDK 源码分析系列的开篇：先不急着钻函数细节，而是**跑通最小示例 + 读懂项目结构 + 理解它到底在解决什么问题**。后面几篇再一点点下潜到类型系统、内部 Client、消息解析、MCP 工具等实现细节。tags: ['源码分析', 'claude', 'sdk', 'python', 'agent']本系列会按这样的节奏来拆这套 SDK：

- 想玩工具调用 / MCP / 多轮 Agent，对话状态、工具结果拼接、流式增量解析一多，**业务代码迅速变成一坨状态机**；

- 随着功能增多，你需要：

  - 明确的错误类型（区分鉴权、限流、超时、工具执行异常…）；

  - 比较好的流式接口（不要自己手撸 event parser）；## 一、为啥要关心 Claude Agent SDK？language: 'zh-CN'

  - 更清晰的测试、版本、发布流程。



`claude-agent-sdk-python` 想解决的，就是这些问题中的大头：

### 1.1 它到底在解决什么问题？----### 1.4 和 Claude Code 的关系与区别

1. 用一个清晰的 `ClaudeSDKClient` / `query()` 抽象，把「请求参数 + 工具 + 对话历史」统一收口；

2. 用完善的类型（`types.py`）建模消息、工具、响应、错误等核心概念；

3. 提供流式模式、工具调用、MCP 集成、Hook 系统等高级能力；

4. 自带完整的测试与工程化体系，作为正式 SDK 发布，而不是「demo 脚本」。如果你已经写过几次 LLM 应用，大概率遇到过这些情况：



### 1.2 核心设计：通过子进程与 Claude Code CLI 通信



**这是理解这套 SDK 最关键的一点**：它并不是直接调用 Claude API，而是**通过子进程启动 Claude Code CLI，然后用一套自定义的「控制协议（Control Protocol）」进行双向通信**。- 直接 HTTP 调 Claude API，每次都要自己拼 JSON，**tools / messages / metadata 写多了非常痛苦**；> 这一篇是 Claude Agent SDK 源码分析系列的开篇：先不急着钻函数细节，而是**跑通最小示例 + 读懂项目结构 + 理解它到底在解决什么问题**。后面几篇再一点点下潜到类型系统、内部 Client、消息解析、MCP 工具等实现细节。很多人第一次看到这个 SDK 名字时，会下意识以为它是「给 Claude Code 编辑器用的 SDK」。其实更准确的说法是：



架构层次如下：- 想玩工具调用 / MCP / 多轮 Agent，对话状态、工具结果拼接、流式增量解析一多，**业务代码迅速变成一坨状态机**；



```text- 随着功能增多，你需要：

用户代码

   ↓  - 明确的错误类型（区分鉴权、限流、超时、工具执行异常…）；

┌───────────────────────────────────────────────┐

│  公共 API 层（claude_agent_sdk/）              │  - 比较好的流式接口（不要自己手撸 event parser）；## 一、为啥要关心 Claude Agent SDK？- **Claude Agent SDK 是一个通用的 Agent / 工具 / MCP SDK**，用来在你自己的项目里构建智能体、工具调用、MCP 集成等能力；

│  ├── query()       → 简单的一次性查询          │

│  ├── ClaudeSDKClient → 双向交互式对话客户端     │  - 更清晰的测试、版本、发布流程。

│  └── types.py       → 所有类型定义              │

└───────────────────────────────────────────────┘- **Claude Code 则是一个具体的产品形态**（在编辑器里写/改代码），它内部当然也要调用 Claude 模型和一堆工具，但那是产品实现细节；

   ↓

┌───────────────────────────────────────────────┐`claude-agent-sdk-python` 想解决的，就是这些问题中的大头：

│  内部实现层（_internal/）                       │

│  ├── InternalClient → 核心客户端实现           │### 1.1 它到底在解决什么问题？- **两者的关系**：Claude Agent SDK 通过子进程启动 Claude Code CLI 来工作，所以它们共享同一套底层协议和能力。

│  ├── Query          → 控制协议 + 消息路由      │

│  └── message_parser → 消息解析器              │1. 用一个清晰的 `ClaudeSDKClient` / `query()` 抽象，把「请求参数 + 工具 + 对话历史」统一收口；

└───────────────────────────────────────────────┘

   ↓2. 用完善的类型（`types.py`）建模消息、工具、响应、错误等核心概念；

┌───────────────────────────────────────────────┐

│  传输层（_internal/transport/）                │3. 提供流式模式、工具调用、MCP 集成、Hook 系统等高级能力；

│  └── SubprocessCLITransport → 子进程通信       │

└───────────────────────────────────────────────┘4. 自带完整的测试与工程化体系，作为正式 SDK 发布，而不是「demo 脚本」。如果你已经写过几次 LLM 应用，大概率遇到过这些情况：可以简单这么区分：

   ↓

Claude Code CLI（子进程）

   ↓

Claude API### 1.2 核心设计：通过子进程与 Claude Code CLI 通信

```



这意味着：

**这是理解这套 SDK 最关键的一点**：它并不是直接调用 Claude API，而是**通过子进程启动 Claude Code CLI，然后用一套自定义的「控制协议（Control Protocol）」进行双向通信**。- 直接 HTTP 调 Claude API，每次都要自己拼 JSON，**tools / messages / metadata 写多了非常痛苦**；| 场景 | 选择 |

- SDK 的核心工作是**管理与 CLI 子进程的双向通信**；

- 所有高级功能（工具调用、Hook、MCP）都通过**控制协议**在 SDK 和 CLI 之间流转；

- 你不需要自己处理 Claude API 的 HTTP 请求、认证、重试等细节。

架构层次如下：- 想玩工具调用 / MCP / 多轮 Agent，对话状态、工具结果拼接、流式增量解析一多，**业务代码迅速变成一坨状态机**；|------|------|

### 1.3 和 Claude Code 的关系与区别



很多人第一次看到这个 SDK 名字时，会下意识以为它是「给 Claude Code 编辑器用的 SDK」。其实更准确的说法是：

```text- 随着功能增多，你需要：| 想在 VS Code / Web IDE 里用 Claude 帮你写代码 | Claude Code 产品 |

- **Claude Agent SDK 是一个通用的 Agent / 工具 / MCP SDK**，用来在你自己的项目里构建智能体、工具调用、MCP 集成等能力；

- **Claude Code 则是一个具体的产品形态**（在编辑器里写/改代码），它内部当然也要调用 Claude 模型和一堆工具，但那是产品实现细节；用户代码

- **两者的关系**：Claude Agent SDK 通过子进程启动 Claude Code CLI 来工作，所以它们共享同一套底层协议和能力。

   ↓  - 明确的错误类型（区分鉴权、限流、超时、工具执行异常…）；| 想在自己的服务里做一个「用 Claude 作为大脑」的 Agent | Claude Agent SDK |

可以简单这么区分：

┌───────────────────────────────────────────────┐

| 场景 | 选择 |

|------|------|│  公共 API 层（claude_agent_sdk/）              │  - 比较好的流式接口（不要自己手撸 event parser）；| 想让 Claude 调用你的业务工具、MCP 工具 | Claude Agent SDK |

| 想在 VS Code / Web IDE 里用 Claude 帮你写代码 | Claude Code 产品 |

| 想在自己的服务里做一个「用 Claude 作为大脑」的 Agent | Claude Agent SDK |│  ├── query()       → 简单的一次性查询          │

| 想让 Claude 调用你的业务工具、MCP 工具 | Claude Agent SDK |

│  ├── ClaudeSDKClient → 双向交互式对话客户端     │  - 更清晰的测试、版本、发布流程。

### 1.4 本系列的节奏

│  └── types.py       → 所有类型定义              │

本系列会按这样的节奏来拆这套 SDK：

└───────────────────────────────────────────────┘换句话说：Claude Agent SDK 跟「Claude Code 背后用什么协议/接口」是同一个技术世界的东西，但这个 SDK 的**直接受众是你这个应用开发者**，而不是某个编辑器产品。

- 第 1 期：**整体架构 + 快速上手**（你正在看的这篇）

- 第 2 期：类型系统与公共 API 设计（`types.py`、`__init__.py`、错误体系）   ↓

- 第 3 期：Client & Query 的实现（`client.py` / `query.py` / `_internal/client.py`）

- 第 4 期：消息解析与流式输出（`_internal/message_parser.py`）┌───────────────────────────────────────────────┐`claude-agent-sdk-python` 想解决的，就是这些问题中的大头：

- 第 5 期：工具调用与 MCP 集成（MCP 示例 + 工具回调）

- 第 6 期：传输层与子进程 CLI（`transport/subprocess_cli.py`）│  内部实现层（_internal/）                       │

- 第 7 期：测试体系与版本管理（`tests/`、`e2e-tests/`、CI / 发布）

│  ├── InternalClient → 核心客户端实现           │---

---

│  ├── Query          → 控制协议 + 消息路由      │

## 二、项目结构鸟瞰：公共 API vs 内部实现

│  └── message_parser → 消息解析器              │1. 用一个清晰的 `ClaudeSDKClient` / `query()` 抽象，把「请求参数 + 工具 + 对话历史」统一收口；

本系列分析的是仓库里的 `claude-agent-sdk-python` 目录，大致结构如下：

└───────────────────────────────────────────────┘

```text

claude-agent-sdk-python/   ↓2. 用完善的类型（`types.py`）建模消息、工具、响应、错误等核心概念；## 二、项目结构鸟瞰：公共 API vs 内部实现速上手**（你正在看的这篇）

  pyproject.toml

  README.md┌───────────────────────────────────────────────┐

  CHANGELOG.md

  CLAUDE.md│  传输层（_internal/transport/）                │3. 提供流式模式、工具调用、MCP 集成、Hook 系统等高级能力；- 第 2 期：类型系统与公共 API 设计（`types.py`、`__init__.py`、错误体系）



  src/claude_agent_sdk/│  └── SubprocessCLITransport → 子进程通信       │

    __init__.py          # 对外暴露的主入口

    client.py            # ClaudeSDKClient 实现└───────────────────────────────────────────────┘4. 自带完整的测试与工程化体系，作为正式 SDK 发布，而不是「demo 脚本」。- 第 3 期：Client & Query 的实现（`client.py` / `query.py` / `_internal.client`）

    query.py             # query() 函数

    types.py             # 所有类型定义   ↓

    _errors.py           # 错误体系

    _version.py          # 版本信息Claude Code CLI（子进程）- 第 4 期：消息解析与流式输出（`_internal/message_parser.py`）

    py.typed

   ↓

    _internal/

      __init__.pyClaude API### 1.2 核心设计：通过子进程与 Claude Code CLI 通信- 第 5 期：工具调用与 MCP 集成（MCP 示例 + 工具回调）

      client.py          # InternalClient 实现

      query.py           # Query 类（控制协议核心）```

      message_parser.py  # 消息解析器

      transport/- 第 6 期：传输层与子进程 CLI（`transport/subprocess_cli.py`）

        __init__.py

        subprocess_cli.py # 子进程传输层这意味着：



  examples/**这是理解这套 SDK 最关键的一点**：它并不是直接调用 Claude API，而是**通过子进程启动 Claude Code CLI，然后用一套自定义的「控制协议（Control Protocol）」进行双向通信**。- 第 7 期：测试体系与版本管理（`tests/`、`e2e-tests/`、CI / 发布）

    quick_start.py       # 快速上手示例

    agents.py            # 多轮对话示例- SDK 的核心工作是**管理与 CLI 子进程的双向通信**；

    streaming_mode.py    # 流式输出示例

    mcp_calculator.py    # MCP 工具示例- 所有高级功能（工具调用、Hook、MCP）都通过**控制协议**在 SDK 和 CLI 之间流转；

    ...

- 你不需要自己处理 Claude API 的 HTTP 请求、认证、重试等细节。

  tests/

    test_client.py架构层次如下：这一篇先解决三个问题：

    test_types.py

    test_message_parser.py### 1.3 和 Claude Code 的关系与区别

    ...



  e2e-tests/

    test_agents_and_settings.py很多人第一次看到这个 SDK 名字时，会下意识以为它是「给 Claude Code 编辑器用的 SDK」。其实更准确的说法是：

    test_hooks.py

    ...```text1. 这套 SDK 的整体目录结构长什么样？

```

- **Claude Agent SDK 是一个通用的 Agent / 工具 / MCP SDK**，用来在你自己的项目里构建智能体、工具调用、MCP 集成等能力；

### 2.1 明确的「公共 API / 内部实现」分层

- **Claude Code 则是一个具体的产品形态**（在编辑器里写/改代码），它内部当然也要调用 Claude 模型和一堆工具，但那是产品实现细节；用户代码2. 它暴露给使用者的"主要入口"是什么？

- 顶层 `src/claude_agent_sdk/` 下的几个模块，构成**公共 API**：

  - `__init__.py`：决定 `import claude_agent_sdk` 能拿到什么；- **两者的关系**：Claude Agent SDK 通过子进程启动 Claude Code CLI 来工作，所以它们共享同一套底层协议和能力。

  - `client.py`：对外的 `ClaudeSDKClient` 类；

  - `query.py`：封装一次请求的 `query()` 函数；   ↓3. 我怎样在本地快速跑通一个最小示例？

  - `types.py`：消息、工具、响应、错误等核心类型；

  可以简单这么区分：

- `_internal/` 则是**内部实现细节**：

  - 这里是底层 client、query、message parser、传输层；┌───────────────────────────────────────────────┐

  - 对使用者来说是"不保证兼容"的区域；

  - 源码分析系列会重点钻到这里。| 场景 | 选择 |



### 2.2 示例与测试就是 "活的文档"|------|------|│  公共 API 层（claude_agent_sdk/）              │---



- `examples/` 目录提供了各种使用场景的示例；| 想在 VS Code / Web IDE 里用 Claude 帮你写代码 | Claude Code 产品 |

- `tests/` + `e2e-tests/` 从测试可以看出设计意图和边界 case。

| 想在自己的服务里做一个「用 Claude 作为大脑」的 Agent | Claude Agent SDK |│  ├── query()       → 简单的一次性查询          │

---

| 想让 Claude 调用你的业务工具、MCP 工具 | Claude Agent SDK |

## 三、两种使用模式：query() vs ClaudeSDKClient

│  ├── ClaudeSDKClient → 双向交互式对话客户端     │### 1.4 和 Claude Code 的关系与区别 SDK 的最小示例，再从项目结构和抽象设计上看清这套 Python SDK 在解决什么问题。'

SDK 提供了两种主要入口，分别面向不同使用场景：

### 1.4 本系列的节奏

### 3.1 `query()` 函数 —— 简单一次性查询

│  └── types.py       → 所有类型定义              │publishDate: '2025-12-05'

```python

async def query(本系列会按这样的节奏来拆这套 SDK：

    *,

    prompt: str | AsyncIterable[dict[str, Any]],└───────────────────────────────────────────────┘tags: ['源码分析', 'claude', 'sdk', 'python', 'agent']

    options: ClaudeAgentOptions | None = None,

    transport: Transport | None = None,- 第 1 期：**整体架构 + 快速上手**（你正在看的这篇）

) -> AsyncIterator[Message]:

```- 第 2 期：类型系统与公共 API 设计（`types.py`、`__init__.py`、错误体系）   ↓language: 'zh-CN'



**特点**：- 第 3 期：Client & Query 的实现（`client.py` / `query.py` / `_internal.client`）

- **单向的、无状态的查询**

- 适合「Fire-and-Forget」场景：一次性问答、批处理、脚本自动化- 第 4 期：消息解析与流式输出（`_internal/message_parser.py`）┌───────────────────────────────────────────────┐---

- 内部会自动创建 `InternalClient`，调用完就销毁

- 第 5 期：工具调用与 MCP 集成（MCP 示例 + 工具回调）

**典型用法**：

- 第 6 期：传输层与子进程 CLI（`transport/subprocess_cli.py`）│  内部实现层（_internal/）                       │

```python

from claude_agent_sdk import query- 第 7 期：测试体系与版本管理（`tests/`、`e2e-tests/`、CI / 发布）



async for message in query(prompt="What is 2+2?"):│  ├── InternalClient → 核心客户端实现           │> 这一篇是 Claude Agent SDK 源码分析系列的开篇：先不急着钻函数细节，而是**跑通最小示例 + 读懂项目结构 + 理解它到底在解决什么问题**。后面几篇再一点点下潜到类型系统、内部 Client、消息解析、MCP 工具等实现细节。

    print(message)

```---



**适用场景**：│  ├── Query          → 控制协议 + 消息路由      │

- 简单一次性问题（"2+2 等于几？"）

- 批量处理独立的 prompts## 二、项目结构鸟瞰：公共 API vs 内部实现

- 代码生成或分析任务

- 自动化脚本和 CI/CD 流水线│  └── message_parser → 消息解析器              │## 一、为啥要关心 Claude Agent SDK？



### 3.2 `ClaudeSDKClient` 类 —— 双向交互式对话本系列分析的是仓库里的 `claude-agent-sdk-python` 目录，大致结构如下：



```python└───────────────────────────────────────────────┘

class ClaudeSDKClient:

    async def connect(self, prompt: str | AsyncIterable[dict] | None = None)```text

    async def send_user_message(self, content: str | list, parent_tool_use_id: str | None = None)

    async def messages(self) -> AsyncIterator[Message]claude-agent-sdk-python/   ↓### 1.1 它到底在解决什么问题？

    async def disconnect()

```  pyproject.toml



**特点**：  README.md┌───────────────────────────────────────────────┐

- **双向、有状态的对话客户端**

- 支持中断、追问、动态发送消息  CHANGELOG.md

- 维护对话上下文

  CLAUDE.md│  传输层（_internal/transport/）                │如果你已经写过几次 LLM 应用，大概率遇到过这些情况：

**典型用法**：



```python

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions  src/claude_agent_sdk/│  └── SubprocessCLITransport → 子进程通信       │



client = ClaudeSDKClient(options=ClaudeAgentOptions(...))    __init__.py          # 对外暴露的主入口

await client.connect("Hello!")

    client.py            # ClaudeSDKClient 实现└───────────────────────────────────────────────┘- 直接 HTTP 调 Claude API，每次都要自己拼 JSON，**tools / messages / metadata 写多了非常痛苦**；

async for msg in client.messages():

    print(msg)    query.py             # query() 函数

    if need_followup:

        await client.send_user_message("Tell me more")    types.py             # 所有类型定义   ↓- 想玩工具调用 / MCP / 多轮 Agent，对话状态、工具结果拼接、流式增量解析一多，**业务代码迅速变成一坨状态机**；



await client.disconnect()    _errors.py           # 错误体系

```

    _version.py          # 版本信息Claude Code CLI（子进程）- 随着功能增多，你需要：

**适用场景**：

- 构建聊天界面或对话式 UI    py.typed

- 交互式调试或探索会话

- 需要根据响应发送后续消息   ↓  - 明确的错误类型（区分鉴权、限流、超时、工具执行异常…）；

- 需要中断能力的场景

    _internal/

### 3.3 两种模式的对比

      __init__.pyClaude API  - 比较好的流式接口（不要自己手撸 event parser）；

| 特性 | `query()` | `ClaudeSDKClient` |

|------|-----------|-------------------|      client.py          # InternalClient 实现

| 通信方向 | 单向 | 双向 |

| 状态管理 | 无状态 | 有状态 |      query.py           # Query 类（控制协议核心）```  - 更清晰的测试、版本、发布流程。

| 复杂度 | 简单 | 较复杂 |

| 中断支持 | ❌ | ✅ |      message_parser.py  # 消息解析器

| 追问能力 | ❌ | ✅ |

| 适用场景 | 自动化、批处理 | 交互式应用 |      transport/



---        __init__.py



## 四、核心类型系统（types.py）        subprocess_cli.py # 子进程传输层这意味着：`claude-agent-sdk-python` 想解决的，就是这些问题中的大头：



`src/claude_agent_sdk/types.py` 是整个 SDK 的「词汇表」，定义了所有数据结构。



### 4.1 消息类型  examples/



```python    quick_start.py       # 快速上手示例

@dataclass

class UserMessage:    agents.py            # 多轮对话示例- SDK 的核心工作是**管理与 CLI 子进程的双向通信**；1. 用一个清晰的 `ClaudeSDKClient` / `query()` 抽象，把「请求参数 + 工具 + 对话历史」统一收口；

    """用户消息"""

    content: str | list[ContentBlock]    streaming_mode.py    # 流式输出示例

    parent_tool_use_id: str | None = None

    mcp_calculator.py    # MCP 工具示例- 所有高级功能（工具调用、Hook、MCP）都通过**控制协议**在 SDK 和 CLI 之间流转；2. 用完善的类型（`types.py`）建模消息、工具、响应、错误等核心概念；

@dataclass

class AssistantMessage:    ...

    """助手消息，包含内容块"""

    content: list[ContentBlock]- 你不需要自己处理 Claude API 的 HTTP 请求、认证、重试等细节。3. 提供流式模式、工具调用、MCP 集成、Hook 系统等高级能力；

    model: str

    parent_tool_use_id: str | None = None  tests/

    error: AssistantMessageError | None = None

    test_client.py4. 自带完整的测试与工程化体系，作为正式 SDK 发布，而不是「demo 脚本」。

@dataclass

class SystemMessage:    test_types.py

    """系统消息，包含元数据"""

    subtype: str    test_message_parser.py### 1.3 和 Claude Code 的关系与区别

    data: dict[str, Any]

    ...

@dataclass

class ResultMessage:### 1.2 核心设计：通过子进程与 Claude Code CLI 通信

    """结果消息，包含费用和使用信息"""

    subtype: str  e2e-tests/

    duration_ms: int

    duration_api_ms: int    test_agents_and_settings.py很多人第一次看到这个 SDK 名字时，会下意识以为它是「给 Claude Code 编辑器用的 SDK」。其实更准确的说法是：

    is_error: bool

    num_turns: int    test_hooks.py

    session_id: str

    total_cost_usd: float | None = None    ...**这是理解这套 SDK 最关键的一点**：它并不是直接调用 Claude API，而是**通过子进程启动 Claude Code CLI，然后用一套自定义的「控制协议（Control Protocol）」进行双向通信**。

    usage: dict[str, Any] | None = None

```

# 消息联合类型

Message = UserMessage | AssistantMessage | SystemMessage | ResultMessage | StreamEvent- **Claude Agent SDK 是一个通用的 Agent / 工具 / MCP SDK**，用来在你自己的项目里构建智能体、工具调用、MCP 集成等能力；

```

### 2.1 明确的「公共 API / 内部实现」分层

### 4.2 内容块类型

- **Claude Code 则是一个具体的产品形态**（在编辑器里写/改代码），它内部当然也要调用 Claude 模型和一堆工具，但那是产品实现细节；架构层次如下：

```python

@dataclass- 顶层 `src/claude_agent_sdk/` 下的几个模块，构成**公共 API**：

class TextBlock:

    """文本内容块"""  - `__init__.py`：决定 `import claude_agent_sdk` 能拿到什么；- **两者的关系**：Claude Agent SDK 通过子进程启动 Claude Code CLI 来工作，所以它们共享同一套底层协议和能力。

    text: str

  - `client.py`：对外的 `ClaudeSDKClient` 类；

@dataclass

class ThinkingBlock:  - `query.py`：封装一次请求的 `query()` 函数；```text

    """思考内容块（Claude 的推理过程）"""

    thinking: str  - `types.py`：消息、工具、响应、错误等核心类型；

    signature: str

  可以简单这么区分：用户代码

@dataclass

class ToolUseBlock:- `_internal/` 则是**内部实现细节**：

    """工具调用块"""

    id: str  - 这里是底层 client、query、message parser、传输层；   ↓

    name: str

    input: dict[str, Any]  - 对使用者来说是"不保证兼容"的区域；



@dataclass  - 源码分析系列会重点钻到这里。| 场景 | 选择 |┌───────────────────────────────────────────────┐

class ToolResultBlock:

    """工具结果块"""

    tool_use_id: str

    content: str | list[dict] | None = None### 2.2 示例与测试就是 "活的文档"|------|------|│  公共 API 层（claude_agent_sdk/）              │

    is_error: bool | None = None



ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

```- `examples/` 目录提供了各种使用场景的示例；| 想在 VS Code / Web IDE 里用 Claude 帮你写代码 | Claude Code 产品 |│  ├── query()       → 简单的一次性查询          │



### 4.3 配置选项（ClaudeAgentOptions）- `tests/` + `e2e-tests/` 从测试可以看出设计意图和边界 case。



这是 SDK 最重要的配置类，字段非常丰富：| 想在自己的服务里做一个「用 Claude 作为大脑」的 Agent | Claude Agent SDK |│  ├── ClaudeSDKClient → 双向交互式对话客户端     │



```python---

@dataclass

class ClaudeAgentOptions:| 想让 Claude 调用你的业务工具、MCP 工具 | Claude Agent SDK |│  └── types.py       → 所有类型定义              │

    # 工具相关

    tools: list[str] | ToolsPreset | None = None## 三、两种使用模式：query() vs ClaudeSDKClient

    allowed_tools: list[str] = field(default_factory=list)

    disallowed_tools: list[str] = field(default_factory=list)└───────────────────────────────────────────────┘

    

    # 提示词SDK 提供了两种主要入口，分别面向不同使用场景：

    system_prompt: str | SystemPromptPreset | None = None

    ### 1.4 本系列的节奏   ↓

    # MCP 服务器

    mcp_servers: dict[str, McpServerConfig] | str | Path = field(default_factory=dict)### 3.1 `query()` 函数 —— 简单一次性查询

    

    # 权限与安全┌───────────────────────────────────────────────┐

    permission_mode: PermissionMode | None = None

    can_use_tool: CanUseTool | None = None```python

    sandbox: SandboxSettings | None = None

    async def query(本系列会按这样的节奏来拆这套 SDK：│  内部实现层（_internal/）                       │

    # 模型配置

    model: str | None = None    *,

    fallback_model: str | None = None

    max_turns: int | None = None    prompt: str | AsyncIterable[dict[str, Any]],│  ├── InternalClient → 核心客户端实现           │

    max_budget_usd: float | None = None

        options: ClaudeAgentOptions | None = None,

    # Hook 系统

    hooks: dict[HookEvent, list[HookMatcher]] | None = None    transport: Transport | None = None,- 第 1 期：**整体架构 + 快速上手**（你正在看的这篇）│  ├── Query          → 控制协议 + 消息路由      │

    

    # 高级选项) -> AsyncIterator[Message]:

    cwd: str | Path | None = None

    cli_path: str | Path | None = None```- 第 2 期：类型系统与公共 API 设计（`types.py`、`__init__.py`、错误体系）│  └── message_parser → 消息解析器              │

    include_partial_messages: bool = False

    agents: dict[str, AgentDefinition] | None = None

    output_format: dict[str, Any] | None = None  # 结构化输出

    ...**特点**：- 第 3 期：Client & Query 的实现（`client.py` / `query.py` / `_internal.client`）└───────────────────────────────────────────────┘

```

- **单向的、无状态的查询**

---

- 适合「Fire-and-Forget」场景：一次性问答、批处理、脚本自动化- 第 4 期：消息解析与流式输出（`_internal/message_parser.py`）   ↓

## 五、控制协议（Control Protocol）

- 内部会自动创建 `InternalClient`，调用完就销毁

这是 SDK 最核心的设计之一：SDK 和 CLI 之间不是简单的「发请求 → 收响应」，而是一个**双向的控制协议**。

- 第 5 期：工具调用与 MCP 集成（MCP 示例 + 工具回调）┌───────────────────────────────────────────────┐

### 5.1 协议消息类型

**典型用法**：

```python

# SDK → CLI 的控制请求- 第 6 期：传输层与子进程 CLI（`transport/subprocess_cli.py`）│  传输层（_internal/transport/）                │

class SDKControlRequest(TypedDict):

    type: Literal["control_request"]```python

    request_id: str

    request: (from claude_agent_sdk import query- 第 7 期：测试体系与版本管理（`tests/`、`e2e-tests/`、CI / 发布）│  └── SubprocessCLITransport → 子进程通信       │

        SDKControlInterruptRequest      # 中断

        | SDKControlPermissionRequest   # 工具权限请求

        | SDKControlInitializeRequest   # 初始化

        | SDKHookCallbackRequest        # Hook 回调async for message in query(prompt="What is 2+2?"):└───────────────────────────────────────────────┘

        | SDKControlMcpMessageRequest   # MCP 消息

    )    print(message)



# CLI → SDK 的控制响应```---   ↓

class SDKControlResponse(TypedDict):

    type: Literal["control_response"]

    response: ControlResponse | ControlErrorResponse

```**适用场景**：Claude Code CLI（子进程）



### 5.2 Query 类 —— 协议的核心实现- 简单一次性问题（"2+2 等于几？"）



`_internal/query.py` 中的 `Query` 类是整个控制协议的核心，主要职责：- 批量处理独立的 prompts## 二、项目结构鸟瞰：公共 API vs 内部实现   ↓



1. **消息路由**：从 transport 读取消息，区分普通消息和控制消息- 代码生成或分析任务

2. **控制请求处理**：

   - `can_use_tool` → 调用用户提供的权限回调- 自动化脚本和 CI/CD 流水线Claude API

   - `hook_callback` → 调用注册的 hook 函数

   - `mcp_message` → 路由到 SDK MCP 服务器

3. **状态管理**：维护 pending requests、hook callbacks 等状态

### 3.2 `ClaudeSDKClient` 类 —— 双向交互式对话本系列分析的是仓库里的 `claude-agent-sdk-python` 目录，大致结构如下：```

```python

class Query:

    async def initialize(self) -> dict | None:

        """初始化控制协议，注册 hooks"""```python



    async def _read_messages(self):class ClaudeSDKClient:

        """从 transport 读取消息并路由"""

    async def connect(self, prompt: str | AsyncIterable[dict] | None = None)```text这意味着：

    async def _handle_control_request(self, request):

        """处理 CLI 发来的控制请求"""    async def send_user_message(self, content: str | list, parent_tool_use_id: str | None = None)

```

    async def messages(self) -> AsyncIterator[Message]claude-agent-sdk-python/

---

    async def disconnect()

## 六、MCP 工具集成

```  pyproject.toml- SDK 的核心工作是**管理与 CLI 子进程的双向通信**；

SDK 提供了两种 MCP 服务器接入方式：



### 6.1 外部 MCP 服务器

**特点**：  README.md- 所有高级功能（工具调用、Hook、MCP）都通过**控制协议**在 SDK 和 CLI 之间流转；

```python

options = ClaudeAgentOptions(- **双向、有状态的对话客户端**

    mcp_servers={

        "my_server": {- 支持中断、追问、动态发送消息  CHANGELOG.md- 你不需要自己处理 Claude API 的 HTTP 请求、认证、重试等细节。

            "type": "stdio",

            "command": "python",- 维护对话上下文

            "args": ["my_mcp_server.py"],

        }  CLAUDE.md

    }

)**典型用法**：

```

### 1.3 本系列的节奏

### 6.2 SDK 内置 MCP 服务器（亮点！）

```python

SDK 允许你在 Python 进程内定义 MCP 工具，无需启动独立进程：

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions  src/claude_agent_sdk/

```python

from claude_agent_sdk import tool, create_sdk_mcp_server



@tool("add", "Add two numbers", {"a": float, "b": float})client = ClaudeSDKClient(options=ClaudeAgentOptions(...))    __init__.py          # 对外暴露的主入口- 第 1 期：**整体架构 + 快速上手**（你正在看的这篇）

async def add(args):

    return {"content": [{"type": "text", "text": f"Result: {args['a'] + args['b']}"}]}await client.connect("Hello!")



@tool("multiply", "Multiply two numbers", {"a": float, "b": float})    client.py            # ClaudeSDKClient 实现- 第 2 期：类型系统与公共 API 设计（`types.py`、`__init__.py`、错误体系）

async def multiply(args):

    return {"content": [{"type": "text", "text": f"Result: {args['a'] * args['b']}"}]}async for msg in client.messages():



# 创建服务器    print(msg)    query.py             # query() 函数- 第 3 期：Client & Query 的实现（`client.py` / `query.py` / `_internal.client`）

calculator = create_sdk_mcp_server("calculator", tools=[add, multiply])

    if need_followup:

# 使用

options = ClaudeAgentOptions(        await client.send_user_message("Tell me more")    types.py             # 所有类型定义- 第 4 期：消息解析与流式输出（`_internal/message_parser.py`）

    mcp_servers={"calc": calculator},

    allowed_tools=["add", "multiply"],

)

```await client.disconnect()    _errors.py           # 错误体系- 第 5 期：工具调用与 MCP 集成（MCP 示例 + 工具回调）



**优势**：```

- 更好的性能（无 IPC 开销）

- 更简单的部署（单进程）    _version.py          # 版本信息- 第 6 期：传输层与子进程 CLI（`transport/subprocess_cli.py`）

- 更容易调试（同一进程）

- 可以直接访问应用状态**适用场景**：



---- 构建聊天界面或对话式 UI    py.typed- 第 7 期：测试体系与版本管理（`tests/`、`e2e-tests/`、CI / 发布）



## 七、Hook 系统- 交互式调试或探索会话



SDK 支持在关键节点注册 Hook，拦截或修改行为：- 需要根据响应发送后续消息



### 7.1 支持的 Hook 事件- 需要中断能力的场景



```python    _internal/这一篇先解决三个问题：

HookEvent = Literal[

    "PreToolUse",       # 工具调用前### 3.3 两种模式的对比

    "PostToolUse",      # 工具调用后

    "UserPromptSubmit", # 用户提交 prompt 前      __init__.py

    "Stop",             # 停止时

    "SubagentStop",     # 子 Agent 停止时| 特性 | `query()` | `ClaudeSDKClient` |

    "PreCompact",       # 压缩上下文前

]|------|-----------|-------------------|      client.py          # InternalClient 实现1. 这套 SDK 的整体目录结构长什么样？

```

| 通信方向 | 单向 | 双向 |

### 7.2 Hook 配置

| 状态管理 | 无状态 | 有状态 |      query.py           # Query 类（控制协议核心）2. 它暴露给使用者的“主要入口”是什么？

```python

@dataclass| 复杂度 | 简单 | 较复杂 |

class HookMatcher:

    matcher: str | None = None    # 匹配规则，如 "Bash" 或 "Write|Edit"| 中断支持 | ❌ | ✅ |      message_parser.py  # 消息解析器3. 我怎样在本地快速跑通一个最小示例？

    hooks: list[HookCallback] = field(default_factory=list)

    timeout: float | None = None| 追问能力 | ❌ | ✅ |

```

| 适用场景 | 自动化、批处理 | 交互式应用 |      transport/

### 7.3 使用场景



- **PreToolUse**：拦截危险工具调用、修改工具输入

- **PostToolUse**：记录工具执行日志、处理工具结果---        __init__.py---

- **UserPromptSubmit**：过滤敏感 prompt、添加上下文



---

## 四、核心类型系统（types.py）        subprocess_cli.py # 子进程传输层

## 八、错误体系



```python

class ClaudeSDKError(Exception): pass`src/claude_agent_sdk/types.py` 是整个 SDK 的「词汇表」，定义了所有数据结构。### 和 Claude Code 的关系与区别

class CLINotFoundError(ClaudeSDKError): pass   # CLI 找不到

class CLIConnectionError(ClaudeSDKError): pass # 连接失败

class CLIJSONDecodeError(ClaudeSDKError): pass # JSON 解析失败

class ProcessError(ClaudeSDKError): pass       # 进程错误### 4.1 消息类型  examples/

class MessageParseError(ClaudeSDKError): pass  # 消息解析失败

```



---```python    quick_start.py       # 快速上手示例很多人第一次看到这个 SDK 名字时，会下意识以为它是「给 Claude Code 编辑器用的 SDK」。其实更准确的说法是：



## 九、快速上手示例@dataclass



### 9.1 安装class UserMessage:    agents.py            # 多轮对话示例



```bash    """用户消息"""

pip install claude-agent-sdk

```    content: str | list[ContentBlock]    streaming_mode.py    # 流式输出示例- Claude Agent SDK 是一个**通用的 Agent / 工具 / MCP SDK**，用来在你自己的项目里构建智能体、工具调用、MCP 集成等能力；



或从源码安装：    parent_tool_use_id: str | None = None



```bash    mcp_calculator.py    # MCP 工具示例- Claude Code 则是一个具体的产品形态（在编辑器里写/改代码），它内部当然也要调用 Claude 模型和一堆工具，但那是**产品实现细节**。

cd claude-agent-sdk-python

python -m venv .venv@dataclass

source .venv/bin/activate

pip install -e .class AssistantMessage:    ...

```

    """助手消息，包含内容块"""

### 9.2 最简单的查询

    content: list[ContentBlock]可以简单这么区分：

```python

import asyncio    model: str

from claude_agent_sdk import query

    parent_tool_use_id: str | None = None  tests/

async def main():

    async for message in query(prompt="用一句话解释什么是 Claude Agent SDK"):    error: AssistantMessageError | None = None

        print(message)

    test_client.py- 如果你只是想在 VS Code / Web IDE 里用 Claude 帮你写代码，那是 Claude Code 的职责；

asyncio.run(main())

```@dataclass



### 9.3 带配置的查询class SystemMessage:    test_types.py- 如果你想在自己的服务里做一个「用 Claude 作为大脑」的 Agent，或者让 Claude 调你的业务工具、MCP 工具，那就轮到 Claude Agent SDK 登场了。



```python    """系统消息，包含元数据"""

import asyncio

from claude_agent_sdk import query, ClaudeAgentOptions    subtype: str    test_message_parser.py



async def main():    data: dict[str, Any]

    options = ClaudeAgentOptions(

        system_prompt="你是一名专业的 Python 开发者",    ...换句话说：Claude Agent SDK 跟「Claude Code 背后用什么协议/接口」是同一个技术世界的东西，但这个 SDK 的**直接受众是你这个应用开发者**，而不是某个编辑器产品。

        model="claude-3-5-sonnet-latest",

        max_turns=5,@dataclass

    )

    class ResultMessage:

    async for message in query(

        prompt="写一个快速排序的 Python 实现",    """结果消息，包含费用和使用信息"""

        options=options

    ):    subtype: str  e2e-tests/---

        print(message)

    duration_ms: int

asyncio.run(main())

```    duration_api_ms: int    test_agents_and_settings.py



---    is_error: bool



## 十、关键设计亮点总结    num_turns: int    test_hooks.py## 二、项目结构鸟瞰：公共 API vs 内部实现



1. **分层清晰**：公共 API / 内部实现 / 传输层 三层分离，`_internal` 前缀明确标识内部模块    session_id: str

2. **双向控制协议**：不是简单的 RPC，而是双向的消息流 + 控制请求/响应机制

3. **SDK MCP 服务器**：支持在 Python 进程内定义工具，零 IPC 开销    total_cost_usd: float | None = None    ...

4. **Hook 系统**：可在关键节点拦截和修改行为

5. **类型安全**：大量使用 `dataclass`、`TypedDict`、`Literal`，IDE 补全友好    usage: dict[str, Any] | None = None

6. **anyio 异步**：底层使用 anyio，支持 asyncio/trio 两种运行时

```本系列分析的是仓库里的 `claude-agent-sdk-python` 目录，大致结构如下（去掉了一些次要文件）：

---

# 消息联合类型

## 十一、总结与下期预告

Message = UserMessage | AssistantMessage | SystemMessage | ResultMessage | StreamEvent

这一篇我们做了这些事：

```

1. **从架构角度**说明了：SDK 是如何通过子进程与 Claude Code CLI 通信的

2. **从 API 角度**介绍了：两种使用模式（`query()` vs `ClaudeSDKClient`）### 2.1 明确的「公共 API / 内部实现」分层```text

3. **从类型角度**梳理了：核心类型系统（Message、ContentBlock、ClaudeAgentOptions）

4. **从协议角度**解释了：控制协议的设计和 Query 类的作用### 4.2 内容块类型

5. **从实践角度**展示了：MCP 工具集成、Hook 系统、错误体系

claude-agent-sdk-python/

> 如果你现在已经把示例在本地跑通，非常建议顺手打开：

>```python

> - `src/claude_agent_sdk/types.py`

> - `src/claude_agent_sdk/_internal/query.py`@dataclass- 顶层 `src/claude_agent_sdk/` 下的几个模块，构成**公共 API**：  pyproject.toml

> - `tests/test_types.py`

>class TextBlock:

> 粗略扫一眼字段和测试用例，下一篇你会读得更快。

    """文本内容块"""  - `__init__.py`：决定 `import claude_agent_sdk` 能拿到什么；  README.md

在**下一期**中，我们会深入 `types.py` 的源码，看看：

    text: str

- 每个类型是如何设计的，为什么这样设计

- 类型之间的关系和层次  - `client.py`：对外的 `ClaudeSDKClient` 类；  CHANGELOG.md

- 从测试用例反推设计意图

@dataclass

class ThinkingBlock:  - `query.py`：封装一次请求的 `query()` 函数；  CLAUDE.md

    """思考内容块（Claude 的推理过程）"""

    thinking: str  - `types.py`：消息、工具、响应、错误等核心类型；

    signature: str

    src/claude_agent_sdk/

@dataclass

class ToolUseBlock:- `_internal/` 则是**内部实现细节**：    __init__.py

    """工具调用块"""

    id: str  - 这里是底层 client、query、message parser、传输层；    client.py

    name: str

    input: dict[str, Any]  - 对使用者来说是"不保证兼容"的区域；    query.py



@dataclass  - 源码分析系列会重点钻到这里。    types.py

class ToolResultBlock:

    """工具结果块"""    _errors.py

    tool_use_id: str

    content: str | list[dict] | None = None### 2.2 示例与测试就是 "活的文档"    _version.py

    is_error: bool | None = None

    _cli_version.py

ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

```- `examples/` 目录提供了各种使用场景的示例；    py.typed



### 4.3 配置选项（ClaudeAgentOptions）- `tests/` + `e2e-tests/` 从测试可以看出设计意图和边界 case。



这是 SDK 最重要的配置类，字段非常丰富：    _bundled/



```python---      .gitignore

@dataclass

class ClaudeAgentOptions:

    # 工具相关

    tools: list[str] | ToolsPreset | None = None## 三、两种使用模式：query() vs ClaudeSDKClient    _internal/

    allowed_tools: list[str] = field(default_factory=list)

    disallowed_tools: list[str] = field(default_factory=list)      __init__.py

    

    # 提示词SDK 提供了两种主要入口，分别面向不同使用场景：      client.py

    system_prompt: str | SystemPromptPreset | None = None

          query.py

    # MCP 服务器

    mcp_servers: dict[str, McpServerConfig] | str | Path = field(default_factory(dict)### 3.1 `query()` 函数 —— 简单一次性查询      message_parser.py

```}
      transport/

```python        __init__.py

async def query(        subprocess_cli.py

    *,

    prompt: str | AsyncIterable[dict[str, Any]],  examples/

    options: ClaudeAgentOptions | None = None,    quick_start.py

    transport: Transport | None = None,    agents.py

) -> AsyncIterator[Message]:    tools_option.py

```    mcp_calculator.py

    plugin_example.py

**特点**：    ...

- **单向的、无状态的查询**    plugins/

- 适合「Fire-and-Forget」场景：一次性问答、批处理、脚本自动化      demo-plugin/

- 内部会自动创建 `InternalClient`，调用完就销毁        .claude-plugin/plugin.json

        commands/greet.md

**典型用法**：

  tests/

```python    test_client.py

from claude_agent_sdk import query    test_types.py

    test_message_parser.py

async for message in query(prompt="What is 2+2?"):    test_streaming_client.py

    print(message)    test_sdk_mcp_integration.py

```    test_subprocess_buffering.py

    ...

**适用场景**：

- 简单一次性问题（"2+2 等于几？"）  e2e-tests/

- 批量处理独立的 prompts    test_agents_and_settings.py

- 代码生成或分析任务    test_dynamic_control.py

- 自动化脚本和 CI/CD 流水线    test_hooks.py

    ...

### 3.2 `ClaudeSDKClient` 类 —— 双向交互式对话```



```python从这个结构基本可以看出几件关键事：

class ClaudeSDKClient:

    async def connect(self, prompt: str | AsyncIterable[dict] | None = None)### 2.1 明确的「公共 API / 内部实现」分层

    async def send_user_message(self, content: str | list, parent_tool_use_id: str | None = None)

    async def messages(self) -> AsyncIterator[Message]- 顶层 `src/claude_agent_sdk/` 下的几个模块，构成公共 API：

    async def disconnect()  - `__init__.py`：决定 `import claude_agent_sdk` 能拿到什么；

```  - `client.py`：对外的 `Client` 对象；

  - `query.py`：封装一次请求的高层接口；

**特点**：  - `types.py`：消息、工具、响应、错误等核心类型；

- **双向、有状态的对话客户端**  - `_errors.py` / `_version.py`：错误体系与版本信息；

- 支持中断、追问、动态发送消息- `_internal/` 则刻意加了前缀，下划线意味着：

- 维护对话上下文  - 这里是**内部实现细节**：底层 client、query、message parser、传输层；

  - 对使用者来说是“不保证兼容”的区域，之后系列会从这里挖实现细节。

**典型用法**：

这类命名约定很好地传达出一个信号：**作为 SDK 使用者，你大概率只需要 import 顶层符号；作为源码读者，我们后续几篇会故意钻到 `_internal/` 里看各种状态机。**

```python

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions### 2.2 示例与测试就是 “活的文档”



client = ClaudeSDKClient(options=ClaudeAgentOptions(...))- `examples/` 目录：

await client.connect("Hello!")  - `quick_start.py`：官方预期的「第一个例子」；

  - `agents.py`：多轮对话 / Agent 使用；

async for msg in client.messages():  - `mcp_calculator.py`、`plugins/demo-plugin/`：MCP 工具与插件体系；

    print(msg)  - `streaming_mode.py` 等：流式输出示例；

    if need_followup:- `tests/` + `e2e-tests/`：

        await client.send_user_message("Tell me more")  - `test_types.py`：从测试可以看出类型系统设计的意图；

  - `test_message_parser.py`：告诉你流式解析要处理哪些边界 case；

await client.disconnect()  - `test_sdk_mcp_integration.py`：MCP 集成预期的行为；

```  - `test_subprocess_buffering.py`、`test_transport.py`：传输层的一些坑。



**适用场景**：这也决定了系列文章的写法：**不是从某个函数的实现开始，而是从 “示例 / 测试 → 公共 API → 内部实现” 反推设计。**

- 构建聊天界面或对话式 UI

- 交互式调试或探索会话---

- 需要根据响应发送后续消息

- 需要中断能力的场景## 三、核心概念：Client、Query、Message、Tool



### 3.3 两种模式的对比在真正看代码之前，先用自然语言给后面所有分析做个“词汇表”。Claude Agent SDK 把 LLM 调用里的几个核心概念拆成了相对清晰的抽象。



| 特性 | `query()` | `ClaudeSDKClient` |### 3.1 Client：你和 Claude 通信的门面

|------|-----------|-------------------|

| 通信方向 | 单向 | 双向 |`Client` 是你业务代码里最常见的类，主要职责是：

| 状态管理 | 无状态 | 有状态 |

| 复杂度 | 简单 | 较复杂 |- 持有连接配置：

| 中断支持 | ❌ | ✅ |  - API key / 组织、base URL、模型名、超时、重试策略等；

| 追问能力 | ❌ | ✅ |- 暴露对外 API：

| 适用场景 | 自动化、批处理 | 交互式应用 |  - 比如 `client.query(...)`、`client.stream_query(...)` 之类；

- 把高层参数（messages / tools / metadata …）转交给 `_internal.client` / `_internal.query` 做真正的请求和流式处理。

---

在仓库里，它位于：

## 四、核心类型系统（types.py）

- 公共入口：`src/claude_agent_sdk/client.py`

`src/claude_agent_sdk/types.py` 是整个 SDK 的「词汇表」，定义了所有数据结构。- 内部实现：`src/claude_agent_sdk/_internal/client.py`



### 4.1 消息类型在业务代码中，你会看到类似这样的用法（下面是一个伪示例，真实签名以后几期会细讲）：



```python```python

@dataclassfrom claude_agent_sdk import Client

class UserMessage:

    """用户消息"""client = Client(

    content: str | list[ContentBlock]    api_key="YOUR_API_KEY",

    parent_tool_use_id: str | None = None    model="claude-3-5-sonnet-latest",

)

@dataclass

class AssistantMessage:resp = client.query(

    """助手消息，包含内容块"""    messages=[

    content: list[ContentBlock]        {"role": "user", "content": "帮我写一个 3 行的 Python 打招呼脚本"},

    model: str    ],

    parent_tool_use_id: str | None = None)

    error: AssistantMessageError | None = Noneprint(resp.content)

```

@dataclass

class SystemMessage:第 3 期我们会专门分析 `Client` 的实现细节，这一篇只需要记住：**所有高级能力最终都是从 `Client` 这个门面出发的。**

    """系统消息，包含元数据"""

    subtype: str### 3.2 Query：一次「调用会话」的封装

    data: dict[str, Any]

`query` 这个名字在 SDK 里通常有两个层面的含义：

@dataclass

class ResultMessage:1. 对外 API 层面的一个方法 / 函数：你可以直接调用 `client.query(...)`；

    """结果消息，包含费用和使用信息"""2. 内部实现中的一个“Query 对象”：封装了一次调用的全部上下文。

    subtype: str

    duration_ms: int它的主要职责包括：

    duration_api_ms: int

    is_error: bool- 收到用户传入的：

    num_turns: int  - system / user / assistant / tool 等消息列表；

    session_id: str  - 工具列表（tool schema、回调）；

    total_cost_usd: float | None = None  - 采样参数（temperature、max_tokens 等）；

    usage: dict[str, Any] | None = None- 做校验与默认值填充；

- 配置流式 / 非流式调用；

# 消息联合类型- 把这些信息交给底层传输层 + message parser，最后返回一个高层 Response / streaming 对象。

Message = UserMessage | AssistantMessage | SystemMessage | ResultMessage | StreamEvent

```第 3～4 期会专门讨论：**Query 层是如何把“业务友好的参数形式”转成 Claude API 所需的 payload，并配合 `message_parser` 做增量解析的。**



### 4.2 内容块类型### 3.3 types：Message / Tool / Response 的「骨架」



```python`src/claude_agent_sdk/types.py` 里定义了大量类型，用来描述：

@dataclass

class TextBlock:- 消息：

    """文本内容块"""  - 角色（system / user / assistant / tool / observation …）；

    text: str  - 内容：纯文本、富文本、多段混合、工具结果等；

- 工具：

@dataclass  - 名称、描述、参数 JSON Schema；

class ThinkingBlock:  - 权限、超时、是否允许并发、是否为 MCP 工具等；

    """思考内容块（Claude 的推理过程）"""- 响应：

    thinking: str  - 完整响应 vs 流式增量；

    signature: str  - 工具调用的结构化结果；

  - 错误载体（例如 `error.type` / `error.message` 等）。

@dataclass

class ToolUseBlock:这样做的直接收益：

    """工具调用块"""

    id: str- IDE 能提供很强的补全和类型检查；

    name: str- 测试用例可以对请求 / 响应结构做结构级断言，而不是全靠字符串对比；

    input: dict[str, Any]- 内部的 `Client` / `message_parser` / transport 之间有一个共同的“数据语言”。



@dataclass本期我们不展开这些类型定义，只需要知道：**后续所有实现分析，几乎都会围绕 `types.py` 的这些概念展开。**

class ToolResultBlock:

    """工具结果块"""---

    tool_use_id: str

    content: str | list[dict] | None = None## 四、快速上手：在本地跑一个最小示例

    is_error: bool | None = None

下面用一节的篇幅，带你真正“跑起来”一段最小代码，建立使用体验。真实 SDK 的 API 细节可以对照仓库里的 `examples/quick_start.py` 来调整。

ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

```### 4.1 安装与环境准备



### 4.3 配置选项（ClaudeAgentOptions）如果你是直接使用发布好的 SDK（假设包名为 `claude-agent-sdk`，以实际为准）：



这是 SDK 最重要的配置类，字段非常丰富：```bash

pip install claude-agent-sdk

```python```

@dataclass

class ClaudeAgentOptions:在本地开发 / 源码阅读模式下，一般会：

    # 工具相关

    tools: list[str] | ToolsPreset | None = None```bash

    allowed_tools: list[str] = field(default_factory=list)cd claude-agent-sdk-python

    disallowed_tools: list[str] = field(default_factory=list)

    python -m venv .venv

    # 提示词source .venv/bin/activate

    system_prompt: str | SystemPromptPreset | None = None

    pip install -e .

    # MCP 服务器```

    mcp_servers: dict[str, McpServerConfig] | str | Path = field(default_factory=dict)

    然后配置 Claude 的 API key（名字以 README 为准，这里假设是 `ANTHROPIC_API_KEY`）：

    # 权限与安全

    permission_mode: PermissionMode | None = None```bash

    can_use_tool: CanUseTool | None = Noneexport ANTHROPIC_API_KEY="sk-xxxx"

    sandbox: SandboxSettings | None = None```

    

    # 模型配置部分 SDK 也支持从 `Client()` 构造函数参数中显式传入 key，你可以在 quick_start 示例或 `client.py` 的签名里确认。

    model: str | None = None

    fallback_model: str | None = None### 4.2 最小「问答」示例

    max_turns: int | None = None

    max_budget_usd: float | None = None这是一个不涉及工具调用、不使用流式的最基本示例，重点是让你感受「使用侧的心智负担有多大」：

    

    # Hook 系统```python

    hooks: dict[HookEvent, list[HookMatcher]] | None = Nonefrom claude_agent_sdk import Client

    

    # 高级选项def main():

    cwd: str | Path | None = None    # 实际参数以 README / client.py 的签名为准

    cli_path: str | Path | None = None    client = Client(

    include_partial_messages: bool = False        # 如果没写，通常会从环境变量读取

    agents: dict[str, AgentDefinition] | None = None        # api_key="YOUR_ANTHROPIC_API_KEY",

    output_format: dict[str, Any] | None = None  # 结构化输出        model="claude-3-5-sonnet-latest",

    ...    )

```

    response = client.query(

---        messages=[

            {

## 五、控制协议（Control Protocol）                "role": "system",

                "content": "你是一名乐于助人的中文 AI 助手。",

这是 SDK 最核心的设计之一：SDK 和 CLI 之间不是简单的「发请求 → 收响应」，而是一个**双向的控制协议**。            },

            {

### 5.1 协议消息类型                "role": "user",

                "content": "用 3 点概括一下 Claude Agent SDK 的作用，每点不超过 15 个字。",

```python            },

# SDK → CLI 的控制请求        ],

class SDKControlRequest(TypedDict):        # 这里的参数名与类型以实际 SDK 为准

    type: Literal["control_request"]        max_output_tokens=256,

    request_id: str        temperature=0.2,

    request: (    )

        SDKControlInterruptRequest      # 中断

        | SDKControlPermissionRequest   # 工具权限请求    print("模型回答：")

        | SDKControlInitializeRequest   # 初始化    print(response.content)

        | SDKHookCallbackRequest        # Hook 回调

        | SDKControlMcpMessageRequest   # MCP 消息if __name__ == "__main__":

    )    main()

```

# CLI → SDK 的控制响应

class SDKControlResponse(TypedDict):这一小段代码已经体现出 SDK 帮你做的几件事：

    type: Literal["control_response"]

    response: ControlResponse | ControlErrorResponse- 帮你**统一管理模型名和认证信息**（不需要自己写 HTTP client）；

```- `messages` 列表就对应 `types.py` 里的 Message 类型；

- 返回的 `response` 是一个高层对象：

### 5.2 Query 类 —— 协议的核心实现  - 它很可能是一个带结构的响应，内部保留了 tool 调用结果、usage、metadata 等信息；

  - 但在最简单场景下你只需要 `response.content` 这一级。

`_internal/query.py` 中的 `Query` 类是整个控制协议的核心，主要职责：

在文章里，你可以配合真实的输出截图，让读者更有参与感。

1. **消息路由**：从 transport 读取消息，区分普通消息和控制消息

2. **控制请求处理**：### 4.3 稍微「结构化」一点的例子

   - `can_use_tool` → 调用用户提供的权限回调

   - `hook_callback` → 调用注册的 hook 函数为了给后面几期埋个伏笔，我们可以再写一个带结构化输出要求的例子：让 Claude 帮你输出 JSON 风格的摘要，后面在讲类型系统和流式解析时，可以继续用这段示例扩展。

   - `mcp_message` → 路由到 SDK MCP 服务器

3. **状态管理**：维护 pending requests、hook callbacks 等状态```python

from claude_agent_sdk import Client

```python

class Query:def summarize(text: str):

    async def initialize(self) -> dict | None:    client = Client(model="claude-3-5-sonnet-latest")

        """初始化控制协议，注册 hooks"""

    prompt = f"""

    async def _read_messages(self):请阅读下面这段技术内容，并输出一个 JSON，总结其中的要点：

        """从 transport 读取消息并路由"""

- 字段：

    async def _handle_control_request(self, request):  - title: 字符串

        """处理 CLI 发来的控制请求"""  - key_points: 字符串数组，每项一句话

```  - difficulty: 整数 1-5，越大越难



---内容如下：



## 六、MCP 工具集成{text}

"""

SDK 提供了两种 MCP 服务器接入方式：

    response = client.query(

### 6.1 外部 MCP 服务器        messages=[

            {"role": "user", "content": prompt},

```python        ],

options = ClaudeAgentOptions(        max_output_tokens=512,

    mcp_servers={    )

        "my_server": {

            "type": "stdio",    print("原始输出：")

            "command": "python",    print(response.content)

            "args": ["my_mcp_server.py"],

        }if __name__ == "__main__":

    }    summarize("这里替换成你的一段技术文章内容")

)```

```

第 2 期我们可以沿着这个例子，继续往下讲：

### 6.2 SDK 内置 MCP 服务器（亮点！）

- 如何用 SDK 自带的类型 / 工具，帮你把 `response` 的 JSON 内容安全地解析出来；

SDK 允许你在 Python 进程内定义 MCP 工具，无需启动独立进程：- 在流式模式下，SDK 是如何一步步把「增量文本片段」重组为一个完整的 JSON 结构的。



```python---

from claude_agent_sdk import tool, create_sdk_mcp_server

## 五、从使用体验回到项目结构：一张“心智地图”

@tool("add", "Add two numbers", {"a": float, "b": float})

async def add(args):结合上面的项目结构和示例，我们可以给这套 SDK 画一张简化的“调用链”心智图：

    return {"content": [{"type": "text", "text": f"Result: {args['a'] + args['b']}"}]}

1. 在你的业务代码里：

@tool("multiply", "Multiply two numbers", {"a": float, "b": float})

async def multiply(args):   ```python

    return {"content": [{"type": "text", "text": f"Result: {args['a'] * args['b']}"}]}   client = Client(...)

   response = client.query(messages=[...], tools=[...])

# 创建服务器   ```

calculator = create_sdk_mcp_server("calculator", tools=[add, multiply])

2. SDK 顶层：

# 使用

options = ClaudeAgentOptions(   - `claude_agent_sdk.client.Client` 接收这些参数；

    mcp_servers={"calc": calculator},   - 可能创建一个 `Query` 对象，填充默认值、做基本校验；

    allowed_tools=["add", "multiply"],

)3. 内部实现 `_internal`：

```

   - `_internal.client` / `_internal.query` 负责：

**优势**：     - 把这些参数转成 Claude API 所需的 payload；

- 更好的性能（无 IPC 开销）     - 选择使用 HTTP / 子进程 CLI / 其他 transport；

- 更简单的部署（单进程）   - 如果是流式调用，会把返回的 event stream 丢给 `_internal.message_parser`；

- 更容易调试（同一进程）   - `message_parser` 会维持一个状态机：

- 可以直接访问应用状态     - 接收增量片段；

     - 重组出完整的消息、工具调用、工具结果等结构化信息。

---

4. 底层传输层 `transport`：

## 七、Hook 系统

   - 比如 `transport/subprocess_cli.py` 负责启动 CLI 子进程，与之通信；

SDK 支持在关键节点注册 Hook，拦截或修改行为：   - 处理 stdout/stderr 的缓冲、编码、超时、中断等；

   - 把数据流交还给上层 parser。

### 7.1 支持的 Hook 事件

5. 周边配套：

```python

HookEvent = Literal[   - `types.py` 定义了这一切数据的“词汇表”；

    "PreToolUse",       # 工具调用前   - `_errors.py` 统一了错误类型；

    "PostToolUse",      # 工具调用后   - `tests/` 和 `e2e-tests/` 保证了这些行为在各种组合场景下都能工作。

    "UserPromptSubmit", # 用户提交 prompt 前

    "Stop",             # 停止时这张心智地图可以作为后续几期的纲：

    "SubagentStop",     # 子 Agent 停止时

    "PreCompact",       # 压缩上下文前- 第 2 期：围绕 `types.py` / `__init__.py` 整理“词汇表”；

]- 第 3 期：拆 `Client` / `Query`；

```- 第 4 期：深挖 `message_parser`；

- 第 5–6 期：看 tools / MCP / transport；

### 7.2 Hook 配置- 第 7 期：看 tests / CI / 发布。



```python---

@dataclass

class HookMatcher:## 六、总结与下期预告

    matcher: str | None = None    # 匹配规则，如 "Bash" 或 "Write|Edit"

    hooks: list[HookCallback] = field(default_factory=list)这一篇我们做了三件事：

    timeout: float | None = None

```1. **从需求角度**说明了：为什么需要一套专门的 Claude Agent SDK，而不是“直接 HTTP + 自己拼 JSON”。

2. **从项目结构角度**梳理了：

### 7.3 使用场景   - 公共 API 模块（`client.py`、`query.py`、`types.py` 等）；

   - 内部实现模块（`_internal/*.py`、`transport/subprocess_cli.py`）；

- **PreToolUse**：拦截危险工具调用、修改工具输入   - 示例和测试是如何把“设计意图”写成可执行代码的。

- **PostToolUse**：记录工具执行日志、处理工具结果3. **从使用者角度**跑通了两个最小示例：

- **UserPromptSubmit**：过滤敏感 prompt、添加上下文   - 一个是最基础的问答；

   - 一个是稍微结构化一点的 JSON 摘要，为后续流式与类型系统分析埋了伏笔。

---

> 如果你现在已经把 quick_start 示例在本地跑通，非常建议顺手打开：

## 八、错误体系>

> - `src/claude_agent_sdk/types.py`

```python> - `src/claude_agent_sdk/client.py`

class ClaudeSDKError(Exception): pass> - `tests/test_types.py`

class CLINotFoundError(ClaudeSDKError): pass   # CLI 找不到>

class CLIConnectionError(ClaudeSDKError): pass # 连接失败> 粗略扫一眼字段和测试用例，下一篇你会读得更快，也更有“aha moment”。

class CLIJSONDecodeError(ClaudeSDKError): pass # JSON 解析失败

class ProcessError(ClaudeSDKError): pass       # 进程错误在**下一期**中，我们会正式从源码视角出发，重点关注两块内容：

class MessageParseError(ClaudeSDKError): pass  # 消息解析失败

```- `types.py` 是如何建模：

  - 消息（Message）；

---  - 工具（Tool）；

  - 响应（Response）和错误（Error）；

## 九、快速上手示例- `__init__.py` / `client.py` 如何只暴露必要的公共接口，并把 `_internal` 的实现细节包起来。



### 9.1 安装也就是从“这套 SDK 的**词汇表**”开始，看看它是如何在类型层面为后续所有 Client / Parser / Transport 奠好基石的。


```bash
pip install claude-agent-sdk
```

或从源码安装：

```bash
cd claude-agent-sdk-python
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

### 9.2 最简单的查询

```python
import asyncio
from claude_agent_sdk import query

async def main():
    async for message in query(prompt="用一句话解释什么是 Claude Agent SDK"):
        print(message)

asyncio.run(main())
```

### 9.3 带配置的查询

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    options = ClaudeAgentOptions(
        system_prompt="你是一名专业的 Python 开发者",
        model="claude-3-5-sonnet-latest",
        max_turns=5,
    )
    
    async for message in query(
        prompt="写一个快速排序的 Python 实现",
        options=options
    ):
        print(message)

asyncio.run(main())
```

---

## 十、关键设计亮点总结

1. **分层清晰**：公共 API / 内部实现 / 传输层 三层分离，`_internal` 前缀明确标识内部模块

2. **双向控制协议**：不是简单的 RPC，而是双向的消息流 + 控制请求/响应机制

3. **SDK MCP 服务器**：支持在 Python 进程内定义工具，零 IPC 开销

4. **Hook 系统**：可在关键节点拦截和修改行为

5. **类型安全**：大量使用 `dataclass`、`TypedDict`、`Literal`，IDE 补全友好

6. **anyio 异步**：底层使用 anyio，支持 asyncio/trio 两种运行时

---

## 十一、总结与下期预告

这一篇我们做了这些事：

1. **从架构角度**说明了：SDK 是如何通过子进程与 Claude Code CLI 通信的
2. **从 API 角度**介绍了：两种使用模式（`query()` vs `ClaudeSDKClient`）
3. **从类型角度**梳理了：核心类型系统（Message、ContentBlock、ClaudeAgentOptions）
4. **从协议角度**解释了：控制协议的设计和 Query 类的作用
5. **从实践角度**展示了：MCP 工具集成、Hook 系统、错误体系

> 如果你现在已经把示例在本地跑通，非常建议顺手打开：
>
> - `src/claude_agent_sdk/types.py`
> - `src/claude_agent_sdk/_internal/query.py`
> - `tests/test_types.py`
>
> 粗略扫一眼字段和测试用例，下一篇你会读得更快。

在**下一期**中，我们会深入 `types.py` 的源码，看看：

- 每个类型是如何设计的，为什么这样设计
- 类型之间的关系和层次
- 从测试用例反推设计意图
