---
title: '代码拆解：oh-my-codex 是如何实现 Ralph Loop 的'
description: 'oh-my-codex 里的 Ralph loop 并不是简单的 while true。顺着代码捋一遍会发现，它更像是一个由提示词契约、持久化状态、Hook 以及后台 Watcher 共同组成的任务执行框架。'
publishDate: '2026-04-02'
tags: ['Agent', '源码分析', '系统设计', 'oh-my-codex', 'Harness']
language: 'zh-CN'
draft: false
---

# 代码拆解：oh-my-codex 是如何实现 Ralph Loop 的

> Agent 的上限靠大模型，下限很多时候靠外层系统兜着。
> 这两天翻 `oh-my-codex` 的代码，最有意思的部分就是它的 Ralph Loop。表面看只是让模型“别停，一直干到完”，但真正顺着代码往下走，你会发现它远不是一个简单的 `while (not_done)`。它更像一套脚手架：用提示词定规矩、把状态全落盘、靠 Hook 自动续命，再配一个后台 Watcher 在卡住的时候推一把。

---

## 太长不读（TL;DR）

Ralph Loop 在 `oh-my-codex` 里并不是靠一个集中调度器实现的，而是几层机制叠加起来的：

* **提示词层**：核心行为规则写在 `skills/ralph/SKILL.md` 里（持续推进、必须验证、失败重试、完成后取消）。
* **会话注入层**：`omx ralph` 启动时，把 Ralph 的附加约束注入到当前会话的 `AGENTS.md`。
* **状态机层**：所有 phase、iteration、完成状态都写进 `.omx/state/{scope}/ralph-state.json`，并受严格 contract 校验。
* **Turn Hook 层**：每轮结束自动递增 iteration，活跃阶段下碰到上限就自动扩容。
* **Fallback Watcher 层**：模型卡住时，后台检查状态和 HUD，如果真停了就往 tmux pane 里塞一句 `Ralph loop active continue`。

简单说，它是一个 **prompt-driven** 的循环，靠状态机和 watcher 在背后硬托着模型往前跑。

```text
Prompt Contract + Session Injection + Persisted State + Turn Hook + Stall Recovery Watcher
```

---

## 一、它不是一个 while true

很多人看到 Ralph，第一反应是去找类似这样的代码：

```ts
while (!done) {
  plan();
  act();
  verify();
}
```

`oh-my-codex` 没这么干。它把“循环”这个概念拆得七零八落，分散到不同模块里：

| 层级        | 主要文件                                     | 职责                     |
| --------- | ---------------------------------------- | ---------------------- |
| 提示词层      | `skills/ralph/SKILL.md`                  | 定义 Ralph 该怎么工作         |
| CLI 启动    | `src/cli/ralph.ts`                       | 启动、写状态、注入说明            |
| 生命周期      | `src/modes/base.ts`                      | 通用 mode 管理             |
| 状态契约      | `src/ralph/contract.ts`                  | phase 和状态合法性校验         |
| 持久化       | `src/ralph/persistence.ts`               | PRD、progress ledger 等  |
| Turn Hook | `src/scripts/notify-hook.ts`             | 每轮结束更新 iteration 和 HUD |
| Watcher   | `src/scripts/notify-fallback-watcher.ts` | 卡住时的兜底续命               |

核心思路是：不把“让模型一直跑”这件事压给模型自己，而是让系统来不断把它拽回正轨。

---

## 二、第一层：提示词才是真正的契约

想搞懂 Ralph，最该先看的其实不是 TypeScript，而是 `skills/ralph/SKILL.md`。

这个文件把 Ralph 的规则写得明明白白：它是一个 persistence loop，必须干到任务真正完成；完成前一定要拿到新鲜的验证证据；必须经过 architect 验证；被 reject 了就继续改、继续验证；结束时要主动执行 `/cancel`。

phase 切换也写在里面：执行时是 `executing`，验证时是 `verifying`，修复时是 `fixing`，完事了才是 `complete`。

也就是说，Ralph 的“循环行为”从一开始就被编码成了一套文字协议。这也是为什么很多人说：Agent 的关键往往不在模型，而在于它所在的 harness。Ralph 的第一层 harness，就是这个 prompt contract。

