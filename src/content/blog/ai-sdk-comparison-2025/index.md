---
title: '2025 AI SDK 调研报告：从直连模型到 Agent 编排'
description: '面对琳琅满目的 AI SDK，如何选择？本文通过“三层心智模型”拆解 Claude Agent SDK、OpenAI Agents SDK、Vercel AI SDK 等主流工具的定位与差异，助你做出正确的架构选型。'
publishDate: '2025-12-05'
tags: ['AI', 'SDK', 'Agent', 'Claude', 'OpenAI', 'Vercel', '调研报告']
language: 'zh-CN'
---

> **这些 SDK 其实分三层：**
>
> 1. **“直连模型的官方 SDK”**：openai / anthropic / google‑genai —— 解决“怎么优雅地打 HTTP 请求”的问题。
> 2. **“Agent/编排 SDK”**：Claude Agent SDK、OpenAI Agents SDK、Google ADK —— 解决“多轮对话 + 工具调用 + 多 agent 协作”的问题。
> 3. **“应用/UI 层 SDK”**：Vercel AI SDK（ai‑sdk）等 —— 解决“如何在前端/产品里快速接入各种模型+流式 UI”的问题。

你可能关注的 `anthropics/claude-agent-sdk-python` 就是**第 2 层**里的一员，和 Vercel AI SDK、Google ADK 属于同一类“Agent/编排 SDK”，但关注点各不相同。

下面我按 SDK 家族来拆，帮你快速建立对比心智模型。

---

## 0. 一张表先总览

| SDK / 家族                                | 主要语言               | 单/多模型提供方                                              | 主要定位                                                          | 更擅长什么                                                     |
| --------------------------------------- | ------------------ | ----------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| **Claude Agent SDK (Python)**           | Python             | 绑 Anthropic / Claude Code                             | 本地代码环境里的“智能工程师”（改文件、跑 bash、用 MCP 工具）                          | 代码代理、IDE 插件、自动改项目                                         |
| **OpenAI 官方 SDK (`openai`)**            | Python / JS 等      | OpenAI                                                | 直连模型 + Responses API                                          | 任何只需要 “调模型/工具” 的后端逻辑                                      |
| **OpenAI Agents SDK (`openai-agents`)** | Python / TS        | Provider‑agnostic（OpenAI + 100+ LLM）([PyPI][1])       | Multi‑agent 工作流框架（Agent + Tool + Handoff）([OpenAI GitHub][2]) | 复杂业务编排、多 agent 协作                                         |
| **Vercel AI SDK (`ai-sdk`)**            | TS / JS            | 多家：OpenAI、Anthropic、Google 等([AI SDK][3])             | Web/应用层统一模型接口 + Chat UI Hooks                                 | Next.js/React/Svelte/Vue 里做聊天、流式 UI([GitHub][4])          |
| **Google Gen AI SDK (`google-genai`)**  | Python 等           | Google（Gemini Developer API + Vertex AI）([GitHub][5]) | 直连 Gemini/Vertex 模型                                           | 深度用 Google 模型、配合 Cloud 生态                                 |
| **Google ADK（Agent Development Kit）**   | Python / Go / Java | 模型无关，优化 Gemini+Vertex([Google GitHub][6])             | 高度工程化的多 agent 框架 + 部署到 Vertex Agent Engine                    | 企业级 agent 系统、和 GCP/大数据系统深度集成([Google Developers Blog][7]) |
| **Anthropic 官方 SDK (`anthropic`)**      | Python 等           | Anthropic                                             | 直连 Claude 模型的通用 SDK([GitHub][8])                              | Web/后端服务里直接调 Claude API                                   |

---

## 1. Claude Agent SDK

> 仓库：`anthropics/claude-agent-sdk-python`([GitHub][9])
> 文档：Agent SDK reference – Python([Claude][10])

### 它到底是什么？

* **定位**：一个针对 *Claude Code / Claude 本地 agent* 的 Python SDK
* **本质上**是：

  * 把 **Claude Code CLI** 打包进来（安装 `pip install claude-agent-sdk` 就自带 CLI）([GitHub][9])
  * 给你一个 **异步 Python API** 来驱动这个“会改代码、跑 bash 的 AI 工程师”。

Claude Agent SDK 提供两个核心入口：([Claude][10])

1. `query()`

   * 每次调用新建一个 session，适合一次性任务。
   * 返回 `AsyncIterator[Message]`，可以流式处理 Claude 的回复。

