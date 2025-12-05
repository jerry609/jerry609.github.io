title: 'Claude Agent SDK 源码实战（安全篇）：我怎么用权限、Hook 和 Sandbox 把 Claude 关在笼子里'
description: '从安全工程和平台治理的视角，拆解 Claude Agent SDK 里的工具权限系统、Hook 回调机制和 Bash Sandbox 配置，结合源码和实战用法，聊聊怎么在让 Claude 真正“动手”时，做到事前可控、事中可观、事后可查。'
publishDate: '2025-12-06'
tags: ['源码分析', 'claude', 'sdk', 'python', 'agent', 'security']
language: 'zh-CN'
---

> 这一篇不再从「整体架构」往下扒，而是换个视角——**安全工程 / 平台治理**。我在翻 Claude Agent SDK 源码的时候，越来越有一个感觉：
>
> 当你让 Claude 不再只是「聊天」，而是去读写文件、执行命令、访问网络的时候，如果没有一套像样的防护和审计，很快就会变成一只拿着 root 权限乱跑的脚本小子。
>
> 本文就集中聊三块：**工具权限系统、Hook 机制、Sandbox 沙箱**。目标很朴素：当你让 Claude 去「动手做事」时，尽量做到——**事前可控、事中可观、事后可查**。

> 如果你还没看前两篇，更推荐按顺序来：
>
> - 第一篇：整体架构和项目结构 —— `claude-agent-sdk-1`
> - 第二篇：控制协议与 Query/Transport 源码地图 —— `claude-agent-sdk-2`
>
> 看完这两篇再回到安全篇，会对权限 / Hook / Sandbox 在整个系统里的位置更有感觉。

## 一、为什么要专门拉一篇讲安全？

如果你只把 Claude 当成一个「问答机器人」，安全面的问题确实不算复杂：更多是 Prompt 过滤和输出合规。但我一开始在玩 Claude Agent SDK 的时候，很快发现一件事：**一旦你开始让它「动手」，风险模型就完全不一样了。**

- Bash / 文件读写 / 编辑代码 / 访问数据库；
- MCP 工具访问外部系统；
- 在多租户环境里为不同用户、项目引入代理能力；

风险就会迅速升级到：

- 访问了本不该访问的文件或数据库；
- 在错误环境里执行了危险命令；
- 误用高危工具（删库、关服务、打内网…）。

在 SDK 这边，Anthropic 是用三层东西来兜住这块风险的：

1. **工具权限系统**：决定「这个工具在什么规则下能用」，偏**策略层**；
2. **Hook 回调机制**：在关键节点拦截、修改、打日志，偏**逻辑层**；
3. **Sandbox 沙箱**：约束 Bash 的文件系统与网络访问，偏**执行环境层**。

这三层叠在一起，才有机会支撑起一个「让模型动手」但又**不会一言不合就删库 / 打内网**的平台。

---

## 二、工具权限系统：谁说了算？

先从最直接的问题切入：**「Claude 说要用一个工具，这个决策最后是谁来拍板？」**

在 SDK 里，这个「拍板的人」就是 `can_use_tool` 回调：

```python
CanUseTool = Callable[
    [str, dict[str, Any], ToolPermissionContext],
    Awaitable[PermissionResult],
]

PermissionResult = PermissionResultAllow | PermissionResultDeny
```

当时我第一次看到这一段定义的时候，其实有点惊喜：它不是简单地给你一个 `bool` 开关，而是直接把「放行 / 拒绝」建模成两个 dataclass，留足了空间去承载后面的一堆安全语义。

### 2.1 PermissionMode：全局的「档位开关」

先看全局层面。源码里通过 `PermissionMode` 定义了几种整体权限模式：

```python
PermissionMode = Literal[
    "default",         # 默认模式
    "acceptEdits",     # 自动接受某些编辑
    "plan",            # 只生成计划，不直接执行
    "bypassPermissions"# 完全绕过权限（极不建议生产用）
]
```

你可以把它当成一辆车的「档位」：

- `default`：严格按照规则和权限回调来；
- `acceptEdits`：偏向「自动接受编辑类操作」，适合开发者一个人玩；
- `plan`：让 Claude 只给出「要做什么」的计划，由人类或其他系统执行；
- `bypassPermissions`：实验或本地调试用，生产环境基本不该出现。

在 `ClaudeAgentOptions` 里，这个东西就是一个普通字段：

```python
options = ClaudeAgentOptions(
    permission_mode="default",
)
```

### 2.2 PermissionResult：这一次到底放不放？

回到「谁拍板」的问题上来。权限回调的返回值被建模为两个 dataclass：