---

## 三、第二层：`omx ralph` 启动时到底干了什么

入口在 `src/cli/ralph.ts`，启动流程大致是：

```ts
ensureCanonicalRalphArtifacts(cwd)
readApprovedExecutionLaunchHint(...)
buildFollowupStaffingPlan(...)
startMode('ralph', task, 50)
writeRalphSessionFiles(...)
launchWithHud(...)
```

关键动作有三步：

1. **准备 canonical 工件**：确保 PRD、progress ledger 都在，该迁移的 legacy 文件也处理好。
2. **写入 Ralph 专属说明**：在 `.omx/ralph/` 下生成 `session-instructions.md` 和 `changed-files.txt`，把额外约束（允许 subagent 并行、不要过早宣布完成、final deslop 只针对 changed files 等）塞进去。
3. **真正拉起 Codex**：把 runtime overlay 和 Ralph appendix 合并成当前 session 专属的 `AGENTS.md`，再喂给模型。

`omx ralph` 不是简单调用模型，而是先把执行环境搭好，再把模型放进去。

---

## 四、第三层：状态全落盘 + 严格契约

状态管理是 Ralph 的骨架，核心在 `src/ralph/contract.ts`。

定义的 phase 很固定：

```
starting → executing → verifying → fixing → complete / failed / cancelled
```

`validateAndNormalizeRalphState()` 会强校验：phase 是否合法、iteration 是否整数、max_iterations 是否合理、终态必须 active=false、时间戳必须是标准 ISO8601 等。

状态文件按 session 隔离，存到 `.omx/state/{scope}/ralph-state.json`（或 sessions 子目录）。模型可以通过 `state_write` 推进，但都要先过这道 filter。

---

## 五、第四层：hook 才是 Ralph 的回合控制面

`src/scripts/notify-hook.ts` 是 Ralph loop 最像“运行时控制面”的地方。文件开头其实已经把调用方式写得很清楚了：Codex CLI 会通过 `notify` 配置在每个 agent turn 结束后调用它，并把 JSON payload 作为最后一个 argv 参数传进来。

这件事很重要。因为这说明 Ralph 的“循环”并不是模型在上下文里自己默念“下一步继续”，而是每轮回合一结束，外部系统都会有一个专门的程序接手做收尾。

### 1. 先解析 payload，再做 turn 去重

hook 进来后第一件事不是改 Ralph 状态，而是先把这轮 turn 的 `cwd`、`session_id`、`thread_id`、`turn_id` 解出来。接着它会把 `thread + turn + eventType` 写进 `notify-hook-state.json` 做 recent-turn dedupe，避免 native notify 和 fallback watcher 对同一轮重复处理。

这一小步很关键。因为一旦 turn 重复进来，后面的 iteration 递增、tmux 注入、leader nudge、team dispatch 都可能被多打一遍。Ralph 的“继续”不是靠猛推，而是先把事件边界收干净。

### 2. iteration 只是表层，真正做的是 turn-complete 收尾

最显眼的是这几行：

```ts
state.iteration = (state.iteration || 0) + 1
state.last_turn_at = nowIso
```

这已经说明了 Ralph 的 iteration 不是某个 while 循环里的局部计数器，而是一个在 turn 完成后离散推进的 hook 事件。

但顺着文件往下看，你会发现它不只做 `+1`。它还会顺手处理几类回合收尾工作：

* 把 turn 的输入预览、输出预览写进 `.omx/logs/turns-*.jsonl`
* 记录 leader / native subagent thread 的活跃轨迹，交给 `src/subagents/tracker.ts`
* 更新 `.omx/state/hud-state.json`，刷新 `last_turn_at`、`turn_count`、`last_agent_output`
* 更新 metrics、token usage、quota usage，让 HUD 和后续诊断层看到统一的运行面

从工程视角看，`notify-hook` 更像一个 turn-complete reducer：它把这一轮会话里散落的事实，统一折叠回状态和日志。

### 3. auto-expand 才是 Ralph 的硬续命

`notify-hook.ts` 里定义了一组 Ralph 活跃 phase：`starting`、`executing`、`verifying`、`fixing`。只要 Ralph 还在这些 phase 里，即使 `iteration >= max_iterations`，它也不会像普通 mode 一样进入完成态，而是直接：

