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

源码里的 `ClaudeAgentOptions` 其实还要更丰富一些，例如：

- `continue_conversation` / `resume`：用于继续之前的会话；
- `betas`：开启一些 Beta 能力（例如特定日期的 1M context）；
- `settings` / `add_dirs` / `env` / `extra_args`：给 CLI 传递 settings 文件、附加目录和环境变量，以及任意额外的 CLI 参数；
- `stderr`：自定义 stderr 输出回调，用于打日志或 UI 展示；
- `plugins`：本地插件目录（`SdkPluginConfig`）；
- `max_thinking_tokens`：控制思考 token 上限；

这些字段更多偏工程与运维向，适合在后续实战篇里结合具体配置文件来展开。

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

这里可以把 `Query` 想象成 SDK 的「事件循环 + 路由器」：一边从传输层不断读取 JSON 行，一边把控制请求分发给权限回调、Hook、MCP 服务器等组件。

### 5.3 工具权限系统：PermissionMode + can_use_tool

源码里对「工具权限」做了比较完整的建模，核心包括：

- **PermissionMode**：整体权限模式（`default` / `acceptEdits` / `plan` / `bypassPermissions`）；
- **PermissionResult**：权限回调的返回结果（允许 / 拒绝）；
- **PermissionUpdate**：可以在回调里动态修改权限规则；
- **can_use_tool 回调**：由业务方提供的异步函数，真正做「要不要放行某个工具」的决策。

关键类型片段大致是：

```python
PermissionMode = Literal["default", "acceptEdits", "plan", "bypassPermissions"]

@dataclass
class PermissionResultAllow:
    behavior: Literal["allow"] = "allow"
    updated_input: dict[str, Any] | None = None
    updated_permissions: list[PermissionUpdate] | None = None

@dataclass
class PermissionResultDeny:
    behavior: Literal["deny"] = "deny"
    message: str = ""
    interrupt: bool = False

PermissionResult = PermissionResultAllow | PermissionResultDeny

CanUseTool = Callable[[str, dict[str, Any], ToolPermissionContext], Awaitable[PermissionResult]]
```

当 CLI 需要调用某个工具时，会通过控制协议发来一条 `can_use_tool` 请求，`Query._handle_control_request` 的逻辑大概是：

```python
permission_request: SDKControlPermissionRequest = request_data

context = ToolPermissionContext(
    signal=None,
    suggestions=permission_request.get("permission_suggestions", []) or [],
)

response = await self.can_use_tool(
    permission_request["tool_name"],
    permission_request["input"],
    context,
)

if isinstance(response, PermissionResultAllow):
    # behavior = allow，必要时可以修改输入 / 权限
elif isinstance(response, PermissionResultDeny):
    # behavior = deny，可以附带 message、interrupt 标记
```

这样一来：

- **权限决策完全交给业务方**，SDK 只负责把请求转发给 `can_use_tool`；
- `PermissionUpdate.to_dict()` 会把 Python dataclass 转成 CLI 协议需要的结构，保持和 TypeScript SDK 一致；
- 通过 `permission_suggestions`，CLI 还能给出「建议的规则更新」，由业务方决定是否采纳。

---

## 六、传输层与子进程 CLI：SubprocessCLITransport

`_internal/transport/subprocess_cli.py` 负责与 Claude Code CLI 的进程通信，是 SDK 和 CLI 之间的「物理通道」。

### 6.1 CLI 启动与查找策略

传输层的核心职责包括：

1. **查找 CLI 可执行文件路径**：
   - 优先使用 `ClaudeAgentOptions.cli_path` 显式指定的路径；
   - 否则尝试使用打包随 SDK 附带的 CLI（二进制文件）；
   - 再退回到 `shutil.which("claude-code")` 之类的系统 PATH 查询；
2. **根据 `ClaudeAgentOptions` 构造命令行参数**：
   - 模型、system prompt、tools、MCP 服务器、权限模式等都会被翻译成 `--xxx` 参数；
3. **用 anyio 启动子进程**：
   - 打开 stdin/stdout/stderr 三个管道；
   - 把当前工作目录（`cwd`）和环境变量（如 API key）传给 CLI。

这一切对使用者来说都是透明的——你只需要提供 `ClaudeAgentOptions`，SDK 会负责把它翻译成真正的 CLI 命令行。

### 6.2 命令行长度与临时文件

一个工程上非常实用的细节是：**当 prompt 或配置太长导致命令行超长时，SDK 会自动写入临时文件再传给 CLI**。伪代码大概是：

