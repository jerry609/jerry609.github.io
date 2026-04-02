---
title: '代码拆解：oh-my-codex 是如何实现 Ralph Loop 的'
description: 'oh-my-codex 里的 Ralph loop 并不是简单的 while true。代码层面对应的是一个由提示词契约、持久化状态、Turn Hook 与后台 Watcher 共同构成的持久化执行框架。'
publishDate: '2026-04-02'
tags: ['Agent', '源码分析', '系统设计', 'oh-my-codex', 'Harness']
language: 'zh-CN'
draft: false
---

# 代码拆解：oh-my-codex 是如何实现 Ralph Loop 的

> Agent 的能力上限由模型决定，稳定性和完成率更多由外层执行框架决定。
> `oh-my-codex` 里的 Ralph Loop 对外表现为“持续执行直到完成”，但实现并不是一个简单的 `while (not_done)`。代码层面对应的是一组分层机制：提示词约束、状态落盘、Turn Hook 和后台 Watcher 共同驱动任务推进、验证与恢复。

---

## 太长不读（TL;DR）

Ralph Loop 在 `oh-my-codex` 里由多层机制叠加形成，并不依赖单个集中调度器：

* **提示词层**：核心行为规则写在 `skills/ralph/SKILL.md` 里（持续推进、必须验证、失败重试、完成后取消）。
* **会话注入层**：`omx ralph` 启动时，生成当前 session 专属的 `AGENTS.md`，再通过 `model_instructions_file` 注入到 Codex。
* **状态机层**：所有 phase、iteration、完成状态都写进 `.omx/state/{scope}/ralph-state.json`，并受严格 contract 校验。
* **Turn Hook 层**：每轮结束自动递增 iteration，活跃阶段下碰到上限就自动扩容。
* **Fallback Watcher 层**：会话停滞时，后台检查状态和 HUD；满足恢复条件时，再向 tmux pane 注入 `Ralph loop active continue`。

实现上，它是一个 **prompt-driven** 的持久化执行回路，由状态机、Turn Hook 和 Watcher 共同维持推进。

```text
Prompt Contract + Session Injection + Persisted State + Turn Hook + Stall Recovery Watcher
```

分析 Ralph 时，需要先区分三个不同粒度：**Ralph loop、iteration、review 并不是同一个层级。**

- `Ralph loop` 指的是从启动、执行、验证、修复到最终收尾的完整持久化工作流
- `iteration` 指的是运行时每个 agent turn 的离散推进单位，由 `notify-hook` 在 turn-complete 时递增
- `review` 指的是分层出现的质量闸门，不会在每个低级动作后都做同一种审查

后面的拆解会围绕这三个粒度展开。

---

## 一、实现形态不是一个集中式 while true

从命名出发，最先联想到的通常是下面这种实现：

```ts
while (!done) {
  plan();
  act();
  verify();
}
```

`oh-my-codex` 的实现并不是这样。它把“循环”拆成多个分层模块：

| 层级        | 主要文件                                     | 职责                     |
| --------- | ---------------------------------------- | ---------------------- |
| 提示词层      | `skills/ralph/SKILL.md`                  | 定义 Ralph 该怎么工作         |
| CLI 启动    | `src/cli/ralph.ts`                       | 启动、写状态、注入说明            |
| 生命周期      | `src/modes/base.ts`                      | 通用 mode 管理             |
| 状态契约      | `src/ralph/contract.ts`                  | phase 和状态合法性校验         |
| 持久化       | `src/ralph/persistence.ts`               | PRD、progress ledger 等  |
| Turn Hook | `src/scripts/notify-hook.ts`             | 每轮结束更新 iteration 和 HUD |
| Watcher   | `src/scripts/notify-fallback-watcher.ts` | 停滞时的恢复推进               |

实现选择是：不把持续推进完全交给模型内部上下文，而是由外层系统在不同边界点持续修正执行状态。

---

## 二、提示词层：`SKILL.md` 定义行为契约

Ralph 的第一入口落在 `skills/ralph/SKILL.md`，而不是 TypeScript 源码。

这个文件直接定义了 Ralph 的执行规则：它是一个 persistence loop，要求任务完成前必须拿到 fresh verification evidence，必须经过 architect 验证；被 reject 后进入修复与再验证；收尾时要求主动执行 `/cancel`。

phase 切换也写在里面：执行时是 `executing`，验证时是 `verifying`，修复时是 `fixing`，完事了才是 `complete`。