```python
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
```

含义分别是：

- **Allow**：
  - `updated_input`：你可以在放行前改写这次调用的参数；
  - `updated_permissions`：顺便动态更新权限规则（下面单独说）；
- **Deny**：
  - `message`：给 Claude 的反馈信息（为什么不让用）；
  - `interrupt`：是否直接中断当前会话。

这个设计有两个很实用的点（也是我看源码时比较喜欢的一点）：

1. **决策结果是强类型的**（而不是随手 `return {"allow": True}` 那种），IDE 友好、也方便在测试里断言；
2. **把「当前这一次调用」和「未来的长期策略」拆开了**：这一次可以 deny，但顺带给将来加一条规则，也可以反过来。

### 2.3 PermissionUpdate：权限规则可以长在「每一次决策」里

权限系统如果完全静态配置，很快就会遇到两个极端：要么「啥都问你」，要么「一开始就开太大」。`PermissionUpdate` 就是用来给它加一点「长记性」能力的：

```python
@dataclass
class PermissionUpdate:
    type: Literal[
        "addRules", "replaceRules", "removeRules",
        "setMode", "addDirectories", "removeDirectories",
    ]
    rules: list[PermissionRuleValue] | None = None
    behavior: PermissionBehavior | None = None
    mode: PermissionMode | None = None
    directories: list[str] | None = None
    destination: PermissionUpdateDestination | None = None

    def to_dict(self) -> dict[str, Any]:
        ...  # 转成 CLI 协议需要的结构
```

配合 CLI 返回的 `permission_suggestions`，你的权限回调可以玩出这些花样：

- 「先 **ask**，人点同意后，自动 `addRules` 记下这条规则」；
- 给不同的 `destination`（userSettings / projectSettings / localSettings / session）施加不同作用域的更新。

### 2.4 can_use_tool 在 Query 里是怎么走的？

我们顺着 `_internal/query.py` 看一下，在 `Query._handle_control_request` 分支里，针对 `"can_use_tool"` 这个 subtype，大致逻辑是这样的：

```python
if subtype == "can_use_tool":
    permission_request: SDKControlPermissionRequest = request_data
    original_input = permission_request["input"]

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
        # behavior = allow，构造 updatedInput / updatedPermissions
    elif isinstance(response, PermissionResultDeny):
        # behavior = deny，附带 message / interrupt
```

这里有几个安全工程上挺关键的点：

1. **最后一拍板的人在 SDK 这边**，不会被 CLI 的内部逻辑「偷偷改决策」；
2. CLI 更多是把上下文和 `permission_suggestions` 传给你，真正是否采纳、怎么采纳，是在你的 Python 回调里完成的；
3. 如果你不提供 `can_use_tool`，而又暴露了一堆工具出去，本质上就是「完全信任 CLI 自己的权限策略」，开发阶段 OK，生产环境最好别这么干。

### 2.5 一个更接地气的权限回调示例

说了这么多，来一个可以直接 copy 走的小例子：允许读文件，但一律拒绝删除类操作：

```python
from claude_agent_sdk import ClaudeAgentOptions
from claude_agent_sdk.types import (
    PermissionResultAllow,
    PermissionResultDeny,
    ToolPermissionContext,
)

async def can_use_tool(tool_name: str, tool_input: dict, ctx: ToolPermissionContext):
    # 只允许读取，禁止删除类操作
    if tool_name in {"ReadFile", "ListFiles"}:
        return PermissionResultAllow()

    if tool_name in {"DeleteFile", "DangerousCommand"}:
        return PermissionResultDeny(
            message="该工具已被安全策略禁用，请联系管理员。",
            interrupt=False,
        )

    # 其他工具暂时全部拒绝
    return PermissionResultDeny(
        message=f"工具 {tool_name} 未在白名单中。",
        interrupt=False,
    )

options = ClaudeAgentOptions(
    can_use_tool=can_use_tool,
    permission_mode="default",
)
```

在真实环境里，这里就是你接各种「大厂味」东西的地方：

- 审批流（比如某些高危工具需要走工单 / oncall 确认）；
- 按人 / 按项目 / 按环境分层的策略（prod 比 dev 严得多）；
- 日志与审计系统（把每一次工具调用尝试都记下来）。

---

## 三、Hook 机制：在关键路径上插一脚

如果说「权限系统」更像是配置中心里的一堆规则，那 Hook 就更像是你在代码里插的一个个「观察点 / 拦截点」。

### 3.1 Hook 输入与输出的完整结构

在前一篇里我们已经看过 Hook 事件的枚举，这里直接上输入输出类型，结合源码感受一下设计味道：

