---
title: 'Claude Agent SDK 源码与实战（一）：整体架构与快速上手'
description: '从使用者视角出发，先跑通 Claude Agent SDK 的最小示例，再从项目结构和抽象设计上看清这套 Python SDK 在解决什么问题。'
publishDate: '2025-12-05'
tags: ['源码分析', 'claude', 'sdk', 'python', 'agent']
language: 'zh-CN'
---

> 这一篇是 Claude Agent SDK 源码分析系列的开篇：先不急着钻函数细节，而是**跑通最小示例 + 读懂项目结构 + 理解它到底在解决什么问题**。后面几篇再一点点下潜到类型系统、内部 Client、消息解析、MCP 工具等实现细节。

## 一、为啥要关心 Claude Agent SDK？

### 1.1 它到底在解决什么问题？

如果你已经写过几次 LLM 应用，大概率遇到过这些情况：

- 直接 HTTP 调 Claude API，每次都要自己拼 JSON，**tools / messages / metadata 写多了非常痛苦**；
- 想玩工具调用 / MCP / 多轮 Agent，对话状态、工具结果拼接、流式增量解析一多，**业务代码迅速变成一坨状态机**；
- 随着功能增多，你需要：
  - 明确的错误类型（区分鉴权、限流、超时、工具执行异常…）；
  - 比较好的流式接口（不要自己手撸 event parser）；
  - 更清晰的测试、版本、发布流程。

`claude-agent-sdk-python` 想解决的，就是这些问题中的大头：

1. 用一个清晰的 `ClaudeSDKClient` / `query()` 抽象，把「请求参数 + 工具 + 对话历史」统一收口；
2. 用完善的类型（`types.py`）建模消息、工具、响应、错误等核心概念；
3. 提供流式模式、工具调用、MCP 集成、Hook 系统等高级能力；
4. 自带完整的测试与工程化体系，作为正式 SDK 发布，而不是「demo 脚本」。

### 1.2 核心设计：通过子进程与 Claude Code CLI 通信

**这是理解这套 SDK 最关键的一点**：它并不是直接调用 Claude API，而是**通过子进程启动 Claude Code CLI，然后用一套自定义的「控制协议（Control Protocol）」进行双向通信**。

架构层次如下：

```text
用户代码
   ↓
┌───────────────────────────────────────────────┐
│  公共 API 层（claude_agent_sdk/）              │
│  ├── query()       → 简单的一次性查询          │
│  ├── ClaudeSDKClient → 双向交互式对话客户端     │
│  └── types.py       → 所有类型定义              │
└───────────────────────────────────────────────┘
   ↓
┌───────────────────────────────────────────────┐
│  内部实现层（_internal/）                       │
│  ├── InternalClient → 核心客户端实现           │
│  ├── Query          → 控制协议 + 消息路由      │
│  └── message_parser → 消息解析器              │
└───────────────────────────────────────────────┘
   ↓
┌───────────────────────────────────────────────┐
│  传输层（_internal/transport/）                │
│  └── SubprocessCLITransport → 子进程通信       │
└───────────────────────────────────────────────┘
   ↓
Claude Code CLI（子进程）
   ↓
Claude API
```

这意味着：

- SDK 的核心工作是**管理与 CLI 子进程的双向通信**；
- 所有高级功能（工具调用、Hook、MCP）都通过**控制协议**在 SDK 和 CLI 之间流转；
- 你不需要自己处理 Claude API 的 HTTP 请求、认证、重试等细节。

### 1.3 和 Claude Code 的关系与区别

很多人第一次看到这个 SDK 名字时，会下意识以为它是「给 Claude Code 编辑器用的 SDK」。其实更准确的说法是：

- **Claude Agent SDK 是一个通用的 Agent / 工具 / MCP SDK**，用来在你自己的项目里构建智能体、工具调用、MCP 集成等能力；
- **Claude Code 则是一个具体的产品形态**（在编辑器里写/改代码），它内部当然也要调用 Claude 模型和一堆工具，但那是产品实现细节；
- **两者的关系**：Claude Agent SDK 通过子进程启动 Claude Code CLI 来工作，所以它们共享同一套底层协议和能力。

可以简单这么区分：

