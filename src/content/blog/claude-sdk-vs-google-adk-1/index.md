---
title: "Claude Agent SDK vs Google ADK: 两种 Agent 开发范式的深度对比"
summary: "深入源码对比 Anthropic 的 Claude Agent SDK 与 Google 的 Agent Development Kit (ADK)。从通信架构（IPC vs 直接调用）到沙箱实现（Bash vs Docker），揭示两种截然不同的 Agent 构建哲学。"
date: "2025-03-05"
tags: ["Claude", "Google ADK", "Agent", "Source Code Analysis", "Python"]
draft: false
---

在完成 [Claude Agent SDK 的源码分析](/blog/claude-agent-sdk-1/) 后，一个自然的问题浮现出来：Google 的 Agent 开发方案是什么样的？

两者代表了当前 Agent 开发的两种截然不同的设计哲学：
- **Claude Agent SDK**：一个精巧的"遥控器"，操控已有的强力 CLI
- **Google ADK**：一套完整的"乐高积木"，让你从零搭建 Agent

本文将从源码层面，对比 `claude-agent-sdk-python` 和 `adk-python` 在**通信架构**与**代码执行沙箱**上的核心差异。

## 1. 通信架构：子进程代理 vs 直接 API 调用

这是两者架构上最本质的区别。

### Claude Agent SDK: 子进程 + IPC 的"套娃"模式

Claude Agent SDK 的源码，Python SDK 不发送 HTTP 请求。

核心逻辑在 `subprocess_cli.py` 的 `SubprocessCLITransport` 类中：

```python
# subprocess_cli.py (简化)
class SubprocessCLITransport(Transport):
    def __init__(self, prompt, options):
        self._cli_path = self._find_cli()  # 寻找 claude 二进制文件
        self._process: Process | None = None
        
    def _find_cli(self) -> str:
        # 1. 优先查找 SDK 内置的 CLI
        bundled_cli = self._find_bundled_cli()
        if bundled_cli:
            return bundled_cli
        # 2. 在系统 PATH 中查找
        if cli := shutil.which("claude"):
            return cli
        # 3. 检查常见安装路径
        locations = [
            Path.home() / ".npm-global/bin/claude",
            Path("/usr/local/bin/claude"),
            # ...
        ]
```

SDK 的工作流程是这样的：

1. **启动子进程**：找到 `claude` CLI 二进制，用 `anyio` 启动一个子进程
2. **IPC 通信**：通过 `stdin`/`stdout` 发送 JSON Lines 格式的指令
3. **事件流转发**：把 CLI 返回的事件流（工具调用、文本生成等）透传给上层

```
┌─────────────────┐      stdin (JSON)      ┌──────────────────┐      HTTPS
│  Python 应用    │ ────────────────────► │  claude CLI      │ ────────────► Anthropic API
│  (SDK 用户)     │ ◄──────────────────── │  (黑盒二进制)     │ ◄────────────
└─────────────────┘      stdout (JSON)     └──────────────────┘
```

这种设计初看"绕远路"，但细想很巧妙：
- **能力复用**：Claude Code CLI 本身已是一个功能完整的 Agent（有权限管理、MCP 支持、工具分发），SDK 无需重复实现
- **版本一致**：用户升级 CLI 后，SDK 自动获得新能力，无需等待 SDK 更新
- **进程隔离**：出问题时可以单独调试 CLI 或 SDK

代价也很明显：**存在对 CLI 的显式依赖**。如果没有随 SDK 内置的 CLI，你需要在系统中安装 claude-code，否则 SDK 无法正常启动子进程完成工作：

```python
raise CLINotFoundError(
    "Claude Code not found. Install with:\n"
    "  npm install -g @anthropic-ai/claude-code\n"
)
```

### Google ADK: 纯库调用的"直连"模式

Google ADK 走的是传统 SDK 路线——**直接发起 API 调用**。

在 `google_llm.py` 的 `Gemini` 类中：

```python
# google_llm.py (简化)
class Gemini(BaseLlm):
    model: str = 'gemini-2.5-flash'  # 默认模型
    
    @cached_property
    def api_client(self) -> Client:
        from google.genai import Client
        return Client(
            http_options=types.HttpOptions(
                headers=self._tracking_headers(),
                retry_options=self.retry_options,  # 内置重试机制
            )
        )
    
    async def generate_content_async(self, llm_request, stream=False):
        if stream:
            # 流式调用
            responses = await self.api_client.aio.models.generate_content_stream(
                model=llm_request.model,
                contents=llm_request.contents,
                config=llm_request.config,
            )
        else:
            # 普通调用
            response = await self.api_client.aio.models.generate_content(...)
```

关键区别：
- **同进程调用**：`google.genai.Client` 在当前 Python 进程内发起 HTTP/gRPC 请求
- **完全透明**：你可以断点调试任何一行代码，追踪到实际的网络请求
- **模型可替换**：ADK 支持通过适配器调用 Anthropic、LiteLLM 等其他模型