2. `ClaudeSDKClient`

   * 维持长会话（多轮对话 + 记忆）。
   * 支持 **自定义工具（in‑process MCP server）** 和 **Hooks**。
   * 可以把 Python 函数包装成 Claude 可调用的工具，然后 agent 决定什么时候调用。([GitHub][9])

### 关键能力心智模型

可以把它想象成：

> “一个专门为 **本地代码库 + 工具调用** 优化的 Agent Runtime。”

* **内置工具**：如 `Read` / `Write` / `Bash` 等，直接对你项目目录读写、执行命令([GitHub][9])
* **自定义工具**：通过 `@tool` + `create_sdk_mcp_server` 把 Python 函数暴露为 MCP 服务（但运行在同一个进程里绩效好、部署简单）。([GitHub][9])
* **Hooks**：在 agent 调用工具前/后插钩子，比如拦截危险的 Bash 命令。([GitHub][9])

### 适合的场景

* 写 **代码助手 / 重构机器人 / 代码库迁移脚本**（很像“更可控的 Cursor / Copilot 本地版”）。
* 在 CI 里跑一个“自动修 PR、自动改项目结构”的 agent。
* 做 IDE 插件、内部工程师工具。

### 优势 & 局限

**优势：**

* 专门针对 **工程场景**：文件操作、代码修改、bash 调用一条龙。
* 工具生态走 **MCP 标准**，同时支持外部 MCP server 和 SDK 内置 server，利于扩展。([GitHub][9])
* 用起来像写普通 async Python 代码，类型定义齐全。

**局限：**

* 强绑定 Anthropic / Claude 及其 CLI；如果你想跨模型提供方，需要自己 hack（比如你看到那个 fork `claude-agent-sdk-python-for-gpt5` 就是把底层换成 OpenAI Responses API 的第三方改版）。([GitHub][11])
* 更关注 **本地环境中的 code agent**，不是通用“业务流程 agent”框架（比如没有开箱即用的队列、观测平台、部署 story）。

> 心智模型：
> **“Claude Agent SDK = 一个专门服务于代码编辑 & MCP 工具的 Python agent runtime。”**
> 用它是因为你想要“Claude 当你的本地工程师”，而不是单纯“调大模型”。

---

## 2. Vercel AI SDK（ai‑sdk）

> 官网：AI SDK by Vercel([AI SDK][3])
> GitHub：vercel/ai([GitHub][4])

### 它到底是什么？

* **语言**：TypeScript/JavaScript。
* **定位**：

  * 一个 **统一的 LLM 调用层（Core）** +
  * 一个 **为前端 UI 设计的 Chat/生成式 UI Hooks（UI）**。([AI SDK][3])

官方总结得很直接：AI SDK **标准化多家模型提供方的调用方式**，支持 OpenAI、Anthropic、Google 等，并提供 React/Svelte/Vue/Next.js 的聊天 UI 组件。([AI SDK][3])

### 心智模型拆解

1. **AI SDK Core**（`import { generateText } from "ai"`）：([AI SDK][3])

   * 隐藏不同厂商 API 差异（OpenAI / Anthropic / Google / 自定义模型）。
   * 统一的 `model: "google/gemini-3-pro-preview"` 这种字符串标识模型。
   * 提供工具调用、结构化输出等高级功能。

2. **AI SDK UI**（`@ai-sdk/react` 等）：([GitHub][4])

   * 提供 `useChat`、`useAssistant` 等 hooks，处理消息列表、流式更新、错误等。
   * 强调 **端到端类型安全**：从后端 agent 到前端消息类型都是 TS 类型联动。([Vercel][12])

3. **Agent 相关**

   * 有像 `ToolLoopAgent` 这类工具循环 agent，方便你在 JS 里做“带工具的聊天 agent”。([GitHub][4])
   * 但整体仍偏 **轻量 agent 能力 + 强 UI 能力**，不像 ADK / OpenAI Agents 那样围绕多 agent 编排和部署。

### 适合的场景

* 你在做 **Next.js/React 前端 + Node 后端** 的产品：

  * 聊天页面、文档问答、智能表单、AI 写作工具。
* 你想要 **快速换模型提供方**（OpenAI ↔ Anthropic ↔ Google），而不想每家写一份 SDK 调用逻辑。
* 想用 TS 类型系统把“模型输入/输出”和“工具调用”都约束住。

### 优势 & 局限

**优势：**

* **前端友好 / UI 侧一站式**：React/Svelte/Vue 都有 Chat Hooks。([GitHub][4])
* 多 Provider 支持、统一接口，便于价格或性能对比。([AI SDK][3])
* 文档与现代 Web 技术栈高度贴合（Next.js、Vercel 平台）。