| 场景 | 选择 |
|------|------|
| 想在 VS Code / Web IDE 里用 Claude 帮你写代码 | Claude Code 产品 |
| 想在自己的服务里做一个「用 Claude 作为大脑」的 Agent | Claude Agent SDK |
| 想让 Claude 调用你的业务工具、MCP 工具 | Claude Agent SDK |

### 1.4 本系列的节奏

本系列会按这样的节奏来拆这套 SDK：

- 第 1 期：**整体架构 + 快速上手**（你正在看的这篇）
- 第 2 期：类型系统与公共 API 设计（`types.py`、`__init__.py`、错误体系）
- 第 3 期：Client & Query 的实现（`client.py` / `query.py` / `_internal/client.py`）
- 第 4 期：消息解析与流式输出（`_internal/message_parser.py`）
- 第 5 期：工具调用与 MCP 集成（MCP 示例 + 工具回调）
- 第 6 期：传输层与子进程 CLI（`transport/subprocess_cli.py`）
- 第 7 期：测试体系与版本管理（`tests/`、`e2e-tests/`、CI / 发布）

---

## 二、项目结构鸟瞰：公共 API vs 内部实现

本系列分析的是仓库里的 `claude-agent-sdk-python` 目录，大致结构如下：

```text
claude-agent-sdk-python/
  pyproject.toml
  README.md
  CHANGELOG.md
  CLAUDE.md

  src/claude_agent_sdk/
    __init__.py          # 对外暴露的主入口
    client.py            # ClaudeSDKClient 实现
    query.py             # query() 函数
    types.py             # 所有类型定义
    _errors.py           # 错误体系
    _version.py          # 版本信息
    py.typed

    _internal/
      __init__.py
      client.py          # InternalClient 实现
      query.py           # Query 类（控制协议核心）
      message_parser.py  # 消息解析器
      transport/
        __init__.py
        subprocess_cli.py # 子进程传输层

  examples/
    quick_start.py       # 快速上手示例
    agents.py            # 多轮对话示例
    streaming_mode.py    # 流式输出示例
    mcp_calculator.py    # MCP 工具示例
    ...

  tests/
    test_client.py
    test_types.py
    test_message_parser.py
    ...

  e2e-tests/
    test_agents_and_settings.py
    test_hooks.py
    ...
```

### 2.1 明确的「公共 API / 内部实现」分层

- 顶层 `src/claude_agent_sdk/` 下的几个模块，构成**公共 API**：
  - `__init__.py`：决定 `import claude_agent_sdk` 能拿到什么；
  - `client.py`：对外的 `ClaudeSDKClient` 类；
  - `query.py`：封装一次请求的 `query()` 函数；
  - `types.py`：消息、工具、响应、错误等核心类型；

- `_internal/` 则是**内部实现细节**：
  - 这里是底层 client、query、message parser、传输层；
  - 对使用者来说是"不保证兼容"的区域；
  - 源码分析系列会重点钻到这里。

### 2.2 示例与测试就是 "活的文档"

- `examples/` 目录提供了各种使用场景的示例；
- `tests/` + `e2e-tests/` 从测试可以看出设计意图和边界 case。

---

## 三、两种使用模式：query() vs ClaudeSDKClient

SDK 提供了两种主要入口，分别面向不同使用场景：

### 3.1 `query()` 函数 —— 简单一次性查询

```python
async def query(
    *,
    prompt: str | AsyncIterable[dict[str, Any]],
    options: ClaudeAgentOptions | None = None,
    transport: Transport | None = None,
) -> AsyncIterator[Message]:
```

**特点**：

- **单向的、无状态的查询**
- 适合「Fire-and-Forget」场景：一次性问答、批处理、脚本自动化
- 内部会自动创建 `InternalClient`，调用完就销毁

**典型用法**：

```python
from claude_agent_sdk import query

async for message in query(prompt="What is 2+2?"):
    print(message)
```

**适用场景**：

- 简单一次性问题（"2+2 等于几？"）
- 批量处理独立的 prompts
- 代码生成或分析任务
- 自动化脚本和 CI/CD 流水线

### 3.2 `ClaudeSDKClient` 类 —— 双向交互式对话

```python
class ClaudeSDKClient:
    async def connect(self, prompt: str | AsyncIterable[dict] | None = None)
    async def send_user_message(self, content: str | list, parent_tool_use_id: str | None = None)
    async def messages() -> AsyncIterator[Message]
    async def disconnect()
```