ADK 还内置了一些实用特性，比如针对 429 (Rate Limit) 错误的友好提示：

```python
except ClientError as ce:
    if ce.code == 429:
        raise _ResourceExhaustedError(ce) from ce  # 附带解决方案链接
```

### 对比小结

| 维度 | Claude Agent SDK | Google ADK |
|:-----|:-----------------|:-----------|
| **通信方式** | subprocess + stdin/stdout | 直接 HTTP/gRPC |
| **依赖** | 必须安装 `claude-code` CLI | 只需 `google-genai` 库 |
| **可调试性** | 较难（CLI 是黑盒） | 容易（全流程可追踪） |
| **扩展性** | 受限于 CLI 能力 | 可自由替换模型层 |

为了把这种差异再具象一点，可以用一个极简的「Hello World」来对比两边的调用形态（伪代码，仅展示结构）：

```python
# Claude Agent SDK：像是在“遥控”一个已经长大的 Agent
from claude_agent_sdk import ClaudeAgent, ClaudeAgentOptions

agent = ClaudeAgent(
    prompt="Hello from Python",
    options=ClaudeAgentOptions(
        model="claude-3.7-sonnet",
        # 更多选项：tools、sandbox、permission_mode...
    ),
)

for event in agent.run():
    print(event)


# Google ADK：自己拼装一个最小 Agent
from google.adk import Agent
from google.adk.models import Gemini
from google.adk.code_executors import UnsafeLocalCodeExecutor

agent = Agent(
    model=Gemini(model="gemini-2.5-flash"),
    code_executor=UnsafeLocalCodeExecutor(),  # 演示用，生产建议换成 ContainerCodeExecutor
)

result = await agent.run("Hello from Python")
print(result.output)
```

前者更像是“告诉 Claude Code 现在应该干什么”；后者则是“你亲手搭了一套最小但完整的 Agent 运行时”。

## 2. 代码执行与沙箱：Shell 环境 vs 容器化策略

Agent 的杀手级能力是"执行代码"。这也是安全风险最高的地方。两者的处理方式体现了不同的安全哲学。

### Claude Agent SDK: Bash 就是沙箱

Claude 的思路很 Unix：**Shell 本身就是一个执行环境**。

通过 `SandboxSettings` 配置，SDK 可以限制 CLI 在执行命令时的行为。但本质上，代码执行的实体是 CLI 进程启动的 Shell：

```python
# 用户配置示例
options = ClaudeAgentOptions(
    sandbox={
        "allow_bash": True,
        "allowed_commands": ["python", "git", "ls"],
        "blocked_commands": ["rm -rf", "sudo"],
    }
)
```

这种设计的特点：
- **有状态**：你 `cd` 进一个目录后，后续命令仍在该目录执行
- **通用性强**：不仅能跑 Python，还能跑 `git commit`、`grep`、`curl`
- **风险也高**：安全边界依赖 CLI 内部的黑名单/白名单实现

某种程度上，Claude SDK 把"代码沙箱"问题甩给了 CLI 去解决。这符合它"遥控器"的定位——SDK 只负责传递指令，执行环境由 CLI 负责管理。

### Google ADK: 分层的 Executor 抽象

ADK 对代码执行做了严谨的工程抽象。它定义了 `BaseCodeExecutor` 接口，并提供三种实现：

#### 1. ContainerCodeExecutor —— Docker 沙箱

这是生产环境推荐的方案。看 `container_code_executor.py` 的实现：

```python
class ContainerCodeExecutor(BaseCodeExecutor):
    def __init__(self, image=None, docker_path=None, base_url=None, **data):
        # 初始化 Docker 客户端
        self._client = (
            docker.from_env()
            if not self.base_url
            else docker.DockerClient(base_url=self.base_url)
        )
        # 启动容器
        self.__init_container()
        # 注册清理钩子
        atexit.register(self.__cleanup_container)
    
    def execute_code(self, invocation_context, code_execution_input):
        # 在容器内执行 Python 代码
        exec_result = self._container.exec_run(
            ['python3', '-c', code_execution_input.code],
            demux=True,  # 分离 stdout/stderr
        )
        return CodeExecutionResult(
            stdout=exec_result.output[0].decode('utf-8') if exec_result.output[0] else '',
            stderr=exec_result.output[1].decode('utf-8') if len(exec_result.output) > 1 else '',
        )
```

关键细节：
- **进程隔离**：代码在独立的 Docker 容器内运行，不影响宿主机
- **环境可控**：通过 `image` 或 `docker_path` 指定基础镜像
- **显式无状态**：`stateful: bool = Field(default=False, frozen=True)` —— 强制设为 False，不允许跨调用保持状态

#### 2. AgentEngineSandboxCodeExecutor —— 云端托管沙箱

如果你不想自己维护 Docker，ADK 还支持使用 Vertex AI 的托管沙箱：

```python
from vertexai.preview import reasoning_engines

class AgentEngineSandboxCodeExecutor(BaseCodeExecutor):
    # 调用 Google Cloud 的 Reasoning Engine 服务
    # 代码在云端隔离环境中执行
```

