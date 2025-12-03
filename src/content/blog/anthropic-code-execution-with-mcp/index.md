---
title: '翻译：Anthropic——用 MCP 实现高效 Agent 的代码执行'
description: '翻译自 Anthropic 工程博客，介绍如何通过代码执行和 MCP 协议提升 Agent 的效率、节省 Token、增强安全性和可扩展性。'
publishDate: '2025-12-03'
tags: ['ai', 'agent', 'MCP', '工程实践', '翻译']
---

> 原文：[Code execution with MCP: Building more efficient agents](https://www.anthropic.com/engineering/code-execution-with-mcp)
> 作者：Adam Jones, Conor Kelly
> 发布日期：2025年11月4日

MCP（Model Context Protocol）是连接 AI Agent 与外部系统的开放标准。传统上，将 Agent 连接到工具和数据需要为每一对组合进行自定义集成，这导致了碎片化和重复劳动，使得难以扩展真正互联的系统。MCP 提供了一个通用协议——开发者只需在 Agent 中实现一次 MCP，就能解锁整个集成生态系统。

自 2024 年 11 月推出 MCP 以来，采用速度非常快：社区已经构建了数千个 [MCP 服务器](https://github.com/modelcontextprotocol/servers)，所有主要编程语言都有可用的 [SDK](https://modelcontextprotocol.io/docs/sdk)，业界已采用 MCP 作为连接 Agent 与工具和数据的事实标准。

如今，开发者经常构建能够访问数十个 MCP 服务器上的数百甚至数千个工具的 Agent。然而，随着连接工具数量的增加，预先加载所有工具定义并通过上下文窗口传递中间结果，会降低 Agent 的速度并增加成本。

在这篇博客中，我们将探讨**代码执行（Code Execution）**如何使 Agent 更高效地与 MCP 服务器交互，在处理更多工具的同时消耗更少的 Token。

## 工具带来的过度 Token 消耗降低了 Agent 效率

随着 MCP 使用规模的扩大，有两种常见模式会增加 Agent 的成本和延迟：

1.  **工具定义（Tool definitions）** 使得上下文窗口过载；
2.  **中间工具结果（Intermediate tool results）** 消耗额外的 Token。

### 1. 工具定义使得上下文窗口过载

大多数 MCP 客户端将所有工具定义直接预加载到上下文中，使用直接工具调用语法将其暴露给模型。这些工具定义可能如下所示：

```text
gdrive.getDocument
     Description: Retrieves a document from Google Drive
     Parameters:
                documentId (required, string): The ID of the document to retrieve
                fields (optional, string): Specific fields to return
     Returns: Document object with title, body content, metadata, permissions, etc.
```

```text
salesforce.updateRecord
    Description: Updates a record in Salesforce
    Parameters:
               objectType (required, string): Type of Salesforce object (Lead, Contact, Account, etc.)
               recordId (required, string): The ID of the record to update
               data (required, object): Fields to update with their new values
     Returns: Updated record object with confirmation
```

工具描述占据了更多的上下文窗口空间，增加了响应时间和成本。在 Agent 连接到数千个工具的情况下，它们在读取请求之前就需要处理数十万个 Token。

### 2. 中间工具结果消耗额外的 Token

大多数 MCP 客户端允许模型直接调用 MCP 工具。例如，你可能会问你的 Agent：“从 Google Drive 下载我的会议记录并将其附加到 Salesforce 线索中。”

模型会进行如下调用：

```text
TOOL CALL: gdrive.getDocument(documentId: "abc123")
        → returns "Discussed Q4 goals...\n[full transcript text]"
           (loaded into model context)

TOOL CALL: salesforce.updateRecord(
			objectType: "SalesMeeting",
			recordId: "00Q5f000001abcXYZ",
  			data: { "Notes": "Discussed Q4 goals...\n[full transcript text written out]" }
		)
		(model needs to write entire transcript into context again)
```

每一个中间结果都必须经过模型。在这个例子中，完整的通话记录流经了两次。对于一个 2 小时的销售会议，这可能意味着要处理额外的 50,000 个 Token。更大的文档甚至可能超出上下文窗口限制，导致工作流中断。

对于大文档或复杂的数据结构，模型在工具调用之间复制数据时也更容易出错。

<img src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F9ecf165020005c09a22a9472cee6309555485619-1920x1080.png&w=1920&q=75" alt="MCP 客户端与服务器和 LLM 的交互" style="display:block; margin:1.5rem auto; max-width:100%; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />

*MCP 客户端将工具定义加载到模型的上下文窗口中，并编排一个消息循环，其中每个工具调用和结果都在操作之间经过模型。*

## 利用 MCP 进行代码执行以提升上下文效率

随着代码执行环境在 Agent 中变得越来越普遍，一种解决方案是将 MCP 服务器作为**代码 API** 而非直接工具调用来呈现。然后，Agent 可以编写代码与 MCP 服务器进行交互。这种方法解决了上述两个挑战：Agent 可以仅加载它们需要的工具，并在将结果传回模型之前在执行环境中处理数据。

实现这一点有多种方法。一种方法是生成所有已连接 MCP 服务器可用工具的文件树。以下是使用 TypeScript 的实现示例：

```text
servers
├── google-drive
│   ├── getDocument.ts
│   ├── ... (other tools)
│   └── index.ts
├── salesforce
│   ├── updateRecord.ts
│   ├── ... (other tools)
│   └── index.ts
└── ... (other servers)
```

然后每个工具对应一个文件，类似于：

```typescript
// ./servers/google-drive/getDocument.ts
import { callMCPTool } from "../../../client.js";

interface GetDocumentInput {
  documentId: string;
}

interface GetDocumentResponse {
  content: string;
}

/* Read a document from Google Drive */
export async function getDocument(input: GetDocumentInput): Promise<GetDocumentResponse> {
  return callMCPTool<GetDocumentResponse>('google_drive__get_document', input);
}
```

我们上面的 Google Drive 到 Salesforce 的例子变成了如下代码：

```typescript
// Read transcript from Google Docs and add to Salesforce prospect
import * as gdrive from './servers/google-drive';
import * as salesforce from './servers/salesforce';

const transcript = (await gdrive.getDocument({ documentId: 'abc123' })).content;
await salesforce.updateRecord({
  objectType: 'SalesMeeting',
  recordId: '00Q5f000001abcXYZ',
  data: { Notes: transcript }
});
```

Agent 通过探索文件系统来发现工具：列出 `./servers/` 目录以查找可用服务器（如 `google-drive` 和 `salesforce`），然后读取它需要的特定工具文件（如 `getDocument.ts` 和 `updateRecord.ts`）以了解每个工具的接口。这使得 Agent 仅加载当前任务所需的定义。这将 Token 使用量从 150,000 个减少到 2,000 个——节省了 98.7% 的时间和成本。

Cloudflare [发布了类似的发现](https://blog.cloudflare.com/code-mode/)，将利用 MCP 进行代码执行称为“Code Mode（代码模式）”。核心见解是一致的：LLM 擅长编写代码，开发者应利用这一优势构建能更高效与 MCP 服务器交互的 Agent。

## 利用 MCP 进行代码执行的优势

利用 MCP 进行代码执行，使 Agent 能够通过按需加载工具、在数据到达模型之前进行过滤以及在单一步骤中执行复杂逻辑，从而更高效地利用上下文。使用这种方法还有安全性和状态管理方面的好处。

### 渐进式披露（Progressive disclosure）

模型非常擅长浏览文件系统。将工具作为文件系统上的代码呈现，允许模型按需读取工具定义，而不是一次性全部读取。

或者，可以在服务器中添加一个 `search_tools` 工具来查找相关定义。例如，在使用上述假设的 Salesforce 服务器时，Agent 搜索“salesforce”并仅加载当前任务所需的那些工具。在 `search_tools` 工具中包含一个详细级别参数，允许 Agent 选择所需的详细程度（例如仅名称、名称和描述，或带有架构的完整定义），也有助于 Agent 节省上下文并高效地找到工具。

### 上下文高效的工具结果

#### 更强大且上下文高效的控制流

循环、条件判断和错误处理可以使用熟悉的代码模式完成，而不是链接单独的工具调用。例如，如果你需要 Slack 中的部署通知，Agent 可以这样写：

```typescript
let found = false;
while (!found) {
  const messages = await slack.getChannelHistory({ channel: 'C123456' });
  found = messages.some(m => m.text.includes('deployment complete'));
  if (!found) await new Promise(r => setTimeout(r, 5000));
}
console.log('Deployment notification received');
```

这种方法比通过 Agent 循环在 MCP 工具调用和睡眠命令之间交替要高效得多。

此外，能够写出并执行条件树也节省了“首 Token 时间（time to first token）”延迟：Agent 可以让代码执行环境来评估 if 语句，而不必等待模型来评估。

#### 上下文高效的数据处理

在处理大型数据集时，Agent 可以在代码中过滤和转换结果，然后再将其返回。考虑获取一个 10,000 行的电子表格：

```typescript
// Without code execution - all rows flow through context
TOOL CALL: gdrive.getSheet(sheetId: 'abc123')
        → returns 10,000 rows in context to filter manually

// With code execution - filter in the execution environment
const allRows = await gdrive.getSheet({ sheetId: 'abc123' });
const pendingOrders = allRows.filter(row => 
  row["Status"] === 'pending'
);
console.log(`Found ${pendingOrders.length} pending orders`);
console.log(pendingOrders.slice(0, 5)); // Only log first 5 for review
```

Agent 看到的只是 5 行，而不是 10,000 行。类似的模式也适用于聚合、跨多个数据源的连接或提取特定字段——所有这些都不会导致上下文窗口膨胀。

### 隐私保护操作

当 Agent 使用 MCP 进行代码执行时，中间结果默认停留在执行环境中。这样，Agent 只会看到你显式记录（log）或返回的内容，这意味着你不希望与模型共享的数据可以在你的工作流中流转，而无需进入模型的上下文。

对于更敏感的工作负载，Agent 框架可以自动对敏感数据进行 Token 化（脱敏）。例如，假设你需要将客户联系方式从电子表格导入 Salesforce。Agent 这样写：

```typescript
const sheet = await gdrive.getSheet({ sheetId: 'abc123' });
for (const row of sheet.rows) {
  await salesforce.updateRecord({
    objectType: 'Lead',
    recordId: row.salesforceId,
    data: { 
      Email: row.email,
      Phone: row.phone,
      Name: row.name
    }
  });
}
console.log(`Updated ${sheet.rows.length} leads`);
```

MCP 客户端在数据到达模型之前拦截数据并对 PII（个人身份信息）进行 Token 化：

```typescript
// What the agent would see, if it logged the sheet.rows:
[
  { salesforceId: '00Q...', email: '[EMAIL_1]', phone: '[PHONE_1]', name: '[NAME_1]' },
  { salesforceId: '00Q...', email: '[EMAIL_2]', phone: '[PHONE_2]', name: '[NAME_2]' },
  ...
]
```

然后，当数据在另一个 MCP 工具调用中共享时，它会通过 MCP 客户端中的查找表进行去 Token 化（还原）。真实的电子邮件地址、电话号码和姓名从 Google Sheets 流向 Salesforce，但从未经过模型。这防止了 Agent 意外记录或处理敏感数据。你还可以利用这一点定义确定性的安全规则，选择数据可以流向何处。

### 状态持久化与技能（Skills）

具有文件系统访问权限的代码执行允许 Agent 跨操作维护状态。Agent 可以将中间结果写入文件，使其能够恢复工作并跟踪进度：

```typescript
const leads = await salesforce.query({ 
  query: 'SELECT Id, Email FROM Lead LIMIT 1000' 
});
const csvData = leads.map(l => `${l.Id},${l.Email}`).join('\n');
await fs.writeFile('./workspace/leads.csv', csvData);

// Later execution picks up where it left off
const saved = await fs.readFile('./workspace/leads.csv', 'utf-8');
```

Agent 还可以将其自己的代码持久化为可重用的函数。一旦 Agent 为某项任务开发了有效的代码，它可以保存该实现以供将来使用：

```typescript
// In ./skills/save-sheet-as-csv.ts
import * as gdrive from './servers/google-drive';
export async function saveSheetAsCsv(sheetId: string) {
  const data = await gdrive.getSheet({ sheetId });
  const csv = data.map(row => row.join(',')).join('\n');
  await fs.writeFile(`./workspace/sheet-${sheetId}.csv`, csv);
  return `./workspace/sheet-${sheetId}.csv`;
}

// Later, in any agent execution:
import { saveSheetAsCsv } from './skills/save-sheet-as-csv';
const csvPath = await saveSheetAsCsv('abc123');
```

这与 [Skills（技能）](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) 的概念紧密相关，即用于提高模型在特定任务上性能的可重用指令、脚本和资源文件夹。向这些保存的函数添加 `SKILL.md` 文件可以创建一个结构化的技能，模型可以引用和使用它。随着时间的推移，这允许你的 Agent 构建一个更高级能力的工具箱，进化出它最有效工作所需的脚手架。

请注意，代码执行引入了其自身的复杂性。运行 Agent 生成的代码需要一个安全的执行环境，具有适当的 [沙盒（sandboxing）](https://www.anthropic.com/engineering/claude-code-sandboxing)、资源限制和监控。这些基础设施要求增加了直接工具调用所避免的运维开销和安全考虑。代码执行的好处——降低 Token 成本、降低延迟和改进工具组合——应与这些实施成本进行权衡。

## 总结

MCP 为 Agent 连接到许多工具和系统提供了基础协议。然而，一旦连接了太多的服务器，工具定义和结果可能会消耗过多的 Token，从而降低 Agent 的效率。

虽然这里的许多问题感觉很新颖——上下文管理、工具组合、状态持久化——但它们在软件工程中都有已知的解决方案。代码执行将这些既定模式应用于 Agent，让它们使用熟悉的编程结构更高效地与 MCP 服务器交互。如果你实施了这种方法，我们鼓励你与 [MCP 社区](https://modelcontextprotocol.io/community/communication) 分享你的发现。

### 致谢

本文由 Adam Jones 和 Conor Kelly 撰写。感谢 Jeremy Fox, Jerome Swannack, Stuart Ritchie, Molly Vorwerck, Matt Samuels 和 Maggie Vo 对本文草稿的反馈。