```ts
state.max_iterations = maxIterations + 10
state.max_iterations_auto_expand_count += 1
state.max_iterations_auto_expanded_at = nowIso
```

这就是 Ralph 真正的“续命”动作。它把“别轻易停下”从提示词层的软约束，变成了 hook 层的硬行为。

### 4. hook 还是 tmux、team、nudge 的统一分发层

如果你只把 `notify-hook` 理解成给 Ralph 做 `+1` 的小脚本，就会低估这一层。文件开头已经把职责拆成了 `payload-parser`、`state-io`、`log`、`auto-nudge`、`tmux-injection`、`team-dispatch`、`team-leader-nudge`、`team-worker` 等子模块，说明它本身就是一个回合边界上的统一分发层。

它还会在 turn 结束后继续处理：

* `handleTmuxInjection()`，把需要的提示注入 tmux pane
* `drainPendingTeamDispatch()`，消费 team dispatch 队列
* `maybeNudgeTeamLeader()`，在 leader stale 时补一把提醒
* `updateWorkerHeartbeat()`、`maybeNotifyLeaderWorkerIdle()`，维护 worker heartbeat 和空闲通知
* `maybeAutoNudge()`，遇到 stall pattern 时追加自动 nudges

所以 `notify-hook` 不是 Ralph 顺手挂上的一个计数器，而是整个会话在 turn 边界上的小型控制面。Ralph loop 只是这套控制面里最显眼的一条主线。

---

## 六、第五层：watcher 是 Ralph 的恢复面

如果说 `notify-hook` 解决的是“每轮正常结束后怎么收尾”，那 `src/scripts/notify-fallback-watcher.ts` 解决的就是“如果正常结束根本不发生怎么办”。它不是一次性回调，而是 CLI 会拉起的 detached 后台进程：带着 `--cwd`、`--notify-script`、`--parent-pid` 跑起来，把 pid 写进 `.omx/state/notify-fallback.pid`，然后持续轮询。

也就是说，这一层不是附属小脚本，而是 Ralph 的后台控制平面。它不替模型做决策，而是在模型停摆时检查：系统现在还有没有资格再轻推一把。

### 1. 先判断是不是“活着但没动静”

watcher 每个 tick 先做的不是发 `continue`，而是确认当前到底还有没有一个 active Ralph：session 还活不活、phase 是不是已经 terminal、parent 进程是不是还在、pane 还有没有存活空间。

它先判断的不是“该不该继续”，而是“当前这个 Ralph 还算不算一个值得接管的活体任务”。

### 2. 发 continue 之前要过三道门

真正发 continue 之前，至少会过三层门槛。

第一层是**进展是否真的陈旧**。watcher 会读 HUD / state 里的最近进展时间，没过陈旧窗口就不动。

第二层是**冷却和并发保护**。它有 `RALPH_CONTINUE_CADENCE_MS = 60000` 这样的节流，也会把最近一次 steer 时间写进共享 timestamp，再配上 `ralph-continue-steer.lock` 这样的单例 lock，避免多个 watcher 抢着推同一条 continue。

第三层是**pane 是否真的可注入**。它会先走 `checkPaneReadyForTeamSendKeys()`，只有 pane 还活着、当前命令状态允许注入，才会真正执行：

```ts
emitRalphContinueSteer(paneId, RALPH_CONTINUE_TEXT)
```

最后打进去的才是那句固定提示：

```text
Ralph loop active continue
```

### 3. 它不是自动回车器，而是 fail-closed 的 fallback control plane

HUD progress 缺失不发，HUD progress 非法不发，pane 丢了不发，terminal phase 不发，cooldown 没过不发。除此之外，它还会顺手处理 pending team dispatch、检查 leader 是否 stale、必要时做 leader nudge，甚至在 HUD 长时间没新 turn 时，合成一条 stalled-turn payload 再喂回 `maybeAutoNudge()`。

所以这层不是“后台定时按一下回车”，而是一个 fail-closed 的恢复面。只有当 Ralph 仍然活着、系统也确认现场安全时，它才会给模型一把助推。

---

## 七、为什么这一层会用 TypeScript