也就是说，Ralph 的循环语义首先被编码成一份文字协议。对应的 harness 入口落在 prompt contract，而非运行时分支判断。

---

## 三、启动链：`omx ralph` 如何构造运行时

入口在 `src/cli/ralph.ts`，但完整启动链可以拆成“Ralph 预备阶段”和“Codex 运行阶段”两段：

```ts
ensureCanonicalRalphArtifacts(cwd)
readApprovedExecutionLaunchHint(...)
resolveAvailableAgentTypes(cwd)
buildFollowupStaffingPlan(...)
startMode('ralph', task, 50)
writeRalphSessionFiles(...)
updateModeState(...)
launchWithHud(...)
```

### 1. 预备阶段：先把工件、约束和编排写全

`src/cli/ralph.ts` 启动时先补齐 Ralph 所依赖的运行前置条件，而不是直接把任务字符串交给模型：

* `ensureCanonicalRalphArtifacts(cwd)`：确保 canonical PRD 和 canonical progress ledger 存在，并处理 `.omx/prd.json`、`.omx/progress.txt` 的单向迁移。
* `readApprovedExecutionLaunchHint(...)`：读取通过 ralplan 产出的批准执行提示。
* `resolveAvailableAgentTypes(cwd)` + `buildFollowupStaffingPlan('ralph', task, availableAgentTypes)`：先算出可用角色表和 Ralph 的 staffing plan。
* `startMode('ralph', task, 50)`：创建 Ralph mode，初始状态就是 `active=true`、`iteration=0`、`max_iterations=50`、`current_phase='starting'`。
* `writeRalphSessionFiles(...)`：在 `.omx/ralph/` 下生成 `session-instructions.md` 和 `changed-files.txt`，把 Ralph 独有的附加约束写出来。
* `updateModeState('ralph', ...)`：把 `canonical_progress_path`、`canonical_prd_path`、`available_agent_types`、`staffing_summary`、`staffing_allocations`、`native_subagent_policy` 等信息一并写进 Ralph state。

启动完成后，Ralph 已经扩展成一个带着工件路径、角色分工、子 agent 策略和验证约束的运行上下文，不再只是单一任务字符串。

### 2. 运行阶段：通过 session-scoped `AGENTS.md` 注入模型说明

关键执行链在 `launchWithHud()` 内部，对应三段式流程：

```ts
preLaunch(...)
runCodex(...)
postLaunch(...)
```

三段职责分别如下：

* `preLaunch(...)`：调用 `generateOverlay(...)` 生成 runtime overlay，再通过 `readLaunchAppendInstructions()` 读取 `OMX_RALPH_APPEND_INSTRUCTIONS_FILE` 指向的 Ralph appendix。
* `writeSessionModelInstructionsFile(...)`：把 `CODEX_HOME/AGENTS.md`、项目根目录 `AGENTS.md`、runtime overlay、Ralph appendix 组合成一个 session 级说明文件，路径是 `.omx/state/{scope}/AGENTS.md`。
* `preLaunch(...)` 的后半段还会写 session state、重置 metrics、拉起 `notify-fallback-watcher`，并发出生命周期通知。
* `runCodex(...)`：直接调用 Codex CLI，但调用前会把 session 级说明文件注入成 `model_instructions_file=".../AGENTS.md"`，同时设置 `OMX_SESSION_ID`，然后再按 tmux/HUD/直接运行三种路径之一阻塞启动。
* `postLaunch(...)`：Codex 退出后再清理 session 级 `AGENTS.md`、归档 session，并做 mode cleanup。

因此，`omx ralph` 的实现方式是先构造 session-scoped runtime，再把 Codex 启动到这个 runtime 里；实现重点不在“调用 Codex 并附带一段 prompt”。

---

## 四、状态机：状态落盘、归一化与终态约束

Ralph 的状态管理由 `src/ralph/contract.ts`、`src/modes/base.ts` 和 `src/mcp/state-server.ts` 三层共同实现。

定义的 phase 很固定：

```
starting → executing → verifying → fixing → complete / failed / cancelled
```

### 1. `contract.ts` 负责定义合法状态域

`validateAndNormalizeRalphState()` 会强校验：phase 是否合法、iteration 是否整数、max_iterations 是否合理、终态必须 `active=false`、时间戳必须是标准 ISO8601 等。

除了字段校验，这里还负责 phase 归一化。比如：