**特点**：

- **双向、有状态的对话客户端**
- 支持中断、追问、动态发送消息
- 维护对话上下文

**典型用法**：

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

client = ClaudeSDKClient(options=ClaudeAgentOptions(...))
await client.connect("Hello!")

async for msg in client.messages():
    print(msg)
    if need_followup:
        await client.send_user_message("Tell me more")

await client.disconnect()
```

**适用场景**：

- 构建聊天界面或对话式 UI
- 交互式调试或探索会话
- 需要根据响应发送后续消息
- 需要中断能力的场景

### 3.3 两种模式的对比

| 特性 | `query()` | `ClaudeSDKClient` |
|------|-----------|-------------------|
| 通信方向 | 单向 | 双向 |
| 状态管理 | 无状态 | 有状态 |
| 复杂度 | 简单 | 较复杂 |
| 中断支持 | ❌ | ✅ |
| 追问能力 | ❌ | ✅ |
| 适用场景 | 自动化、批处理 | 交互式应用 |

---

## 四、核心类型系统（types.py）

`src/claude_agent_sdk/types.py` 是整个 SDK 的「词汇表」，定义了所有数据结构。

### 4.1 消息类型

```python
@dataclass
class UserMessage:
    """用户消息"""
    content: str | list[ContentBlock]
    parent_tool_use_id: str | None = None

@dataclass
class AssistantMessage:
    """助手消息，包含内容块"""
    content: list[ContentBlock]
    model: str
    parent_tool_use_id: str | None = None
    error: AssistantMessageError | None = None

@dataclass
class SystemMessage:
    """系统消息，包含元数据"""
    subtype: str
    data: dict[str, Any]

@dataclass
class ResultMessage:
    """结果消息，包含费用和使用信息"""
    subtype: str
    duration_ms: int
    duration_api_ms: int
    is_error: bool
    num_turns: int
    session_id: str
    total_cost_usd: float | None = None
    usage: dict[str, Any] | None = None

# 消息联合类型
Message = UserMessage | AssistantMessage | SystemMessage | ResultMessage | StreamEvent
```

### 4.2 内容块类型

```python
@dataclass
class TextBlock:
    """文本内容块"""
    text: str

@dataclass
class ThinkingBlock:
    """思考内容块（Claude 的推理过程）"""
    thinking: str
    signature: str

@dataclass
class ToolUseBlock:
    """工具调用块"""
    id: str
    name: str
    input: dict[str, Any]

@dataclass
class ToolResultBlock:
    """工具结果块"""
    tool_use_id: str
    content: str | list[dict] | None = None
    is_error: bool | None = None

ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock
```

### 4.3 配置选项（ClaudeAgentOptions）

这是 SDK 最重要的配置类，字段非常丰富：

```python
@dataclass
class ClaudeAgentOptions:
    # 工具相关
    tools: list[str] | ToolsPreset | None = None
    allowed_tools: list[str] = field(default_factory=list)
    disallowed_tools: list[str] = field(default_factory=list)
    
    # 提示词
    system_prompt: str | SystemPromptPreset | None = None
    
    # MCP 服务器
    mcp_servers: dict[str, McpServerConfig] | str | Path = field(default_factory=dict)
    
    # 权限与安全
    permission_mode: PermissionMode | None = None
    can_use_tool: CanUseTool | None = None
    sandbox: SandboxSettings | None = None
    
    # 模型配置
    model: str | None = None
    fallback_model: str | None = None
    max_turns: int | None = None
    max_budget_usd: float | None = None
    
    # Hook 系统
    hooks: dict[HookEvent, list[HookMatcher]] | None = None
    
    # 高级选项
    cwd: str | Path | None = None
    cli_path: str | Path | None = None
    include_partial_messages: bool = False
    agents: dict[str, AgentDefinition] | None = None
    output_format: dict[str, Any] | None = None  # 结构化输出
    ...