```python
class PreToolUseHookInput(BaseHookInput):
    hook_event_name: Literal["PreToolUse"]
    tool_name: str
    tool_input: dict[str, Any]

class SyncHookJSONOutput(TypedDict):
    continue_: NotRequired[bool]      # 是否继续（continue_ → continue）
    suppressOutput: NotRequired[bool] # 是否在 transcript 里隐藏输出
    stopReason: NotRequired[str]
    decision: NotRequired[Literal["block"]]
    systemMessage: NotRequired[str]
    reason: NotRequired[str]
    hookSpecificOutput: NotRequired[HookSpecificOutput]

class PreToolUseHookSpecificOutput(TypedDict):
    hookEventName: Literal["PreToolUse"]
    permissionDecision: NotRequired[Literal["allow", "deny", "ask"]]
    permissionDecisionReason: NotRequired[str]
    updatedInput: NotRequired[dict[str, Any]]
```

几个要点：

- Python 里用的是 `continue_` / `async_` 这些避开关键字的名字，`Query` 会在发回 CLI 前通过 `_convert_hook_output_for_cli` 把它们转换成 `continue` / `async`；
- `hookSpecificOutput` 按事件类型细分，比如 `PreToolUse` 可以给出 `permissionDecision` 和 `updatedInput`；
- Hook 回调是 async 的，可以很自然地做网络请求、写日志、拉黑名单等操作。

### 3.2 Hook 在 Query 里面是怎么「串」起来的？

从生命周期角度看，Hook 大致经历这么几步：

1. 启动时，通过 `Query.initialize()` 把你的 `HookMatcher` 配成 CLI 能理解的结构；
2. CLI 在合适的时机发一条 `hook_callback` 控制请求过来；
3. `Query._handle_control_request` 根据 callback_id 找到你注册的 Python 函数，await 一下；
4. 把你返回的 `HookJSONOutput` 转换字段名后丢回 CLI。

源码里第一步大概长这样：

```python
for event, matchers in self.hooks.items():
    for matcher in matchers:
        callback_ids = []
        for callback in matcher.get("hooks", []):
            callback_id = f"hook_{self.next_callback_id}"
            self.hook_callbacks[callback_id] = callback
            callback_ids.append(callback_id)

        hook_matcher_config = {
            "matcher": matcher.get("matcher"),
            "hookCallbackIds": callback_ids,
            "timeout": matcher.get("timeout"),
        }
```

之后当 CLI 想触发某个 Hook 时，会发来 `hook_callback` 控制请求，对应的处理是：

```python
elif subtype == "hook_callback":
    callback_id = hook_callback_request["callback_id"]
    callback = self.hook_callbacks.get(callback_id)
    hook_output = await callback(
        request_data.get("input"),
        request_data.get("tool_use_id"),
        {"signal": None},
    )
    response_data = _convert_hook_output_for_cli(hook_output)
```

站在 SDK 使用者角度看：

- Hook 函数本质就是一个 `async def`，输入是强类型的 `HookInput`，输出 `HookJSONOutput`；
- CLI 再根据你返回的信息决定要不要继续执行、怎么提示用户；
- `matcher` 字符串（例如 `"Bash"` 或 `"Write|MultiEdit|Edit"`）则让你可以非常精细地「只针对某类工具/操作生效」。

### 3.3 一个「审计 + 拉闸」型 Hook 示例

结合前面的权限系统，我们来写一个很常见的场景：

- 把所有工具调用都打到审计日志里；
- 对于高危命令，在真正执行前直接拉闸。

```python
from claude_agent_sdk import ClaudeAgentOptions
from claude_agent_sdk.types import HookMatcher, HookInput, HookContext, HookJSONOutput

async def pre_tool_use_audit(input: HookInput, tool_use_id: str | None, ctx: HookContext) -> HookJSONOutput:
    tool_name = input.get("tool_name")
    tool_input = input.get("tool_input", {})

    # 记录到你的审计系统
    log_tool_call(tool_name, tool_input, session_id=input["session_id"])

    # 对高危命令直接要求人工确认
    if tool_name in {"DeleteFile", "DangerousCommand"}:
        return {
            "continue_": False,
            "stopReason": "危险命令需要人工审批",
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": "高危命令拦截",
            },
        }

    return {"continue_": True}

options = ClaudeAgentOptions(
    hooks={
        "PreToolUse": [
            HookMatcher(
                matcher=None,  # 所有工具
                hooks=[pre_tool_use_audit],
                timeout=5.0,
            )
        ]
    },
)
```

这里 Hook 做的是：

