---
title: 'Anthropic：Claude 高级工具使用详解'
description: '翻译自 Anthropic 工程博客，介绍 Claude 的三大高级工具使用特性：工具搜索、编程式工具调用和工具使用示例。'
publishDate: '2025-12-03'
tags: ['anthropic', 'claude', 'agent', 'tools', '翻译']
---

> 原文：[Introducing advanced tool use on the Claude Developer Platform](https://www.anthropic.com/engineering/advanced-tool-use)  
> 发布日期：2025年11月24日

## 概述

我们新增了三个 beta 特性，让 Claude 能够动态地发现、学习和执行工具。以下是它们的工作原理。

AI Agent 的未来是模型能够无缝地跨越数百甚至数千个工具工作。一个 IDE 助手需要集成 git 操作、文件操作、包管理器、测试框架和部署管道。一个运维协调器需要同时连接 Slack、GitHub、Google Drive、Jira、公司数据库和数十个 MCP 服务器。

为了[构建有效的 Agent](https://www.anthropic.com/research/building-effective-agents)，它们需要能够使用无限的工具库，而无需预先将所有定义都塞入上下文中。我们关于[使用 MCP 进行代码执行](https://www.anthropic.com/engineering/code-execution-with-mcp)的博客文章讨论了工具结果和定义有时会在 Agent 读取请求之前消耗 50,000+ token。Agent 应该按需发现和加载工具，只保留与当前任务相关的内容。

Agent 还需要能够通过代码调用工具。使用自然语言工具调用时，每次调用都需要完整的推理过程，中间结果会堆积在上下文中，无论它们是否有用。代码天然适合编排逻辑，如循环、条件和数据转换。Agent 需要根据任务灵活选择代码执行和推理。

Agent 还需要从示例中学习正确的工具使用方法，而不仅仅是从 schema 定义中学习。JSON schema 定义了结构上有效的内容，但无法表达使用模式：何时包含可选参数、哪些组合有意义，或者你的 API 期望什么约定。

今天，我们发布三个使这一切成为可能的特性：

- **工具搜索工具（Tool Search Tool）**：允许 Claude 使用搜索工具访问数千个工具，而不消耗其上下文窗口
- **编程式工具调用（Programmatic Tool Calling）**：允许 Claude 在代码执行环境中调用工具，减少对模型上下文窗口的影响
- **工具使用示例（Tool Use Examples）**：提供通用标准来演示如何有效使用给定工具

在内部测试中，我们发现这些特性帮助我们构建了使用传统工具使用模式无法实现的东西。例如，[Claude for Excel](https://www.claude.com/claude-for-excel) 使用编程式工具调用来读取和修改数千行的电子表格，而不会使模型的上下文窗口过载。

基于我们的经验，我们相信这些特性为你用 Claude 构建的东西开辟了新的可能性。

---

## 工具搜索工具（Tool Search Tool）

### 挑战

MCP 工具定义提供了重要的上下文，但随着更多服务器的连接，这些 token 会累积。考虑一个五服务器的设置：

- GitHub: 35 个工具（~26K token）
- Slack: 11 个工具（~21K token）
- Sentry: 5 个工具（~3K token）
- Grafana: 5 个工具（~3K token）
- Splunk: 2 个工具（~2K token）

这是 58 个工具，在对话开始之前就消耗了约 55K token。再加上更多服务器，如 Jira（仅此一项就使用 ~17K token），你很快就会接近 100K+ token 的开销。在 Anthropic，我们看到工具定义在优化前消耗了 134K token。

但 token 成本不是唯一的问题。最常见的失败是错误的工具选择和不正确的参数，特别是当工具有相似的名称时，如 `notification-send-user` vs. `notification-send-channel`。

### 解决方案

工具搜索工具不是预先加载所有工具定义，而是按需发现工具。Claude 只看到它当前任务实际需要的工具。

**传统方法：**
- 预先加载所有工具定义（50+ MCP 工具约 72K token）
- 对话历史和系统提示争夺剩余空间
- 总上下文消耗：工作开始前约 77K token

**使用工具搜索工具：**
- 预先只加载工具搜索工具（约 500 token）
- 根据需要按需发现工具（3-5 个相关工具，约 3K token）
- 总上下文消耗：约 8.7K token，保留了 95% 的上下文窗口

这代表 token 使用减少了 85%，同时保持对完整工具库的访问。内部测试显示，在处理大型工具库时，MCP 评估的准确性显著提高。启用工具搜索工具后，Opus 4 从 49% 提高到 74%，Opus 4.5 从 79.5% 提高到 88.1%。

### 工作原理

工具搜索工具让 Claude 动态发现工具，而不是预先加载所有定义。你向 API 提供所有工具定义，但用 `defer_loading: true` 标记工具，使其可按需发现。延迟加载的工具最初不会加载到 Claude 的上下文中。Claude 只看到工具搜索工具本身，加上任何 `defer_loading: false` 的工具（你最关键、最常用的工具）。

当 Claude 需要特定功能时，它会搜索相关工具。工具搜索工具返回匹配工具的引用，这些引用会扩展为 Claude 上下文中的完整定义。

例如，如果 Claude 需要与 GitHub 交互，它会搜索 "github"，只有 `github.createPullRequest` 和 `github.listIssues` 会被加载——而不是你其他来自 Slack、Jira 和 Google Drive 的 50+ 工具。

这样，Claude 可以访问你的完整工具库，同时只为它实际需要的工具付出 token 成本。

**提示缓存注意事项**：工具搜索工具不会破坏提示缓存，因为延迟工具完全从初始提示中排除。它们只在 Claude 搜索后才添加到上下文中，所以你的系统提示和核心工具定义保持可缓存。

**实现示例：**

```json
{
  "tools": [
    // 包含工具搜索工具（正则、BM25 或自定义）
    {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
    // 标记工具为按需发现
    {
      "name": "github.createPullRequest",
      "description": "Create a pull request",
      "input_schema": {...},
      "defer_loading": true
    }
    // ... 数百个带有 defer_loading: true 的延迟工具
  ]
}
```

对于 MCP 服务器，你可以延迟加载整个服务器，同时保持特定的高使用率工具加载：

```json
{
  "type": "mcp_toolset",
  "mcp_server_name": "google-drive",
  "default_config": {"defer_loading": true}, // 延迟加载整个服务器
  "configs": {
    "search_files": {
      "defer_loading": false  // 保持最常用的工具加载
    }
  }
}
```

Claude 开发者平台开箱即提供基于正则和 BM25 的搜索工具，但你也可以使用嵌入或其他策略实现自定义搜索工具。

### 何时使用工具搜索工具

像任何架构决策一样，启用工具搜索工具涉及权衡。该特性在工具调用之前增加了搜索步骤，因此当上下文节省和准确性提升超过额外延迟时，它提供最佳 ROI。

**适合使用：**
- 工具定义消耗 >10K token
- 遇到工具选择准确性问题
- 构建具有多个服务器的 MCP 驱动系统
- 10+ 个可用工具

**不太有益：**
- 小型工具库（<10 个工具）
- 所有工具在每个会话中频繁使用
- 工具定义很紧凑

---

## 编程式工具调用（Programmatic Tool Calling）

### 挑战

传统工具调用在工作流变得更复杂时会产生两个基本问题：

- **中间结果的上下文污染**：当 Claude 分析 10MB 日志文件以查找错误模式时，整个文件进入其上下文窗口，即使 Claude 只需要错误频率的摘要。当跨多个表获取客户数据时，每条记录都会在上下文中累积，无论相关性如何。这些中间结果消耗大量 token 预算，并可能将重要信息完全推出上下文窗口。

- **推理开销和手动综合**：每次工具调用都需要完整的模型推理过程。收到结果后，Claude 必须"目测"数据以提取相关信息，推理各部分如何组合，并决定下一步做什么——所有这些都通过自然语言处理完成。五个工具的工作流意味着五次推理过程，加上 Claude 解析每个结果、比较值和综合结论。这既慢又容易出错。

### 解决方案

编程式工具调用使 Claude 能够通过代码而不是通过单个 API 往返来编排工具。Claude 不是一次请求一个工具，每个结果都返回到其上下文，而是编写调用多个工具、处理其输出并控制实际进入其上下文窗口的信息的代码。

Claude 擅长编写代码，通过让它用 Python 而不是通过自然语言工具调用来表达编排逻辑，你可以获得更可靠、更精确的控制流。循环、条件、数据转换和错误处理都在代码中明确表达，而不是在 Claude 的推理中隐含。

#### 示例：预算合规性检查

考虑一个常见的业务任务："哪些团队成员超过了他们的 Q3 差旅预算？"

你有三个可用的工具：
- `get_team_members(department)` - 返回带有 ID 和级别的团队成员列表
- `get_expenses(user_id, quarter)` - 返回用户的费用明细项
- `get_budget_by_level(level)` - 返回员工级别的预算限制

**传统方法：**
- 获取团队成员 → 20 人
- 对每个人，获取他们的 Q3 费用 → 20 次工具调用，每次返回 50-100 个明细项（航班、酒店、餐饮、收据）
- 按员工级别获取预算限制
- 所有这些进入 Claude 的上下文：2,000+ 费用明细项（50 KB+）
- Claude 手动汇总每个人的费用，查找他们的预算，将费用与预算限制进行比较
- 更多往返模型，显著的上下文消耗

**使用编程式工具调用：**

Claude 不是每个工具结果都返回给它，而是编写一个 Python 脚本来编排整个工作流。脚本在代码执行工具（沙盒环境）中运行，当需要你的工具结果时暂停。当你通过 API 返回工具结果时，它们由脚本处理，而不是由模型消耗。脚本继续执行，Claude 只看到最终输出。

以下是 Claude 对预算合规性任务的编排代码：

```python
team = await get_team_members("engineering")

# 为每个唯一级别获取预算
levels = list(set(m["level"] for m in team))
budget_results = await asyncio.gather(*[
    get_budget_by_level(level) for level in levels
])

# 创建查找字典：{"junior": budget1, "senior": budget2, ...}
budgets = {level: budget for level, budget in zip(levels, budget_results)}

# 并行获取所有费用
expenses = await asyncio.gather(*[
    get_expenses(m["id"], "Q3") for m in team
])

# 找出超过差旅预算的员工
exceeded = []
for member, exp in zip(team, expenses):
    budget = budgets[member["level"]]
    total = sum(e["amount"] for e in exp)
    if total > budget["travel_limit"]:
        exceeded.append({
            "name": member["name"],
            "spent": total,
            "limit": budget["travel_limit"]
        })

print(json.dumps(exceeded))
```

Claude 的上下文只接收最终结果：超出预算的两到三个人。2,000+ 明细项、中间汇总和预算查找不会影响 Claude 的上下文，将消耗从 200KB 的原始费用数据减少到仅 1KB 的结果。

效率提升非常显著：

- **Token 节省**：通过将中间结果保留在 Claude 的上下文之外，PTC 显著减少了 token 消耗。在复杂的研究任务中，平均使用从 43,588 下降到 27,297 token，减少了 37%。
- **降低延迟**：每次 API 往返都需要模型推理（数百毫秒到数秒）。当 Claude 在单个代码块中编排 20+ 工具调用时，你消除了 19+ 推理过程。API 处理工具执行，而无需每次都返回模型。
- **提高准确性**：通过编写显式的编排逻辑，Claude 比在自然语言中处理多个工具结果时犯的错误更少。内部知识检索从 25.6% 提高到 28.5%；[GIA 基准测试](https://arxiv.org/abs/2311.12983)从 46.5% 提高到 51.2%。

生产工作流涉及混乱的数据、条件逻辑和需要扩展的操作。编程式工具调用让 Claude 以编程方式处理这种复杂性，同时将其重点放在可操作的结果上，而不是原始数据处理上。

### 工作原理

#### 1. 标记工具可从代码调用

将 `code_execution` 添加到工具，并设置 `allowed_callers` 以选择加入工具进行编程执行：

```json
{
  "tools": [
    {
      "type": "code_execution_20250825",
      "name": "code_execution"
    },
    {
      "name": "get_team_members",
      "description": "Get all members of a department...",
      "input_schema": {...},
      "allowed_callers": ["code_execution_20250825"]  // 选择加入编程工具调用
    },
    {
      "name": "get_expenses",
      ...
    },
    {
      "name": "get_budget_by_level",
      ...
    }
  ]
}
```

API 将这些工具定义转换为 Claude 可以调用的 Python 函数。

#### 2. Claude 编写编排代码

Claude 不是一次请求一个工具，而是生成 Python 代码：

```json
{
  "type": "server_tool_use",
  "id": "srvtoolu_abc",
  "name": "code_execution",
  "input": {
    "code": "team = get_team_members('engineering')\n..."  // 上面的代码示例
  }
}
```

#### 3. 工具执行不进入 Claude 的上下文

当代码调用 `get_expenses()` 时，你会收到一个带有 `caller` 字段的工具请求：

```json
{
  "type": "tool_use",
  "id": "toolu_xyz",
  "name": "get_expenses",
  "input": {"user_id": "emp_123", "quarter": "Q3"},
  "caller": {
    "type": "code_execution_20250825",
    "tool_id": "srvtoolu_abc"
  }
}
```

你提供结果，它在代码执行环境中处理，而不是在 Claude 的上下文中。对于代码中的每个工具调用，此请求-响应周期重复。

#### 4. 只有最终输出进入上下文

当代码完成运行时，只有代码的结果返回给 Claude：

```json
{
  "type": "code_execution_tool_result",
  "tool_use_id": "srvtoolu_abc",
  "content": {
    "stdout": "[{\"name\": \"Alice\", \"spent\": 12500, \"limit\": 10000}...]"
  }
}
```

这就是 Claude 看到的全部，而不是沿途处理的 2000+ 费用明细项。

### 何时使用编程式工具调用

编程式工具调用向你的工作流添加了代码执行步骤。当 token 节省、延迟改进和准确性提升非常显著时，这种额外开销才值得。

**最有益的情况：**
- 处理大型数据集，你只需要聚合或摘要
- 运行具有三个或更多依赖工具调用的多步骤工作流
- 在 Claude 看到之前过滤、排序或转换工具结果
- 处理中间数据不应影响 Claude 推理的任务
- 跨多个项目运行并行操作（例如检查 50 个端点）

**不太有益的情况：**
- 进行简单的单工具调用
- 处理 Claude 应该看到并推理所有中间结果的任务
- 运行响应小的快速查找

---

## 工具使用示例（Tool Use Examples）

### 挑战

JSON Schema 擅长定义结构——类型、必需字段、允许的枚举——但它无法表达使用模式：何时包含可选参数、哪些组合有意义，或者你的 API 期望什么约定。

考虑一个支持工单 API：

```json
{
  "name": "create_ticket",
  "input_schema": {
    "properties": {
      "title": {"type": "string"},
      "priority": {"enum": ["low", "medium", "high", "critical"]},
      "labels": {"type": "array", "items": {"type": "string"}},
      "reporter": {
        "type": "object",
        "properties": {
          "id": {"type": "string"},
          "name": {"type": "string"},
          "contact": {
            "type": "object",
            "properties": {
              "email": {"type": "string"},
              "phone": {"type": "string"}
            }
          }
        }
      },
      "due_date": {"type": "string"},
      "escalation": {
        "type": "object",
        "properties": {
          "level": {"type": "integer"},
          "notify_manager": {"type": "boolean"},
          "sla_hours": {"type": "integer"}
        }
      }
    },
    "required": ["title"]
  }
}
```

schema 定义了什么是有效的，但留下了关键问题未回答：

- **格式歧义**：`due_date` 应该使用 "2024-11-06"、"Nov 6, 2024" 还是 "2024-11-06T00:00:00Z"？
- **ID 约定**：`reporter.id` 是 UUID、"USR-12345" 还是只是 "12345"？
- **嵌套结构使用**：Claude 应该何时填充 `reporter.contact`？
- **参数相关性**：`escalation.level` 和 `escalation.sla_hours` 如何与 `priority` 相关？

这些歧义可能导致格式错误的工具调用和不一致的参数使用。

### 解决方案

工具使用示例让你直接在工具定义中提供示例工具调用。你不是仅依赖 schema，而是向 Claude 展示具体的使用模式：

```json
{
  "name": "create_ticket",
  "input_schema": { /* 与上面相同的 schema */ },
  "input_examples": [
    {
      "title": "Login page returns 500 error",
      "priority": "critical",
      "labels": ["bug", "authentication", "production"],
      "reporter": {
        "id": "USR-12345",
        "name": "Jane Smith",
        "contact": {
          "email": "jane@acme.com",
          "phone": "+1-555-0123"
        }
      },
      "due_date": "2024-11-06",
      "escalation": {
        "level": 2,
        "notify_manager": true,
        "sla_hours": 4
      }
    },
    {
      "title": "Add dark mode support",
      "labels": ["feature-request", "ui"],
      "reporter": {
        "id": "USR-67890",
        "name": "Alex Chen"
      }
    },
    {
      "title": "Update API documentation"
    }
  ]
}
```

从这三个示例中，Claude 学会了：

- **格式约定**：日期使用 YYYY-MM-DD，用户 ID 遵循 USR-XXXXX，标签使用 kebab-case
- **嵌套结构模式**：如何构造带有嵌套联系对象的 reporter 对象
- **可选参数相关性**：关键 bug 有完整的联系信息 + 紧急 SLA 的升级；功能请求有 reporter 但没有联系/升级；内部任务只有标题

在我们自己的内部测试中，工具使用示例将复杂参数处理的准确性从 72% 提高到 90%。

### 何时使用工具使用示例

工具使用示例向你的工具定义添加 token，因此当准确性提升超过额外成本时，它们最有价值。

**最有益的情况：**
- 复杂的嵌套结构，其中有效的 JSON 并不意味着正确的使用
- 具有许多可选参数且包含模式很重要的工具
- 具有 schema 未捕获的特定领域约定的 API
- 相似的工具，其中示例可以阐明使用哪一个（例如 `create_ticket` vs `create_incident`）

**不太有益的情况：**
- 具有明显使用的简单单参数工具
- Claude 已经理解的标准格式，如 URL 或电子邮件
- 由 JSON Schema 约束更好处理的验证问题

---

## 最佳实践

构建采取真实世界行动的 Agent 意味着同时处理规模、复杂性和精度。这三个特性共同解决工具使用工作流中的不同瓶颈。以下是如何有效组合它们。

### 分层特性策略

不是每个 Agent 都需要为给定任务使用所有三个特性。从你最大的瓶颈开始：

- 工具定义的上下文膨胀 → 工具搜索工具
- 污染上下文的大型中间结果 → 编程式工具调用
- 参数错误和格式错误的调用 → 工具使用示例

这种聚焦方法让你解决限制 Agent 性能的特定约束，而不是预先增加复杂性。

然后根据需要分层添加其他特性。它们是互补的：工具搜索工具确保找到正确的工具，编程式工具调用确保高效执行，工具使用示例确保正确调用。

### 设置工具搜索工具以更好地发现

工具搜索匹配名称和描述，因此清晰、描述性的定义可以提高发现准确性。

```json
// 好
{
  "name": "search_customer_orders",
  "description": "Search for customer orders by date range, status, or total amount. Returns order details including items, shipping, and payment info."
}

// 坏
{
  "name": "query_db_orders",
  "description": "Execute order query"
}
```

添加系统提示指导，让 Claude 知道有什么可用：

```
You have access to tools for Slack messaging, Google Drive file management, Jira ticket tracking, and GitHub repository operations. Use the tool search to find specific capabilities.
```

保持你的三到五个最常用的工具始终加载，延迟其余的。这平衡了常见操作的即时访问和其他所有内容的按需发现。

### 设置编程式工具调用以正确执行

由于 Claude 编写代码来解析工具输出，清楚地记录返回格式。这有助于 Claude 编写正确的解析逻辑：

```json
{
  "name": "get_orders",
  "description": "Retrieve orders for a customer. Returns: List of order objects, each containing:
  - id (str): Order identifier
  - total (float): Order total in USD
  - status (str): One of 'pending', 'shipped', 'delivered'
  - items (list): Array of {sku, quantity, price}
  - created_at (str): ISO 8601 timestamp"
}
```

选择加入受益于编程编排的工具：
- 可以并行运行的工具（独立操作）
- 安全重试的操作（幂等）

### 设置工具使用示例以提高参数准确性

为行为清晰度制作示例：
- 使用真实数据（真实城市名称、合理价格，而不是 "string" 或 "value"）
- 显示具有最小、部分和完整规范模式的多样性
- 保持简洁：每个工具 1-5 个示例
- 专注于歧义（仅在从 schema 不明显正确使用的地方添加示例）

---

## 开始使用

这些特性在 beta 版中可用。要启用它们，添加 beta 头并包含你需要的工具：

```python
client.beta.messages.create(
    betas=["advanced-tool-use-2025-11-20"],
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    tools=[
        {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
        {"type": "code_execution_20250825", "name": "code_execution"},
        # 你的工具，带有 defer_loading、allowed_callers 和 input_examples
    ]
)
```

详细的 API 文档和 SDK 示例，请参阅：

- 工具搜索工具的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)和 [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/tool_search_with_embeddings.ipynb)
- 编程式工具调用的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)和 [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/programmatic_tool_calling_ptc.ipynb)
- 工具使用示例的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use#providing-tool-use-examples)

这些特性将工具使用从简单的函数调用转向智能编排。随着 Agent 处理跨越数十个工具和大型数据集的更复杂工作流，动态发现、高效执行和可靠调用成为基础。

我们很高兴看到你构建的东西。

---

## 致谢

由 Bin Wu 撰写，Adam Jones、Artur Renault、Henry Tay、Jake Noble、Nathan McCandlish、Noah Picard、Sam Jiang 和 Claude Developer Platform 团队做出贡献。这项工作建立在 Chris Gorgolewski、Daniel Jiang、Jeremy Fox 和 Mike Lambert 的基础研究之上。我们还从整个 AI 生态系统中汲取灵感，包括 [Joel Pobar 的 LLMVM](https://github.com/9600dev/llmvm)、[Cloudflare 的代码模式](https://blog.cloudflare.com/code-mode/)和[代码执行即 MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)。特别感谢 Andy Schumeister、Hamish Kerr、Keir Bradwell、Matt Bleifer 和 Molly Vorwerck 的支持。