```

---

## 五、控制协议（Control Protocol）

这是 SDK 最核心的设计之一：SDK 和 CLI 之间不是简单的「发请求 → 收响应」，而是一个**双向的控制协议**。

### 5.1 协议消息类型

```python
# SDK → CLI 的控制请求
class SDKControlRequest(TypedDict):
    type: Literal["control_request"]
    request_id: str
    request: (
        SDKControlInterruptRequest      # 中断
        | SDKControlPermissionRequest   # 工具权限请求
        | SDKControlInitializeRequest   # 初始化
        | SDKHookCallbackRequest        # Hook 回调
        | SDKControlMcpMessageRequest   # MCP 消息
    )

# CLI → SDK 的控制响应
class SDKControlResponse(TypedDict):
    type: Literal["control_response"]
    response: ControlResponse | ControlErrorResponse
```

### 5.2 Query 类 —— 协议的核心实现

`_internal/query.py` 中的 `Query` 类是整个控制协议的核心，主要职责：

1. **消息路由**：从 transport 读取消息，区分普通消息和控制消息
2. **控制请求处理**：
   - `can_use_tool` → 调用用户提供的权限回调
   - `hook_callback` → 调用注册的 hook 函数
   - `mcp_message` → 路由到 SDK MCP 服务器
3. **状态管理**：维护 pending requests、hook callbacks 等状态

```python
class Query:
    async def initialize(self) -> dict | None:
        """初始化控制协议，注册 hooks"""

    async def _read_messages(self):
        """从 transport 读取消息并路由"""

    async def _handle_control_request(self, request):
        """处理 CLI 发来的控制请求"""
```

---

## 六、MCP 工具集成

SDK 提供了两种 MCP 服务器接入方式：

### 6.1 外部 MCP 服务器

```python
options = ClaudeAgentOptions(
    mcp_servers={
        "my_server": {
            "type": "stdio",
            "command": "python",
            "args": ["my_mcp_server.py"],
        }
    }
)
```

### 6.2 SDK 内置 MCP 服务器（亮点！）

SDK 允许你在 Python 进程内定义 MCP 工具，无需启动独立进程：

```python
from claude_agent_sdk import tool, create_sdk_mcp_server

@tool("add", "Add two numbers", {"a": float, "b": float})
async def add(args):
    return {"content": [{"type": "text", "text": f"Result: {args['a'] + args['b']}"}]}

@tool("multiply", "Multiply two numbers", {"a": float, "b": float})
async def multiply(args):
    return {"content": [{"type": "text", "text": f"Result: {args['a'] * args['b']}"}]}

# 创建服务器
calculator = create_sdk_mcp_server("calculator", tools=[add, multiply])

# 使用
options = ClaudeAgentOptions(
    mcp_servers={"calc": calculator},
    allowed_tools=["add", "multiply"],
)
```

**优势**：

- 更好的性能（无 IPC 开销）
- 更简单的部署（单进程）
- 更容易调试（同一进程）
- 可以直接访问应用状态

---

## 七、Hook 系统

SDK 支持在关键节点注册 Hook，拦截或修改行为：

### 7.1 支持的 Hook 事件

```python
HookEvent = Literal[
    "PreToolUse",       # 工具调用前
    "PostToolUse",      # 工具调用后
    "UserPromptSubmit", # 用户提交 prompt 前
    "Stop",             # 停止时
    "SubagentStop",     # 子 Agent 停止时
    "PreCompact",       # 压缩上下文前
]
```

### 7.2 Hook 配置

```python
@dataclass
class HookMatcher:
    matcher: str | None = None    # 匹配规则，如 "Bash" 或 "Write|Edit"
    hooks: list[HookCallback] = field(default_factory=list)
    timeout: float | None = None
```

### 7.3 使用场景

- **PreToolUse**：拦截危险工具调用、修改工具输入
- **PostToolUse**：记录工具执行日志、处理工具结果
- **UserPromptSubmit**：过滤敏感 prompt、添加上下文

---

## 八、错误体系

```python
class ClaudeSDKError(Exception): pass
class CLINotFoundError(ClaudeSDKError): pass   # CLI 找不到
class CLIConnectionError(ClaudeSDKError): pass # 连接失败
class CLIJSONDecodeError(ClaudeSDKError): pass # JSON 解析失败
class ProcessError(ClaudeSDKError): pass       # 进程错误
class MessageParseError(ClaudeSDKError): pass  # 消息解析失败
```

---

## 九、快速上手示例

### 9.1 安装

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