**局限：**

* 没有帮你解决“如何在后端 orchestrate 多个 agent、长任务、队列、监控” —— 需要你配合别的后端框架（OpenAI Agents SDK / LangGraph / 自己写）。
* 语言局限在 JS/TS；如果你的核心逻辑在 Python/Go，对它的 agent 能力利用度有限。

> 心智模型：
> **“AI SDK = Web / 产品层的‘多模型统一接口 + Chat UI 工具箱’，不是后端 agent 引擎。”**

---

## 3. Google Gen AI SDK vs Google ADK（Agent Development Kit）

这两个很多人会混：一个是**模型 SDK**，一个是**Agent / 编排 SDK**。

### 3.1 Google Gen AI SDK (`google-genai`)

> GitHub: `googleapis/python-genai`([GitHub][5])

* **定位**：一个 **Gemini / Vertex AI 模型的官方 Python 客户端**。
* 支持：

  * Gemini Developer API + Vertex AI 模型。([GitHub][5])
  * 文本、图片、多模态、参数设置（temperature/top_p/top_k 等）。
* 用法类似：

  ```python
  from google import genai
  client = genai.Client(api_key="...")  # Developer API
  resp = client.models.generate_content(
      model="gemini-2.0-flash-001",
      contents={"text": "Hello"},
  )
  ```

> 心智模型：
> **它与 `openai`/`anthropic` 是一类的**：解决“如何以 Python 调用 Gemini/Vertex 模型”，不管 Agent 编排。

---

### 3.2 Google ADK（Agent Development Kit, `google-adk`）

> 文档首页：Agent Development Kit([Google GitHub][6])
> Cloud 文档：Overview of ADK / Vertex AI Agent Builder([Google Cloud Documentation][13])
> 博客：Agent Development Kit: Making it easy to build multi-agent applications([Google Developers Blog][7])

**定位**：

> “一个面向多 agent 系统的 **高层编排框架**，默认优化在 Google 云 + Gemini，但模型和部署都是可插拔的。”

核心特点：([Google GitHub][6])

* **多语言**：Python / Go / Java（有各自 SDK）。
* **模型无关**：

  * 虽然对 Gemini + Vertex 有深度优化，但也能接别的模型（通过 LiteLLM 等）。
* **核心抽象**：

  * **工作流 Agent**：`Sequential`、`Parallel`、`Loop` 等，让你以“流程图”的方式定义 agent pipeline。([Google GitHub][6])
  * **多 Agent 架构**：支持多 agent 分工协作、转交任务。
  * **工具系统**：内置 Search、CodeExec、MCP 工具、Cloud 连接器等。([Google GitHub][6])
* **部署故事**：

  * 官方推荐部署到 **Vertex AI Agent Engine**，提供 tracing、logging、监控、访问控制等企业级能力。([Google Cloud Documentation][13])

Google 自己在博客里把 ADK 与 Genkit 对比：([Google Developers Blog][7])

* **ADK**：更适合复杂、多 agent 系统，强调行为和编排。
* **Genkit**：是更通用的 genAI 应用框架，强调调试/测试和多模型支持。

### 适合的场景

* 你公司已经在 **GCP / Vertex AI** 上，想做 **企业级 Agent / 多 agent 工作流**：

  * 需要和 BigQuery、AlloyDB、现有 Apigee API、其他 SaaS 深度集成。([Google Developers Blog][7])
* 希望有“一套官方推荐的 agent 部署和观测链路”。

> 心智模型：
> **“Gen AI SDK = 调模型；ADK = orchestrator + 多 agent 框架 + 部署故事（尤其是 Vertex Agent Engine）。”**

---

## 4. OpenAI 官方 SDK + Agents SDK

### 4.1 `openai` 官方库

> GitHub: `openai/openai-python`([GitHub][14])
> PyPI: `openai`([PyPI][15])

* **定位**：OpenAI 全家桶的官方 SDK：Responses API、Chat Completions、图像、音频等。
* 从 README 可以看到：

  * 主推荐接口已经是 **Responses API**（统一了工具调用 / 多轮等 agent 能力）。([GitHub][14])
  * 同时保留 Chat Completions 作为旧标准。

> 心智模型上就是：
> **“OpenAI 版的 google-genai / anthropic SDK”**，解决“如何优雅调用 OpenAI API”。

---

### 4.2 OpenAI Agents SDK（`openai-agents`）