* `verify` / `verification` 会被归一化成 `verifying`
* `fix` 会被归一化成 `fixing`
* `completed` 会被归一化成 `complete`
* `cancel` 会被归一化成 `cancelled`

终态也有明确约束。只要 `current_phase` 进入 `complete`、`failed`、`cancelled` 这样的 terminal phase，contract 就要求 `active=false`，并在必要时自动补上 `completed_at`。

### 2. `base.ts` 负责把 start / update / cancel 都收进同一套规范

`startMode('ralph', ...)` 创建的是一个带默认值的 Ralph state，不是松散 JSON：

* `active: true`
* `iteration: 0`
* `max_iterations: 50`
* `current_phase: 'starting'`
* `started_at: now`

随后，无论是 `updateModeState(...)` 还是 `cancelMode('ralph')`，都会再走一次 Ralph contract。`cancelMode(...)` 的处理方式也不是简单删文件，流程是先把状态推进到：

* `active: false`
* `current_phase: 'cancelled'`
* `completed_at: now`

### 3. `state-server.ts` 负责把外部 `state_write` 也拉回规范

模型或 skill 通过 MCP 调 `state_write` 时，也不是“传什么写什么”。`state-server.ts` 的写入链路更接近下面这条归约流程：

```ts
read previous state
-> merge new fields
-> validateAndNormalizeRalphState(...)
-> ensureCanonicalRalphArtifacts(...)
-> atomic write
```

这里有两个关键细节：

* 如果 phase alias 被归一化，state 里还会留下 `ralph_phase_normalized_from` 这类痕迹，说明外部传入过别名。
* 每次 Ralph state 写入时，都会同步执行 `ensureCanonicalRalphArtifacts(...)`，确保 PRD / progress 这些基础工件没有漂掉。

因此，Ralph 的状态机更接近“事件驱动的状态归约器”，而不是单点 `switch-case`。推进可以发生在不同入口，但落盘必须经过同一份 contract。

---

## 五、Turn Hook：回合归约与控制层

`src/scripts/notify-hook.ts` 是 Ralph loop 最像“运行时控制面”的地方。文件开头已经把调用方式写得很清楚了：Codex CLI 会通过 `notify` 配置在每个 agent turn 结束后调用它，并把 JSON payload 作为最后一个 argv 参数传进来。

这意味着 Ralph 的“循环”由外部程序在每轮回合结束后接手做收尾和状态归约，并非完全依赖模型在上下文中自发维持。

### 1. 先解析 payload，再做 turn 去重

hook 进来后的第一步先解析这轮 turn 的 `cwd`、`session_id`、`thread_id`、`turn_id`，随后再更新 Ralph 状态。接着它会把 `thread + turn + eventType` 写进 `notify-hook-state.json` 做 recent-turn dedupe，避免 native notify 和 fallback watcher 对同一轮重复处理。

这一步直接决定事件边界是否稳定。一旦 turn 被重复处理，后面的 iteration 递增、tmux 注入、leader nudge、team dispatch 都会被重复触发。

### 2. iteration 只是表层，真正完成的是 turn-complete 归约

最显眼的是这几行：

```ts
state.iteration = (state.iteration || 0) + 1
state.last_turn_at = nowIso
```

这已经说明 Ralph 的 iteration 不属于某个 while 循环里的局部计数器；它对应的是 turn 完成后离散推进的 hook 事件。

继续往下看，能发现它不只做 `+1`。它还会附带处理几类回合收尾工作：

* 把 turn 的输入预览、输出预览写进 `.omx/logs/turns-*.jsonl`
* 记录 leader / native subagent thread 的活跃轨迹，交给 `src/subagents/tracker.ts`
* 更新 `.omx/state/hud-state.json`，刷新 `last_turn_at`、`turn_count`、`last_agent_output`
* 更新 metrics、token usage、quota usage，让 HUD 和后续诊断层看到统一的运行面

从实现职责看，`notify-hook` 可以视为一个 turn-complete reducer：它把这一轮会话里散落的事实统一折叠回状态和日志。

### 3. auto-expand 负责扩展执行窗口

`notify-hook.ts` 里定义了一组 Ralph 活跃 phase：`starting`、`executing`、`verifying`、`fixing`。只要 Ralph 还在这些 phase 里，即使 `iteration >= max_iterations`，它也不会像普通 mode 一样进入完成态，而是直接：