```python
if total_length > _CMD_LENGTH_LIMIT:
    # 把 prompt 写入临时文件
    temp_file = tempfile.NamedTemporaryFile(...)
    temp_file.write(prompt.encode())
    cmd.extend(["--prompt-file", temp_file.name])
else:
    cmd.extend(["--prompt", prompt])
```

这样可以避免「命令行参数太长被系统拒绝」这种在生产环境中经常踩坑的问题。

### 6.3 消息流：JSON Lines 协议

`SubprocessCLITransport.read_messages()` 会从 CLI 的 stdout 中按行读取数据，每一行都是一条 JSON：

- 每一行代表一条事件（用户消息、助手消息、系统消息、控制响应等）；
- 这一层只保证「字节流 → JSON dict」的转换，不关心具体语义；
- 语义层的解析交给上层的 `message_parser.parse_message`。

---

## 七、消息解析：message_parser.py

`message_parser.parse_message` 的职责是把 CLI 输出的原始 JSON 行，转换为上面介绍过的 `Message` + `ContentBlock` 体系：

```python
def parse_message(data: dict[str, Any]) -> Message:
    message_type = data.get("type")

    match message_type:
        case "user":
            return UserMessage(...)

        case "assistant":
            return AssistantMessage(...)

        case "system":
            return SystemMessage(...)

        case "result":
            return ResultMessage(...)

        case "stream_event":
            return StreamEvent(...)
```

**几个重点：**

- 使用 `match-case` 进行类型分派，语义非常直接；
- 对于 `assistant` 消息，会继续解析内部的 content blocks（text / thinking / tool_use / tool_result）；
- 一旦遇到未知的结构，会抛出 `MessageParseError`，上层可以统一处理。

这层属于「粘合层」，但它让 `ClaudeSDKClient` / `query()` 不需要关心底层 JSON 细节，只要处理干净的 Python 类型即可。

---

## 八、MCP 工具集成

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

从 `Query._handle_sdk_mcp_request` 的实现还能看到一层细节：SDK 现在是**手动路由 JSONRPC 消息**到 MCP Server 的：

```python
async def _handle_sdk_mcp_request(self, server_name: str, message: dict[str, Any]) -> dict[str, Any]:
    method = message.get("method")

    if method == "initialize":
        # 返回初始化结果（只声明 tools 能力）
    elif method == "tools/list":
        # 调用 server.request_handlers[ListToolsRequest]
    elif method == "tools/call":
        # 调用 server.request_handlers[CallToolRequest]
    elif method == "notifications/initialized":
        # 简单返回成功
    else:
        # 其他方法暂不支持
```

原因是当前 Python MCP SDK 还没有像 TypeScript 那样的通用 Transport 抽象，只能按方法名手工分发。等 MCP SDK 补上这层，Query 这里也可以相应收敛成更通用的实现。

---

## 九、Hook 系统

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

结合源码可以看到，Hook 的输入/输出类型其实非常细致：

```python
class PreToolUseHookInput(BaseHookInput):
    hook_event_name: Literal["PreToolUse"]
    tool_name: str
    tool_input: dict[str, Any]

class SyncHookJSONOutput(TypedDict):
    continue_: NotRequired[bool]           # 是否继续（注意是 continue_，避免关键字）
    suppressOutput: NotRequired[bool]      # 隐藏输出
    stopReason: NotRequired[str]           # 停止原因
    decision: NotRequired[Literal["block"]]
    hookSpecificOutput: NotRequired[HookSpecificOutput]

class PreToolUseHookSpecificOutput(TypedDict):
    hookEventName: Literal["PreToolUse"]
    permissionDecision: NotRequired[Literal["allow", "deny", "ask"]]
    permissionDecisionReason: NotRequired[str]
    updatedInput: NotRequired[dict[str, Any]]  # 可以直接修改工具输入
```

注意：

- Python 里用的是 `continue_` / `async_`，`Query` 会在发回 CLI 前通过 `_convert_hook_output_for_cli` 把它们转换成 `continue` / `async`；
- `PreToolUse` 不光能「拦」，还可以通过 `updatedInput` 改写调用参数，通过 `permissionDecision` 给出细粒度决策；
- 这一层结合前面的 `can_use_tool`，构成了一个「静态规则 + 动态 Hook + 人工决策」的权限闭环。

---

## 十、Sandbox 沙箱与安全性

在权限和 Hook 之上，SDK 还提供了一层 bash 沙箱配置，用来隔离文件系统和网络：

```python
class SandboxSettings(TypedDict, total=False):
    enabled: bool
    autoAllowBashIfSandboxed: bool
    excludedCommands: list[str]
    allowUnsandboxedCommands: bool
    network: SandboxNetworkConfig
    ignoreViolations: SandboxIgnoreViolations
    enableWeakerNestedSandbox: bool
```