> GitHub：`openai/openai-agents-python`([GitHub][16])
> Docs：OpenAI Agents SDK site([OpenAI GitHub][2])
> PyPI：`openai-agents`([PyPI][1])

**定位**：

> “一个 **轻量但强力的多 agent 工作流框架**，并且是 **provider‑agnostic** 的。”([PyPI][1])

官方强调几个点：([PyPI][1])

* **核心原语极少**：

  * **Agent**：有指令（system）、工具、Guardrails 的 LLM。
  * **Handoff**：agent 之间的任务转交。
  * **Tools**：可以是自定义函数、外部 API、甚至计算机工具。([OpenAI GitHub][17])
* **Provider‑agnostic**：

  * 除了 OpenAI Responses/Chat Completions API，还支持 100+ 其他 LLM（通过 LiteLLM 等）。([PyPI][1])
* **设计目标**：

  * 作为此前 Swarm 的 production 级升级版。([OpenAI GitHub][2])
  * 尽量少抽象，开发者能看清 agent 在干什么，方便调试和追踪。

> 心智模型上，OpenAI Agents SDK 和 Google ADK 属于一个象限：
> **都是“多 agent 工作流编排框架”，但 ADK 更偏向 Vertex / GCP 生态，Agents SDK 更轻量 + 模型/云中立。**

---

## 5. 实战对照：同一个 Weather Agent，四种写法

为了让你更直观地感受差异，我准备了一个经典需求：**用户问某个城市的天气 → Agent 调一个 `get_weather` 工具查天气 → 再用自然语言总结给用户。**

我刻意用了非常相似的工具签名和提示词，这样你可以直接从代码结构上感受差异。

### 5.1 Claude Agent SDK (Python)

Claude 这边的心智模型是：「**工具 = MCP server 里的一个 tool**」。Python 通过 `@tool` + `create_sdk_mcp_server` 把本地函数暴露为 MCP 工具，然后通过 `ClaudeAgentOptions.mcp_servers` 和 `allowed_tools` 授权使用。

```python
# claude_weather_agent.py
import asyncio
from typing import Any

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    tool,
    create_sdk_mcp_server,
)


# 1) 定义工具：get_weather（作为 SDK MCP tool）
@tool(
    "get_weather",                      # 工具名
    "Look up current weather for a city",  # 描述
    {"city": str},                      # 简单 schema：一个 city 字段
)
async def get_weather(args: dict[str, Any]) -> dict[str, Any]:
    """Return current weather for a city as a text block."""
    city = args["city"]

    # TODO: 这里可以调用真实天气 API
    report = f"It is currently sunny and 25°C in {city}."

    # MCP 工具的返回格式：必须是 dict，带 content 列表
    return {
        "content": [
            {
                "type": "text",
                "text": report,
            }
        ]
    }


# 2) 把工具挂到一个 in-process MCP server 上
weather_server = create_sdk_mcp_server(
    name="weather-tools",
    tools=[get_weather],
)

# 3) 配置 Claude agent：告诉它有哪些 MCP 服务器、允许用哪些工具
options = ClaudeAgentOptions(
    system_prompt=(
        "You are a weather assistant. "
        "When the user asks about the weather, call the get_weather tool "
        "and then summarize the result in natural language."
    ),
    mcp_servers={"weather-tools": weather_server},
    # MCP 工具的暴露名规则：mcp__{server_name}__{tool_name}
    allowed_tools=["mcp__weather-tools__get_weather"],
    # model 可选：默认跟 Claude Code 一样；也可以手动指定
    # model="claude-3-5-sonnet-latest",
)


# 4) 用 ClaudeSDKClient 建立会话并发起请求
async def main():
    async with ClaudeSDKClient(options=options) as client:
        # 发起查询：Claude 会自主决定何时调用 get_weather
        await client.query("What's the weather like in Tokyo right now?")

        # 读取完整响应（直到 ResultMessage）
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print("Claude:", block.text)


if __name__ == "__main__":
    asyncio.run(main())
```

**Claude Agent SDK 的节奏：**

* 工具要写成 `async def tool(args: dict) -> dict`，用 `@tool(name, desc, schema)` 装饰。
* 再用 `create_sdk_mcp_server` → `ClaudeAgentOptions.mcp_servers` + `allowed_tools` 暴露给 Claude。
* 会话管理、更复杂的权限、hooks 都在 `ClaudeSDKClient` / `ClaudeAgentOptions` 里。

### 5.2 OpenAI Agents SDK (Python)

OpenAI Agents SDK 的心智模型更“Pythonic”：**任何带类型注解的 Python 函数 + `@function_tool` 就是一个工具**，返回值通常是 Pydantic 模型。Agent 直接接收一个 `tools` 列表。