```ts
state.max_iterations = maxIterations + 10
state.max_iterations_auto_expand_count += 1
state.max_iterations_auto_expanded_at = nowIso
```

这里的自动扩展机制把“继续执行”从提示词层约束，下沉成了 hook 层的运行时行为。

### 4. hook 还是 tmux、team、nudge 的统一分发层

如果只把 `notify-hook` 看成给 Ralph 做 `+1` 的小脚本，就会丢掉这一层的大部分职责。文件开头已经把逻辑拆成 `payload-parser`、`state-io`、`log`、`auto-nudge`、`tmux-injection`、`team-dispatch`、`team-leader-nudge`、`team-worker` 等子模块，对应的是一个回合边界上的统一分发层。

它还会在 turn 结束后继续处理：

* `handleTmuxInjection()`，把需要的提示注入 tmux pane
* `drainPendingTeamDispatch()`，消费 team dispatch 队列
* `maybeNudgeTeamLeader()`，在 leader stale 时补一把提醒
* `updateWorkerHeartbeat()`、`maybeNotifyLeaderWorkerIdle()`，维护 worker heartbeat 和空闲通知
* `maybeAutoNudge()`，遇到 stall pattern 时追加自动 nudges

因此，`notify-hook` 在整个会话里承担的是 turn 边界上的小型控制面职责，不应仅被视为附带计数器。Ralph loop 只是这套控制面里最核心的一条主线。

---

## 六、Fallback Watcher：停滞恢复层

`src/scripts/notify-fallback-watcher.ts` 对应的是“正常 turn-complete 路径没有发生时，系统如何恢复推进”。它以 CLI 拉起的 detached 后台进程形式运行，而非一次性回调：带着 `--cwd`、`--notify-script`、`--parent-pid` 启动，把 pid 写进 `.omx/state/notify-fallback.pid`，然后持续轮询。

这一层对应的是 Ralph 的后台恢复平面。职责聚焦在会话停滞时判断系统是否仍满足恢复执行条件，并不负责替模型做决策。

### 1. 先判断是否处于“活动但无进展”状态

watcher 每个 tick 的第一步不是发 `continue`；它会先确认当前是否仍有一个 active Ralph：session 是否存活、phase 是否已经 terminal、parent 进程是否还在、pane 是否仍有可用空间。

第一步判断聚焦于“当前会话是否仍然属于可恢复的活动 Ralph 实例”，而非直接决定“是否发送 continue”。

### 2. 注入 continue 之前的三个判定条件

执行 continue 注入之前，至少会经过三层判定。

第一层是**进展是否真的陈旧**。watcher 会读 HUD / state 里的最近进展时间，没过陈旧窗口就不动。

第二层是**冷却和并发保护**。它有 `RALPH_CONTINUE_CADENCE_MS = 60000` 这样的节流，也会把最近一次 steer 时间写进共享 timestamp，再配上 `ralph-continue-steer.lock` 这样的单例 lock，避免多个 watcher 抢着推同一条 continue。

第三层是**pane 是否真的可注入**。它会先走 `checkPaneReadyForTeamSendKeys()`，只有 pane 仍可用、当前命令状态允许注入，才会实际执行：

```ts
emitRalphContinueSteer(paneId, RALPH_CONTINUE_TEXT)
```

最后打进去的才是那句固定提示：

```text
Ralph loop active continue
```

### 3. `watcher` 采用 fail-closed 的 fallback control plane 设计

HUD progress 缺失不发，HUD progress 非法不发，pane 丢了不发，terminal phase 不发，cooldown 没过不发。除此之外，它还会附带处理 pending team dispatch、检查 leader 是否 stale、必要时做 leader nudge，甚至在 HUD 长时间没新 turn 时，合成一条 stalled-turn payload 再喂回 `maybeAutoNudge()`。

因此，这一层采用的是 fail-closed 恢复面设计，不等同于“后台定时触发器”。只有当 Ralph 仍然处于活动态、系统也确认运行现场允许恢复时，才会执行注入。

---

## 七、为什么这一层会用 TypeScript

从脚本形态看，hook / watcher 似乎可以用 shell 命令拼接实现；但 `notify-hook.ts` 和 `notify-fallback-watcher.ts` 实际上已经演变成与 CLI 主体并列的运行时模块。