- 记录所有工具调用（审计）；
- 在真正调用前对高危命令「二次拦截」，并附带原因。

和前面的 `can_use_tool` 配合，你可以做到：

- **静态白名单/黑名单**：用权限系统表达；
- **动态风控规则**：用 Hook 表达；
- **运维 & 审计**：Hook 里写日志、打点、接 webhook。

---

## 四、Sandbox：把 Bash 关进笼子里

最后一层是 Sandbox。源码里的注释已经写得很直白：

> Filesystem and network restrictions are configured via permission rules (Read/Edit/WebFetch), **not** via these sandbox settings.

换句话说：

- 真正限制「能不能读/写/访问网络」的是权限规则（Read/Edit/WebFetch）；
- Sandbox 更像是一层「执行环境层面」的隔离：把 Bash 放在一个受控空间里跑，即便权限配置有点疏漏，也不至于直接打到宿主机的敏感面上。

### 4.1 SandboxSettings 关键字段回顾

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

- `enabled`：是否启用 Bash 沙箱（仅在 macOS/Linux 有效）；
- `autoAllowBashIfSandboxed`：启用沙箱后是否默认放行 Bash（通常为 True）；
- `excludedCommands`：e.g. `"git"`、`"docker"` 这类你希望在宿主环境里运行的命令；
- `allowUnsandboxedCommands`：是否允许通过 dangerouslyDisableSandbox 完全绕过沙箱（安全上不建议轻易打开）；
- `network`：允许哪些 Unix Socket、本地端口、代理端口等；
- `ignoreViolations`：哪些路径/主机的违规可以「睁一只眼闭一只眼」。

### 4.2 一个生产友好的 Sandbox 配置示例

```python
from claude_agent_sdk.types import SandboxSettings

sandbox_settings: SandboxSettings = {
    "enabled": True,
    "autoAllowBashIfSandboxed": True,
    "excludedCommands": ["docker"],  # 宿主环境里跑
    "allowUnsandboxedCommands": False,
    "network": {
        "allowUnixSockets": ["/var/run/docker.sock"],
        "allowLocalBinding": True,
    },
    "ignoreViolations": {
        "file": [],
        "network": [],
    },
}

options = ClaudeAgentOptions(
    sandbox=sandbox_settings,
    # 再配合权限规则限制文件/网络访问
)
```

结合前面的权限系统 + Hook，你可以形成这样一套安全姿态：

1. **权限规则**：决定「哪些路径/主机/命令允许访问」；
2. **Sandbox**：即便权限规则配置错了，Bash 也跑不出这个沙箱；
3. **Hook + 审计**：所有关键行为都有日志可查，并能动态拉闸。

---

## 五、收个尾：如果你要做一个自己的「Claude 平台」

如果你准备把 Claude Agent SDK 嵌进自己的平台或产品，这一套「权限 + Hook + Sandbox」大致可以这样落地：

1. **先设计一套内部的「工具分级与风险模型」**：
   - 哪些是只读工具；
   - 哪些是改代码/写文件；
   - 哪些是高危（删库、重启服务、访问内网）。

2. **基于这个模型配置 PermissionMode + 权限规则**：
   - 高危工具默认 deny，只能在审批后临时开放；
   - 不同租户/项目有各自的规则集合；

3. **在 can_use_tool 里接入你自己的用户/项目上下文**：
   - 谁在用？在哪个 workspace？什么时间段？

4. **用 Hook 做风控 & 审计**：
   - PreToolUse：高危命令二次确认、打审计日志；
   - PostToolUse：记录工具执行结果、埋点监控；

5. **为 Bash 工具开启 Sandbox，并定期 review 配置**：
   - 确保 `allowUnsandboxedCommands=False`（除非极特殊场景）；
   - 检查 `excludedCommands` 和 `network` 白名单没有被滥开。

从这几块源码拆下来，其实能看出一件事：Anthropic 是真的把「安全 & 治理」当成一等公民来设计这套 SDK 的：

- 权限系统对齐 TypeScript SDK 的控制协议；
- Hook / 权限 / Sandbox 都有比较认真地做类型建模；
- anyio + Query 的结构也保证了出错时不会静默吞掉，而是能回传到调用方。

如果你已经在把第一篇里的最小示例跑起来了，很推荐你顺手在本地把：

- 一个最简单的 `can_use_tool` 白名单；
- 一个 `PreToolUse` 审计 Hook；
- 一份保守一点的 Sandbox 配置；

加到自己的项目里先跑一圈。等你踩过一两次「差点删错东西」的坑之后，再回头看这篇源码笔记，很多设计上的取舍会变得更有味道。