```python
# openai_agents_weather.py
import asyncio
from typing import Annotated

from pydantic import BaseModel, Field
from agents import Agent, Runner, function_tool


# 1) 定义结构化返回类型
class Weather(BaseModel):
    city: str = Field(description="The city name.")
    temperature_c: float = Field(description="Current temperature in Celsius.")
    condition: str = Field(description="Weather description, e.g. 'sunny'.")


# 2) 定义工具函数，用 @function_tool 包装
@function_tool
def get_weather(
    city: Annotated[str, "The city to get the weather for"],
) -> Weather:
    """Look up current weather for a city and return structured data."""
    print("[tool] get_weather called")

    # TODO: 这里可以调用真实天气 API
    return Weather(
        city=city,
        temperature_c=25.0,
        condition="sunny",
    )


# 3) 定义 Agent，把工具挂上去
weather_agent = Agent(
    name="weather-agent",
    instructions=(
        "You are a helpful weather assistant. "
        "When the user asks about weather, call the get_weather tool and then "
        "summarize the result in a friendly sentence."
    ),
    tools=[get_weather],  # 注意：这里传的是 @function_tool 之后的对象
)


# 4) 用 Runner.run 执行一轮对话
async def main():
    result = await Runner.run(
        weather_agent,
        input="What's the weather in Tokyo right now?",
    )

    # final_output 就是 agent 完整的自然语言回答（中间调用工具的步骤已经处理好）
    print("Assistant:", result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
```

**OpenAI Agents SDK 的节奏：**

* 工具 = **普通 Python 函数** + 类型注解 + docstring，`@function_tool` 自动生成 JSON Schema 和描述。
* Agent 是一个 Python 对象，`Runner.run(agent, input=...)` 把“对话轮 + 工具调用 + 总结”整合在一起。
* 工具系统本身支持 Hosted tools、shell 等更复杂能力，但入门就是上面这几个 API。

### 5.3 Vercel AI SDK (Node / TS)

Vercel AI SDK 没有“agent 类”，而是通过 **`streamText` 的配置对象 + `tools` 字段** 表达一整个 agent 的行为。工具本质上是「一个带 Zod schema + execute 函数的配置」。

下面是一个 Next.js Route Handler 示例（只展示服务端逻辑）：

```ts
// app/api/weather-agent/route.ts
import {
  streamText,
  convertToModelMessages,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

// 允许最长 30s streaming
export const maxDuration = 30;

// POST /api/weather-agent
export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    // 可以是 'anthropic/claude-sonnet-4.5'、'openai/gpt-4.1' 等任意已配置模型
    model: 'anthropic/claude-sonnet-4.5',
    system:
      'You are a weather assistant. ' +
      'Use the getWeather tool to look up conditions, then summarize them for the user.',
    messages: convertToModelMessages(messages),

    // 1) 在 tools 里定义工具（带 Zod schema）
    tools: {
      getWeather: {
        description: 'Look up current weather for a given city.',
        inputSchema: z.object({
          city: z.string().describe('City to fetch weather for'),
        }),

        // 2) 执行工具调用的地方
        async execute({ city }: { city: string }) {
          // TODO: 在这里调用真实天气 API
          const temperatureC = 25;
          const condition = 'sunny';

          // 返回任意 JSON 可序列化对象；模型会看到这个结果并进行总结
          return { city, temperatureC, condition };
        },
      },
    },
  });

  // 3) 转成 UIMessageStream 返回给前端（配合 useChat hook）
  return result.toUIMessageStreamResponse();
}
```

**Vercel AI SDK 的节奏：**

* **没有“agent 类”**，而是「一次 `streamText` 调用 = 一轮 agent 推理（含工具调用）」。
* 工具在 `tools` 配置中声明：`{ description, inputSchema (Zod), execute }`。
* 对比另外几个 SDK，更偏“前后端一体的流式聊天框架”。

### 5.4 Google ADK (Python)

Google ADK 这边和 OpenAI Agents 一样，也是「**普通 Python 函数 + 类型注解 + docstring = 工具**」，然后通过 `Agent(tools=[...])` 挂上，再用 `AdkApp`/CLI 跑起来。