**第一，它处理的是结构化状态，不只是几行 stdout。** `notify-hook` 输入是 JSON payload，输出是 `ralph-state.json`、`hud-state.json`、`notify-hook-state.json`、日志和 metrics；watcher 还维护 pid file、lock file、共享 timestamp、`RalphContinueSteerState` 这类状态文档。主要风险不在少打一条命令，而在字段名、phase 语义和时间戳格式出现漂移。TypeScript 能把这层 contract 固定住。

**第二，它需要和主程序共享模块。** 这两层脚本直接 import 了 `subagents/tracker`、`hooks/session`、`tmux-hook-engine`，以及 `notify-hook/*` 下面一整串子模块。换成 shell，很多逻辑会退化成字符串拼接和重复实现；换成另一套独立语言，又会把 contract 和 helper 拆成两份。

**第三，它要跨平台，还要作为正式产物分发。** `oh-my-codex` 整个仓库本来就是 Node + TypeScript 工程，`package.json` 里用 `tsc` 构建，再把 `src/scripts/*.ts` 编译到 `dist/scripts/*.js` 供 CLI 直接调用。开发态拿到类型和模块化，运行态仍然是可执行脚本，这比 shell 更适合 Windows、macOS、Linux 混跑的场景。

**第四，它的复杂度已经值得被当成“程序”维护。** 从文件头那串 `payload-parser`、`state-io`、`auto-nudge`、`tmux-injection`、`team-dispatch`、`team-worker` 就能看出来，这一层已经超出了附属胶水的范围，更接近一个小型控制面。既然是控制面，用 TypeScript 把它纳入主仓统一的构建、测试、发布链路，本身就是更稳妥的工程选择。

因此，交付形式虽然是 hook 脚本，但在 `oh-my-codex` 里实际承担的是“以脚本形态交付的 TypeScript 子系统”职责。

---

## 八、PRD、progress、state 每轮如何变化

一个常见误读是把 Ralph 理解成“每轮都在重写 PRD”。从 `src/ralph/persistence.ts` 这条链路看，实际情况并不是这样。

### 1. PRD 是基线工件，不是默认每轮重写的活动文档

`ensureCanonicalRalphArtifacts(...)` 做的事情主要有三类：

* 确保 `.omx/plans/prd-*.md` 这样的 canonical PRD 存在
* 确保 `.omx/state/{scope}/ralph-progress.json` 这样的 canonical progress ledger 存在
* 如果发现 `.omx/prd.json` 或 `.omx/progress.txt` 这样的 legacy 文件，就做一次单向迁移

这意味着，PRD 在 Ralph 里承担的是**需求与验收基线**，而不是 turn 级别的实时日志。`--prd` 模式下，Ralph 会先跑一次 `$deep-interview --quick`，然后创建 PRD 和初始 progress ledger，把 user stories、acceptance criteria 这些内容固定下来。进入 loop 之后，系统默认持续变化的并不是 PRD markdown 本身。

### 2. 真正每轮变化的，是 progress / state / HUD / log

把核心工件拆开看，会更清楚：

| 工件 | 典型路径 | 角色 | 变化节奏 |
| :-- | :-- | :-- | :-- |
| canonical PRD | `.omx/plans/prd-*.md` | 需求基线、故事拆分、验收锚点 | 启动时创建或迁移；不会被 Ralph core 默认每 turn 重写 |
| progress ledger | `.omx/state/{scope}/ralph-progress.json` | 结构化进度账本 | 会被持续更新，最明确的自动写入是 visual feedback |
| mode state | `.omx/state/{scope}/ralph-state.json` | phase、iteration、active、staffing 等运行状态 | turn 完成、phase 迁移、cancel/complete 时更新 |
| HUD state | `.omx/state/hud-state.json` | 操作面板视图 | 基本每 turn 刷新 |
| turn logs | `.omx/logs/turns-*.jsonl` | append-only 运行轨迹 | 每 turn 追加 |
| subagent tracking | `.omx/state/subagent-tracking.json` | 子线程收口依据 | 子 agent 活跃时持续变化 |

如果把“每轮 PRD 如何变更”理解成“Ralph core 是否会自动改写 PRD 文本”，代码里的答案更接近**不会**。更准确的描述是：PRD 负责稳定需求面，progress/state/HUD/log 负责承接轮次推进。

### 3. 每轮推进时，哪几个面真的会动

一次典型的 Ralph turn 收尾后，变化面通常是下面这些：