很多人第一眼会觉得，hook / watcher 这种东西用 shell 写几条命令不就够了？但顺着 `notify-hook.ts` 和 `notify-fallback-watcher.ts` 看下去，你会发现它们早就不是“命令胶水”，而是和 CLI 主体并列的运行时模块。

**第一，它处理的是结构化状态，而不是几行 stdout。** `notify-hook` 吃进来的是 JSON payload，写出去的是 `ralph-state.json`、`hud-state.json`、`notify-hook-state.json`、日志和 metrics；watcher 那边又维护 pid file、lock file、共享 timestamp、`RalphContinueSteerState` 这类状态文档。这里最怕的不是少打一条命令，而是字段名、phase 语义、时间戳格式悄悄漂掉。TypeScript 至少能把这层 contract 固定住。

**第二，它需要和主程序共享模块。** 这两层脚本直接 import 了 `subagents/tracker`、`hooks/session`、`tmux-hook-engine`，以及 `notify-hook/*` 下面一整串子模块。换成 shell，很多逻辑会退化成字符串拼接和重复实现；换成另一套独立语言，又会把 contract 和 helper 拆成两份。

**第三，它要跨平台，还要作为正式产物分发。** `oh-my-codex` 整个仓库本来就是 Node + TypeScript 工程，`package.json` 里用 `tsc` 构建，再把 `src/scripts/*.ts` 编译到 `dist/scripts/*.js` 供 CLI 直接调用。开发态拿到类型和模块化，运行态仍然是可执行脚本，这比 shell 更适合 Windows、macOS、Linux 混跑的场景。

**第四，它的复杂度已经值得被当成“程序”维护。** 从文件头那串 `payload-parser`、`state-io`、`auto-nudge`、`tmux-injection`、`team-dispatch`、`team-worker` 就能看出来，这一层不是附属胶水，而是一个小型控制面。既然是控制面，用 TypeScript 把它纳入主仓统一的构建、测试、发布链路，本身就是更稳妥的工程选择。

所以表面上看，这里写的是 hook；但在 `oh-my-codex` 里，它真正扮演的角色更像是“以脚本形态交付的 TypeScript 子系统”。

---

## 八、过程也要留底

除了往前跑，Ralph 还很注重把过程记下来：

* `ralph-progress.json` 作为进度基准。
* visual feedback 会结构化存进 progress 文件（score、verdict、suggestions 等）。
* subagent 的活跃情况统一记录在 `subagent-tracking.json`，防止主线过早宣布完成。

这样即使中断了，下次也能接得上。

---

## 九、总结：这套 loop 的真正价值

Ralph Loop 的本质不是“无限循环”，而是一套边界清晰的持续执行系统：

* 不是无脑扩容，只有活跃 phase 才续命。
* 不是随便写状态，所有变更都过 contract。
* 不是乱推 continue，所有干预都 fail-closed。
* 不是只管跑，还把过程沉淀成可恢复的工件。

它真正厉害的地方在于：把“让模型坚持做完”这件事，从一句口号变成了可控、可观测、可恢复的工程机制。

好的 Agent 系统，往往不是模型多聪明，而是系统能不能把它稳稳托住。

---

## 十、推荐阅读路线（如果你要自己翻代码）

想顺着源码把 Ralph 捋清楚，建议按下面顺序：

1. **`skills/ralph/SKILL.md`** —— 先搞清楚模型被要求怎么做。
2. **`src/cli/ralph.ts`** —— 看启动时到底准备了什么。
3. **`src/hooks/agents-overlay.ts`** —— 看怎么把规矩真正注入会话。
4. **`src/modes/base.ts`** —— 理解 mode 的通用生命周期。
5. **`src/ralph/contract.ts`** —— 核心状态契约。
6. **`src/mcp/state-server.ts`** —— 状态如何被过滤和落盘。
7. **`src/scripts/notify-hook.ts`** —— turn 结束后的续命逻辑。
8. **`src/scripts/notify-fallback-watcher.ts`** —— 卡住时的兜底。
9. **`src/ralph/persistence.ts`** —— 过程如何留底。
10. **`src/subagents/tracker.ts`** —— subagent 怎么管。

按这条线走，比直接跳进 watcher 文件要清晰得多。