```python
# google_adk_weather.py
import asyncio

from google.adk.agents import Agent
from vertexai.agent_engines import AdkApp


# 1) 定义工具函数：get_weather
def get_weather(city: str) -> dict:
    """Retrieves the current weather report for a specified city.

    Args:
        city: The name of the city.

    Returns:
        dict: A dict with 'status' and either 'report' or 'error_message'.
    """
    # TODO: 这里可以调用真实天气 API
    if city.lower() == "tokyo":
        return {
            "status": "success",
            "report": (
                "The weather in Tokyo is sunny with a temperature of 25°C."
            ),
        }
    else:
        return {
            "status": "error",
            "error_message": f"Weather information for '{city}' is not available."
        }


# 2) 定义 Agent：挂上工具
model = "gemini-2.0-flash"

weather_agent = Agent(
    model=model,
    name="weather_agent",
    instruction=(
        "You are a helpful weather assistant. "
        "Use the get_weather tool to fetch city weather, then summarize it. "
        "If the tool reports an error, explain that you cannot get the weather."
    ),
    tools=[get_weather],
)


# 3) 用 AdkApp 在本地流式执行（也就是一个“agent app”）
app = AdkApp(agent=weather_agent)


async def main():
    # 注意：需要提前配置好 GOOGLE_API_KEY / 或 Vertex AI 凭证
    async for event in app.async_stream_query(
        user_id="user-123",
        message="What's the weather in Tokyo right now?",
    ):
        # 事件是一个 dict 序列，最后几条通常是模型总结后的文本
        print(event)


if __name__ == "__main__":
    asyncio.run(main())
```

**Google ADK 的节奏：**

* 工具 = 普通函数 + docstring，ADK 会自动提取说明和参数信息，让 LLM 决定是否调用该函数。
* `Agent` 负责描述“会用哪个 Gemini 模型 + 有哪些工具 + 基本 instruction”。
* `AdkApp` 则是一个「可部署 / 可调试的 agent app 包装器」，支持本地 stream 调用、会话管理、之后一键部署到 Vertex AI Agent Engine。

---

## 6. 总结：从代码看心智模型

把上面四段代码放在一起，你可以大致形成这样的“脑图”：

### 1）工具是怎么声明的？

* **Claude Agent SDK**：
  * 用 `@tool(name, description, input_schema)` 声明 → async 函数接收 `args: dict`，返回 MCP `{"content": [...]}`。
  * 工具挂在 **in-process MCP server** 上，再通过 `ClaudeAgentOptions.mcp_servers + allowed_tools` 暴露给模型。

* **OpenAI Agents SDK**：
  * 用 `@function_tool` 装饰普通 Python 函数，强依赖 Python 类型系统和 Pydantic 模型。
  * 工具直接放进 `Agent(tools=[...])`。

* **Vercel AI SDK**：
  * 工具是 `streamText({ tools: { name: { inputSchema, execute }}})` 里的一个配置项，用 Zod 描述参数。
  * 没有显式的 Agent 类；一次 `streamText` 调用 = 一轮 agent 推理。

* **Google ADK**：
  * 工具 = 普通函数 + docstring + 类型注解；ADK 自动 introspect。
  * 函数放入 `Agent(tools=[...])`，再交给 `AdkApp` 运行。

### 2）“agent 本体”在哪？

* **Claude**：`ClaudeSDKClient + ClaudeAgentOptions` 是“agent harness”，带会话、工具权限、工作目录、Hooks、继续对话等。
* **OpenAI Agents**：`Agent` 类就是 agent 配置；`Runner.run()` 执行一轮。
* **Vercel AI SDK**：没有 Agent 类，**配置对象 + `streamText`** 就是 agent。你想多 agent，就多写几个 route / handler。
* **Google ADK**：`Agent` 是“逻辑配置”，`AdkApp` 是“应用包装 + 运行时（CLI / 本地 / 云端）”。

### 3）跑起来的入口调用是？

* **Claude**：`ClaudeSDKClient(...).query(...)` + `receive_response()`。
* **OpenAI Agents**：`await Runner.run(agent, input="...")`。
* **Vercel AI SDK**：Web 环境：`streamText(...)` 的结果转成 HTTP streaming 响应，前端用 `useChat` 收。
* **Google ADK**：`AdkApp.async_stream_query(user_id=..., message=...)`，本质是“边推理边吐 events”。

---

## 7. 这些 SDK 之间怎么“对齐”理解？

### 维度 1：**处在哪一层？**

* **底层模型客户端**：`openai` / `anthropic` / `google-genai`

  * 负责 **HTTP 请求 + 类型 + 重试/流式**。
* **Agent / 编排 SDK**：Claude Agent SDK、OpenAI Agents SDK、Google ADK

  * 负责 **多轮对话 + 工具调用 + 多 agent 协作 + 状态管理**。