1. `notify-hook` 把 `iteration` 加一，写回 `last_turn_at`，必要时自动扩容 `max_iterations`。
2. `hud-state.json` 刷新 `turn_count`、`last_agent_output`、token / quota / metrics。
3. `turns-*.jsonl` 追加这一轮输入预览、输出预览和 thread / turn 元数据。
4. `subagent-tracking.json` 更新 leader 与 native subagent 的活跃线程。
5. 如果这一轮涉及视觉判定，`recordRalphVisualFeedback(...)` 会把 `score`、`verdict`、`differences`、`suggestions` 写进 `ralph-progress.json`。

因此，从工件视角理解 Ralph，应该分成两层：

* PRD 是“这件事最终应该做成什么”的基线。
* progress / state / HUD / log 是“这件事现在推进到哪里了”的运行账本。

---

## 九、完整 Ralph 循环的两层结构：workflow 与 skill 组合

仅观察 `notify-hook` 或 watcher 时，Ralph 很容易被理解成“停滞后继续推”的循环器。但从 `skills/ralph/SKILL.md` 往回看，结构实际上分成两层：

1. **workflow 步骤层**
2. **skill / mechanism 组合层**

这两层合在一起，才构成一个完整的 Ralph loop。

### 1. workflow 步骤层：一个完整 Ralph 循环怎么走

`SKILL.md` 里给出的主流程可以整理成下面这一条链：

1. **预取上下文**：先建 context snapshot，必要时先补 brownfield facts。
2. **读取已有进度**：检查 TODO、上轮 state、已有工件和 context snapshot。
3. **继续未完成工作**：从中断点接着做，而不是重新起题。
4. **并行委派**：把实现、查证、回归、签收等任务分给不同 agent。
5. **长任务后台化**：安装、构建、测试等长耗时任务尽量放后台。
6. **可视任务闸门**：有截图或视觉参考时，先跑视觉判定再进入下一轮编辑。
7. **新鲜验证**：执行 test、build、lint，并且真的读输出。
8. **Architect 验证**：至少完成一次 architect sign-off，Ralph 的最低门槛也是 STANDARD。
9. **Deslop**：对本轮改动过的文件跑 `ai-slop-cleaner`。
10. **回归复验**：deslop 后重新跑验证，确认没有回归。
11. **收尾或回退**：通过则 `/cancel` 清理状态；不通过则进入 `fixing`，再返回验证波次。

这里需要注意的是，workflow 会在执行波和验证波之间往复，而非单次直线。常见节奏如下：

```text
starting
  -> executing
  -> verifying
  -> fixing
  -> verifying
  -> fixing
  -> verifying
  -> complete
```

在 workflow 层面，一个 Ralph loop 通常会包含多轮执行波次和多轮验证波次。`fixing <-> verifying` 的往复就是 Ralph 的核心语义。

### 2. skill / mechanism 组合层：这一条链靠什么拼起来

同一个 Ralph loop 也不只依赖 `$ralph` 一个 skill 独立完成；整体由若干 skill 和运行时机制共同组成：

| 组件 | 作用 |
| :-- | :-- |
| `$ralph` | 主 skill，本身就是循环控制器 |
| `$ultrawork` | Ralph 明确包了一层 ultrawork，用来承接并行执行 |
| `$deep-interview --quick` | 需求不清、或者 `--prd` 时补上下文 |
| `$visual-verdict` | 视觉任务时，进入下一次编辑前先判图 |
| `$web-clone` | URL 克隆类任务下，替代 `$visual-verdict` 跑完整视觉链 |
| `architect` | 最终质量闸门，至少要有一次 architect sign-off |
| `oh-my-codex:ai-slop-cleaner` | 第 7.5 步固定要跑的 deslop pass |
| `$cancel` | 通过后清理 Ralph state，关闭 loop |

再从代码链路看一次，会更清楚：

* 启动：`skills/ralph/SKILL.md` + `src/cli/ralph.ts`
* 状态推进：`src/modes/base.ts` + `src/ralph/contract.ts` + `src/mcp/state-server.ts`
* 每轮继续推进：`src/scripts/notify-hook.ts`
* 卡住兜底：`src/scripts/notify-fallback-watcher.ts`
* 工件沉淀：`src/ralph/persistence.ts`
* 子 agent 收口：`src/subagents/tracker.ts`

所以，Ralph 可以理解为**一条 workflow 和一组 skills / runtime mechanisms 的组合产物**，并不是“一个 skill + 一个 while true”。

### 3. 编排在启动前生成，并写入 state