其中：

- `enabled`：是否启用沙箱；
- `excludedCommands`：哪些命令应当在沙箱外运行（如 `git` / `docker`）；
- `allowUnsandboxedCommands`：是否允许通过「dangerouslyDisableSandbox」直接跳过沙箱；
- `network`：可以放行哪些 Unix Socket、本地绑定、代理端口等；
- `ignoreViolations`：某些路径/主机的违规可以忽略；

结合前面的权限规则（Read/Edit/WebFetch），可以做出一套比较严谨的「文件 & 网络」防护策略。源码里也专门强调：**真正的读写/网络限制主要来自权限规则，沙箱设置更多是执行环境层面的补充。**

---

## 十、错误体系

```python
class ClaudeSDKError(Exception): pass
class CLINotFoundError(ClaudeSDKError): pass   # CLI 找不到
class CLIConnectionError(ClaudeSDKError): pass # 连接失败
class CLIJSONDecodeError(ClaudeSDKError): pass # JSON 解析失败
class ProcessError(ClaudeSDKError): pass       # 进程错误
class MessageParseError(ClaudeSDKError): pass  # 消息解析失败
```

---

## 十一、快速上手示例

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

### 11.3 带配置的查询

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

### 11.4 实际输出长什么样？

运行最简单的查询后，你会看到类似这样的消息流（这里只是结构示意）：

```python
# 1. 系统消息：会话开始
SystemMessage(subtype="init", data={"session_id": "..."})

# 2. 用户消息
UserMessage(content="用一句话解释什么是 Claude Agent SDK")

# 3. 助手消息（可能包含多个内容块）
AssistantMessage(
    content=[
        TextBlock(text="Claude Agent SDK 是一个 Python 客户端库，..."),
    ],
    model="claude-3-5-sonnet-latest",
)

# 4. 结果消息：包含费用和统计
ResultMessage(
    subtype="result",
    duration_ms=1234,
    is_error=False,
    total_cost_usd=0.003,
    usage={...},
)
```

在流式场景下（prompt 是 `AsyncIterable`），`InternalClient` 会走一条稍微复杂一点的路径：

- 使用 `SubprocessCLITransport` 启动 CLI，并把 `--input-format` 设为 `stream-json`；
- 创建 `Query`，调用 `query.start()` 在后台持续读取消息；
- 通过 `query.initialize()` 完成 Hook / MCP 的初始化握手；
- 用 `query.stream_input(prompt)` 把用户输入流源源不断写入 CLI；
- 当有 SDK MCP 服务器或 Hooks 时，会在关闭 stdin 前等待**第一个 result**，确保双向控制协议有机会完成；
- 上层的 `async for message in query.receive_messages()` 则以「消息 dict → `parse_message` → 强类型 Message」的形式对外暴露。

---

## 十二、关键设计亮点总结

1. **分层清晰**：公共 API / 内部实现 / 传输层 三层分离，`_internal` 前缀明确标识内部模块
2. **双向控制协议**：不是简单的 RPC，而是双向的消息流 + 控制请求/响应机制
3. **SDK MCP 服务器**：支持在 Python 进程内定义工具，零 IPC 开销
4. **Hook 系统**：可在关键节点拦截和修改行为
5. **类型安全**：大量使用 `dataclass`、`TypedDict`、`Literal`，IDE 补全友好
6. **anyio 异步**：底层使用 anyio，支持 asyncio/trio 两种运行时

### 12.1 为什么用 anyio？

SDK 底层使用 [anyio](https://anyio.readthedocs.io/) 而不是直接用 `asyncio`，主要有几个原因：

- **运行时无关**：同一套代码可以在 `asyncio` 或 `trio` 上运行；
- **更好的取消语义**：anyio 的 `CancelScope` 比原生 asyncio 的取消更易于组合和控制；
- **统一的进程与 IO API**：`anyio.open_process` 等封装了跨平台的子进程管理；

对大多数使用者来说，你只需要像示例那样用 `asyncio.run()` 跑即可，内部的运行时细节都由 SDK 处理。

---

## 十三、总结与下期预告

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

在**下一期**中，主要围绕控制协议和内部 Client 展开，重点包括：

- 深入 `_internal/query.py`，看控制协议的完整生命周期；
- 详细拆解 `Query._read_messages` 和 `_handle_control_request` 的实现；
- 理解 SDK 如何处理工具权限请求、Hook 回调、MCP 消息路由；
- 结合 `src/claude_agent_sdk/client.py` 看 `ClaudeSDKClient` 如何把这些能力对外封成一个易用的 API。