* **应用/UI SDK**：Vercel AI SDK

  * 负责 **统一模型调用接口 + 前端聊天 UI + 流式交互**。

> 快速决策：
>
> * “我只是要调一下模型写个脚本？” → 用各家官方模型 SDK。
> * “我要做一个有工具调用和复杂流程的 agent 系统？” → 用 Agents SDK / ADK / Claude Agent SDK。
> * “我要做一个 Web 产品 / SaaS，有聊天 UI，而且可能换模型提供方？” → AI SDK。

---

### 维度 2：**模型和云是否绑定？**

* **强绑定厂商/云**：

  * `openai`、`anthropic`、`google-genai`：显然。
  * **Claude Agent SDK**：强绑定 Claude Code / Anthropic。([GitHub][9])
  * **ADK**：框架本身模型无关，但官方明显偏向在 Vertex Agent Engine 上 + Gemini + GCP 生态。([Google Cloud Documentation][13])

* **相对中立 / 多提供方**：

  * **Vercel AI SDK**：多 Provider，一行改 `model: "openai/gpt-5"` 就切换。([AI SDK][3])
  * **OpenAI Agents SDK**：官方文档明确说支持 100+ LLM，只要兼容 Chat Completions/Responses 格式即可。([PyPI][1])

---

### 维度 3：**Agent 的“形态”偏哪种？**

* **“工程师/本地开发工具型”**

  * Claude Agent SDK：文件读写、bash、MCP 工具，感觉就像一个“可编程的高级 LSP + 代码 AI”。([GitHub][9])

* **“业务流程 / 多服务编排型”**

  * OpenAI Agents SDK：多个 agent + tool + handoff，适合搭建业务流程链路。([OpenAI GitHub][2])
  * Google ADK：多 agent + Sequential/Parallel/Loop 工作流，配套 Vertex Agent Engine 部署，偏企业架构。([Google GitHub][23])

* **“UI 交互 / 轻 agent”**

  * Vercel AI SDK：有 Agent 概念（如 ToolLoopAgent），但更注重前端交互体验与多 provider 接入。([GitHub][4])

---

## 8. 对开发者：如何“选型 + 建立心智模型”？

你可以把自己放在几个典型场景里：

### 场景 A：我要做一个**智能工程师 / 重构机器人**，主要在本地或 CI 改代码

* **优先考虑**：Claude Agent SDK

  * 它天生为“读写文件 + 跑 bash + 工具调用”设计，和你要做的事情高度对齐。([GitHub][9])
* 需要多模型 / 用 GPT？

  * 可以看第三方 fork（比如你看到的 `claude-agent-sdk-python-for-gpt5` 是在同一 API 上挂 OpenAI Responses）。([GitHub][11])
  * 或者考虑用 **OpenAI Agents SDK + 自己写工具层** 来实现类似能力。

### 场景 B：我要做一个 **SaaS 产品 / Web 应用**，前端是 Next.js / React，后端能换各种模型

* **优先考虑**：Vercel AI SDK

  * 用 Core 统一调用 OpenAI / Claude / Gemini 等。([AI SDK][3])
  * 用 UI Hooks 快速做出流式聊天界面、工具调用 UI 等。([GitHub][4])
* 后端复杂逻辑：

  * 可以在 Node 里轻量利用 AI SDK 的 agent 功能；
  * 或者在 Python 侧用 OpenAI Agents SDK / Google ADK 负责编排，再暴露成 API 给前端。

### 场景 C：我在 **GCP 生态**，要做一个复杂的企业级 agent 系统

* **优先考虑**：Google ADK + Vertex Agent Engine

  * ADK 做 agent 行为 + 工作流设计。([Google GitHub][23])
  * Agent Engine 部署、监控、权限控制、数据接入（BigQuery、AlloyDB 等）。([Google Cloud Documentation][13])
* 仅仅只是调 Gemini 模型：

  * 用 `google-genai` 就够了。([GitHub][5])

### 场景 D：我想构建一个**跨模型、多 agent 的系统**，但不想被某家云锁死

* **优先考虑**：OpenAI Agents SDK

  * Provider‑agnostic，支持 100+ LLM。([PyPI][1])
  * 抽象够薄，不会像某些重框架那样“黑盒”。
* 你可以：

  * 用 Responses API + OpenAI 工具（WebSearch / File / Computer）构建强 agent。([OpenAI][18])
  * 或者使用兼容 Chat Completions 的其他模型，通过 LiteLLM 接入。([PyPI][1])

---