`buildFollowupStaffingPlan('ralph', task, availableAgentTypes)` 返回的不是一句抽象建议；它直接构成 Ralph 后续编排的骨架。

默认的 Ralph staffing 至少会预留三条 lane：

* `primary implementation lane`
* `evidence + regression checks`
* `final architecture / completion sign-off`

如果 worker 容量更高，还会继续补 `parallel specialist follow-up capacity`。这些编排结果会在启动阶段被写进 Ralph state：

* `available_agent_types`
* `staffing_summary`
* `staffing_allocations`
* `native_subagents_enabled`
* `native_subagent_tracking_path`
* `native_subagent_policy`

这使得 Ralph 的编排流程变成“先确定 roster 和责任分工，再在运行时持续跟踪线程是否收口”，而不是运行中临时决定是否并行。

`src/subagents/tracker.ts` 的作用也在这里。只要还有活跃 native subagent threads 没有 drain 完，Ralph 就不应过早进入 completion path。编排的重点不只是能否并行，而是能否在收尾时确认所有支线都已经回收。

---

## 十、停止条件：何时结束，何时继续

Ralph loop 的结束条件在实现上不是“模型输出了 done”，也不是“测试曾经跑绿一次”。真正的结束需要同时满足**工作流结束条件**和**状态机结束条件**。

### 1. 工作流结束条件

从 `SKILL.md` 的 Final Checklist 和执行步骤看，至少要满足下面这些条件：

* 原始任务要求全部满足，没有 scope reduction
* 没有 pending 或 in_progress 的 TODO 项
* fresh test run output 证明测试通过
* fresh build output 证明构建成功
* 受影响文件上的诊断错误清零
* architect verification 通过，且最低也是 STANDARD
* `ai-slop-cleaner` 已跑完，除非显式使用 `--no-deslop`
* deslop 之后的回归验证再次通过
* 活跃 native subagent threads 已经 drain 完，不再有未收口的并行支线

少任何一项，Ralph 都仍处在完成候选阶段，还不能结束。

### 2. 状态机结束条件

从 `src/ralph/contract.ts` 和 `state-server.ts` 这一层看，真正收口时还要满足状态机层面的要求：

* `current_phase` 进入 `complete`、`failed` 或 `cancelled` 这样的 terminal phase
* terminal phase 下 `active` 必须是 `false`
* `completed_at` 是合法时间戳
* 最后执行 `/cancel`，把 Ralph 的 mode state 做清理

这也意味着，**完成候选** 和 **真正结束** 之间还隔着一步。  
完成候选只表示“当前这一轮验证通过，具备进入终态的资格”；真正结束必须在 architect sign-off 和 cleanup 之后才成立。

### 3. 为什么 `max_iterations` 触顶不代表结束

从 `notify-hook.ts` 可以看到，只要 Ralph 还在 `starting / executing / verifying / fixing` 这些活跃 phase 里，`iteration >= max_iterations` 时不会结束，而是自动扩容。

也就是说，Ralph 的结束条件不取决于“次数到了”，决定因素是“质量闸门和状态闸门都过了”。和普通重试循环相比，它更接近按验收条件停机。

### 4. 什么时候继续，什么时候停止

从实现上看，Ralph 的继续条件不取决于“模型还有话要说”，决定条件是下面这些约束仍然成立：

* mode 仍然 `active=true`
* `current_phase` 仍然处在非终态，通常是 `starting / executing / verifying / fixing`
* workflow checklist 还没有满足，或者 fresh verification / architect sign-off 还不完整
* regression 失败、architect reject、visual verdict 不达标时，还需要回到 `fixing`
* native subagent 线程还没收口，主线程不能抢先宣告完成
* watcher 判断会话虽然陈旧，但仍是可恢复状态，且 pane 允许安全注入 `continue`

停止条件则刚好相反：

* phase 已经进入 `complete`、`failed`、`cancelled`
* `active=false`
* 必要的 `completed_at`、cleanup、state cancel 都已经成立

因此，Ralph 的“继续”是状态机和验收约束共同决定的，而不是一句 continue 提示词单独决定的。

---

## 十一、循环粒度：为什么一个 loop 包含多轮动作与多层 review

Ralph 的另一个关键点在于：**一个 Ralph loop 会包含很多轮动作，但不是每个动作结束后都做同一种 review。**

### 1. 一个 Ralph loop 里至少有三个“时钟”

把粒度拆开后，整个运行节奏会清楚很多：