适合 Serverless 场景，代价是增加了对 GCP 的依赖。

#### 3. UnsafeLocalCodeExecutor —— 本地裸执行

顾名思义，这是**不安全**的。直接用 `exec()` 运行代码：

```python
class UnsafeLocalCodeExecutor(BaseCodeExecutor):
    # 禁止设置为有状态
    stateful: bool = Field(default=False, frozen=True)
    
    def execute_code(self, invocation_context, code_execution_input):
        globals_ = {}
        with redirect_stdout(stdout):
            exec(code_execution_input.code, globals_, globals_)  # 危！
```

仅用于本地调试，生产环境千万别用。

### 对比小结

| 维度 | Claude Agent SDK | Google ADK |
|:-----|:-----------------|:-----------|
| **沙箱类型** | Bash Shell (由 CLI 管理) | Docker / Vertex AI / 本地 |
| **隔离级别** | 进程级 (Shell 进程) | 容器级 / 云端隔离 |
| **状态管理** | 有状态 (保持工作目录等) | 默认无状态，强制不可覆盖 |
| **执行能力** | 通用 (任意 Shell 命令) | 特定语言 (默认 Python) |
| **配置复杂度** | 低 (黑白名单) | 中高 (需要 Docker 环境或 GCP) |

从这张表可以看出，Claude 更像是在给你一台「可控的远程 Shell」，而 ADK 则是在帮你搭好几种不同级别的「执行场地」（本地、容器、云端），这也自然引出了下一节里两者在设计哲学上的分野。

## 3. 设计哲学：产品思维 vs 框架思维

分析完技术细节，两者背后的设计哲学。

### Claude: "把复杂留给我们"

Claude Agent SDK 的设计目标是让你**最快地获得 Claude Code 的能力**。

看看它的命令行参数构建逻辑就知道了（`_build_command` 方法）：

```python
def _build_command(self) -> list[str]:
    cmd = [self._cli_path, "--output-format", "stream-json", "--verbose"]
    
    if self._options.model:
        cmd.extend(["--model", self._options.model])
    if self._options.max_turns:
        cmd.extend(["--max-turns", str(self._options.max_turns)])
    if self._options.permission_mode:
        cmd.extend(["--permission-mode", self._options.permission_mode])
    if self._options.mcp_servers:
        cmd.extend(["--mcp-config", json.dumps({"mcpServers": ...})])
    # ... 大量参数透传
```

SDK 本质上是 CLI 参数的 Python 封装。复杂的能力（MCP 协议支持、多 Agent 编排、上下文管理）全部由 CLI 实现，SDK 只负责"传话"。

这种设计的**核心假设**是：用户想要的是 Claude Code 的能力，而非构建自己的 Agent 框架。

### ADK: "把选择权给你"

ADK 的设计目标是让你**构建自己的 Agent**。

它提供的是组件，而非成品：
- `BaseLlm` 接口 + 多种实现（Gemini, Anthropic, LiteLLM...）
- `BaseCodeExecutor` 接口 + 多种实现（Docker, Vertex, Local...）
- `Agent` 类负责编排，但你可以任意组合上述组件

```python
# ADK 典型用法
from google.adk import Agent
from google.adk.models import Gemini
from google.adk.code_executors import ContainerCodeExecutor

agent = Agent(
    model=Gemini(model='gemini-2.5-flash'),
    code_executor=ContainerCodeExecutor(image='python:3.11'),
)
```

这种设计的**核心假设**是：用户是开发者，他们知道自己在做什么，需要的是灵活性和可控性。

## 4. 选型建议

| 场景 | 推荐 | 理由 |
|:-----|:-----|:-----|
| **快速原型** | Claude Agent SDK | 开箱即用，几行代码获得强力 Agent |
| **生产级应用** | Google ADK | 架构透明，便于监控和排障 |
| **定制化 Agent** | Google ADK | 组件可替换，扩展性强 |
| **已有 Claude Code 使用习惯** | Claude Agent SDK | 体验一致，迁移成本低 |
| **GCP 生态** | Google ADK | 原生集成 Vertex AI |
| **多模型支持** | Google ADK | 内置多种模型适配器 |

## 5. 结语

这两个 SDK 代表了 Agent 开发的两条路径：

- **Claude Agent SDK** 是"站在巨人肩膀上"——利用已有的强力 CLI，快速获得能力
- **Google ADK** 是"自己成为巨人"——提供积木，让你搭建自己的 Agent 帝国

两者没有绝对的优劣，只有场景的适配。

如果让我做一个不严谨的类比：
- Claude Agent SDK 像是**买一辆特斯拉**——开箱即用，OTA 升级，但你改不了底层
- Google ADK 像是**买一套乐高机械组**——需要自己组装，但每个零件都在你手里

选择哪个，取决于你是想开车，还是想造车。

---

*本文基于 `claude-agent-sdk-python` 和 `adk-python` 源码分析。如有错漏，欢迎指正。*