## 9. 一句话总结各家 SDK 的“心智标签”

* **Claude Agent SDK**：
  → *“Claude 驱动的 Python 代码工程师 runtime（本地文件 + bash + MCP 工具）。”*([GitHub][9])

* **Vercel AI SDK（ai‑sdk）**：
  → *“以 Web / 前端为中心的多模型统一调用 + Chat UI 工具箱。”*([AI SDK][3])

* **Google Gen AI SDK (`google-genai`)**：
  → *“Gemini & Vertex AI 模型的官方 Python 客户端。”*([GitHub][5])

* **Google ADK**：
  → *“面向 GCP / Vertex 的多 agent 工作流框架 + 部署基座。”*([Google GitHub][23])

* **OpenAI `openai`**：
  → *“OpenAI 模型（Responses/ChatCompletions）的官方 SDK。”*([GitHub][14])

* **OpenAI Agents SDK (`openai-agents`)**：
  → *“轻量、开源、多模型、多 agent 工作流框架。”*([GitHub][16])

---

[1]: https://pypi.org/project/openai-agents/?utm_source=chatgpt.com "openai-agents · PyPI"
[2]: https://openai.github.io/openai-agents-python/?utm_source=chatgpt.com "OpenAI Agents SDK"
[3]: https://ai-sdk.dev/docs/introduction "AI SDK by Vercel"
[4]: https://github.com/vercel/ai "GitHub - vercel/ai: The AI Toolkit for TypeScript. From the creators of Next.js, the AI SDK is a free open-source library for building AI-powered applications and agents"
[5]: https://github.com/googleapis/python-genai "GitHub - googleapis/python-genai: Google Gen AI Python SDK provides an interface for developers to integrate Google's generative models into their Python applications."
[6]: https://google.github.io/adk-docs/ "Index - Agent Development Kit"
[7]: https://developers.googleblog.com/en/agent-development-kit-easy-to-build-multi-agent-applications/ "Agent Development Kit: Making it easy to build multi-agent applications - Google Developers Blog"
[8]: https://github.com/anthropics/anthropic-sdk-python?utm_source=chatgpt.com "GitHub - anthropics/anthropic-sdk-python"
[9]: https://github.com/anthropics/claude-agent-sdk-python "GitHub - anthropics/claude-agent-sdk-python"
[10]: https://platform.claude.com/docs/en/agent-sdk/python "Agent SDK reference - Python - Claude Docs"
[11]: https://github.com/shalomeir/claude-agent-sdk-python-for-gpt5 "GitHub - shalomeir/claude-agent-sdk-python-for-gpt5: claude agent sdk for GPT5"
[12]: https://vercel.com/blog/ai-sdk-5?utm_source=chatgpt.com "AI SDK 5 - Vercel"
[13]: https://docs.cloud.google.com/agent-builder/agent-development-kit/overview "Overview of Agent Development Kit  |  Vertex AI Agent Builder  |  Google Cloud Documentation"
[14]: https://github.com/openai/openai-python "GitHub - openai/openai-python: The official Python library for the OpenAI API"
[15]: https://pypi.org/project/openai/ "openai · PyPI"
[16]: https://github.com/openai/openai-agents-python?utm_source=chatgpt.com "GitHub - openai/openai-agents-python: A lightweight, powerful framework ..."
[17]: https://openai.github.io/openai-agents-python/tools/?utm_source=chatgpt.com "Tools - OpenAI Agents SDK"
[18]: https://openai.com/index/new-tools-for-building-agents/?utm_source=chatgpt.com "New tools for building agents - OpenAI"

## 扩展阅读

* [The Verge](https://www.theverge.com/ai-artificial-intelligence/800868/anthropic-claude-skills-ai-agents?utm_source=chatgpt.com)

[19]: https://github.com/openai/openai-agents-python/blob/main/examples/basic/tools.py?utm_source=chatgpt.com "openai-agents-python/examples/basic/tools.py at main - GitHub"
[20]: https://openai.github.io/openai-agents-python/ref/tool/?utm_source=chatgpt.com "Tools - OpenAI Agents SDK"
[21]: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-with-tool-calling "AI SDK UI: Chatbot Tool Usage"
[22]: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot "AI SDK UI: Chatbot"
[23]: https://google.github.io/adk-docs/get-started/quickstart/ "Multi-tool agent - Agent Development Kit"
[24]: https://docs.cloud.google.com/agent-builder/agent-engine/develop/adk "Develop an Agent Development Kit agent  |  Vertex AI Agent Builder  |  Google Cloud Documentation"