| 粒度 | 在 Ralph 里的含义 | 典型触发点 |
| :-- | :-- | :-- |
| `turn / iteration` | 一次 agent turn 的离散推进单位 | `notify-hook` 在 turn-complete 时递增 |
| `phase wave` | 一段执行波、验证波、修复波 | `executing -> verifying -> fixing` |
| `session loop` | 整个 Ralph 持久化工作流 | 从 `starting` 到 `/cancel` |

因此，“一个 loop 是否包含多轮动作”的答案是：**是，而且通常一定会包含。**  
一个 `session loop` 内部会包含多次 `phase wave`，而每个 `phase wave` 内部又会包含很多个 `turn / iteration`。

### 2. 低级动作不等于一个完整 review 周期

在 `executing` 阶段里，可能发生很多低级动作：

* 读文件
* 改代码
* 启动并行 agent
* 跑命令
* 收集日志
* 修改工件

这些动作结束之后，通常只会触发 **turn-complete hook**，也就是：

* iteration 递增
* HUD 更新
* turn 日志记录
* subagent tracking 更新
* 必要时 auto-nudge / tmux injection / team dispatch

这一层是**运行时 bookkeeping**，不是 architect review。

### 3. Ralph 的 review 是分层发生的

更准确的描述是：Ralph 并不对“每个动作后都 review”；它是在不同粒度上挂接不同强度的 review。

| 触发粒度 | 审查类型 | 是否每次都发生 |
| :-- | :-- | :-- |
| 每个 turn 结束 | Hook 收尾、状态更新、HUD 心跳 | 是 |
| 每次下一轮视觉编辑前 | `$visual-verdict` | 仅视觉任务 |
| 每次完成候选出现时 | fresh verification（test/build/lint） | 是 |
| 每次验证波次收尾 | architect verification | 至少一次，reject 后会再次发生 |
| architect 通过后 | deslop + regression re-verification | 是，除非 `--no-deslop` |

这里的关键在于，Ralph 不会“每走一步就审一次”；它会把低频但高强度的质量审查挂在 workflow 的关键收口点上。

### 4. reject 之后不会开新 loop，而是回到同一个 loop 的 fixing 波次

如果 architect 拒绝当前结果，Ralph 不会把这当成一个全新会话，而是：

```text
verifying -> fixing -> verifying
```

继续留在同一个 loop 内部。

这也是 Ralph 和简单“失败就重跑一次”脚本的区别。它保留的是**同一条状态线上的修复与再验证**，而不是把每次失败切成互相孤立的尝试。

---

## 十二、工程价值：收口能力而不是单纯坚持

Ralph Loop 可以理解为一套边界清晰的持续执行系统，而非“无限循环”：

* 不是无条件扩容，只有活跃 phase 才扩展执行窗口
* 不是任意写状态，所有变更都经过 contract
* 不是随意推送 continue，所有干预都 fail-closed
* 不是只管推进，还会把过程沉淀成可恢复工件
* 结束条件由验证、architect、deslop 和 cleanup 共同决定，不以模型说 done 为准

工程价值不在“让模型坚持”，而在“让持续执行具备严格的退出条件、恢复路径和验证边界”。  
这也是 Ralph 比单纯 retry loop 更接近工程系统的原因。

---

## 十三、顺着代码阅读的推荐路线

按源码职责阅读 Ralph 时，下面这条路径更容易形成整体图景：

1. **`skills/ralph/SKILL.md`** —— 先搞清楚模型被要求怎么做。
2. **`src/cli/ralph.ts`** —— 看启动时到底准备了什么。
3. **`src/hooks/agents-overlay.ts`** —— 看怎么把规矩真正注入会话。
4. **`src/modes/base.ts`** —— 理解 mode 的通用生命周期。
5. **`src/ralph/contract.ts`** —— 核心状态契约。
6. **`src/mcp/state-server.ts`** —— 状态如何被过滤和落盘。
7. **`src/scripts/notify-hook.ts`** —— turn 结束后的继续推进逻辑。
8. **`src/scripts/notify-fallback-watcher.ts`** —— 卡住时的兜底。
9. **`src/ralph/persistence.ts`** —— 过程如何留底。
10. **`src/subagents/tracker.ts`** —— subagent 怎么管。

按这条路径阅读，更容易把“提示词约束、状态推进、Hook 归约、Watcher 恢复、工件沉淀”串成一条完整链路。
