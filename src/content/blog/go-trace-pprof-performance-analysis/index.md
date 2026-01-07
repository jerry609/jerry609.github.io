---
title: "Go Trace + PProf 性能分析理论（一）"
description: "深入解析 Go 运行时 GMP 调度模型，通过 trace、pprof 组合分析 P utilization、sched wait、syscall/cgo 等指标，快速定位 CPU 饱和、M 不足、锁竞争等性能瓶颈。"
publishDate: "2025-01-07"
tags: ["Go", "Performance", "Trace", "PProf", "GMP"]
language: "zh-CN"
draft: false
---

排 Go 性能问题最容易卡在一句话上：

> **"为啥 trace 里 P utilization 很低，但 runnable goroutine 却很多 / sched wait 很大？"**

**方法**：

- 先用 **G-M-P 的硬约束（invariants）** 把"合理/不合理"边界划清
- 再用 **trace 里的阻塞事件 + sched wait + P utilization** 做一条证据链
- 最后用 **pprof（CPU/heap/mutex/block）** 把锅甩到具体函数/锁/chan/系统调用上

---

## 1. 先把两个 "processor" 分清楚：P 不是 CPU 核

很多误判来自把两个概念混为一谈：

| 概念 | 说明 |
| :--- | :--- |
| **P（processor）** | Go runtime 里的 _P_，数量约等于 `GOMAXPROCS`，代表"并行执行 Go 代码的槽位" |
| **CPU（核）** | 操作系统的 CPU 资源 |

> trace 里的 **P utilization**，指的是这些 **P 在跑 Go 代码** 的比例，不是进程总 CPU 使用率。

---

## 2. GMP 的几个硬约束

这些约束能推导出大部分"异常组合"为何异常：

### 约束 A：Running 的 goroutine 并行上限 = P 的数量

同一时刻 `#Running(G) ≤ #P ≈ GOMAXPROCS`。

P 是执行令牌，没有 P 就不能跑 Go 代码。

### 约束 B：要跑 Go 代码必须满足 `M 持有 P` 且 `P 上跑 G`

- **M** 是 OS 线程
- **P** 是 Go 执行槽位
- **G** 是任务

> **P utilization 低** 意味着：很多 P 没在执行 Go 代码（可能空闲、可能被 runtime 阶段性行为影响）。

### 约束 C：Runnable 不是"在等"，而是"能跑但没跑上"

Runnable 表示 goroutine 已准备好运行，只是没拿到 P/CPU。

`Sched wait` 基本就是 **Runnable → Running 的排队时间总和**。

### 约束 D：长期出现 "P 空闲" 且 "Runnable 很多" 是反直觉组合

正常情况下，调度器目标是：**有活就尽量让 P 不闲**。

所以若稳定出现：
- P lanes 空洞很多（P utilization 低）
- 同时 runnable backlog 很大（sched wait 大）

往往意味着三类原因之一：

1. **M 不够/被卡住**（syscall/cgo/线程上限）
2. **runtime 特殊阶段**（GC / STW / 系统监控等）
3. **观测窗口/口径不一致**（最常见：瞬时 vs 窗口累计）

---

## 3. syscall / cgo 会"占用 P"吗？——通常占的是 M，不是 P

**关键点**：

> goroutine 进入可能阻塞的 syscall/cgo 时，runtime 会把它标记 in-syscall，让线程去等，并 **释放 P**，让别的线程继续用这个 P 跑 Go 代码。

所以严格来说：

- 阻塞 syscall/cgo **主要占 M（线程）**
- trace 的 P utilization 可能因此下降（因为 Go 代码在 P 上跑得少了）

那为什么会出现 "P 低但 runnable G 还很多"？两条常见路径：

### 路径 A：大量线程卡 syscall/cgo + runtime 不能/来不及补足可用线程

**现象**：
- Thread view 一大片线程在 syscall/cgo
- runnable backlog 很大（sched wait 高）
- 但能持有 P 的线程不够 ⇒ P utilization 上不去

**常见触发**：
- 大量阻塞 cgo
- 线程数受限（容器/ulimit/runtime）
- 某些模式导致线程难复用（LockOSThread、cgo callback 等）

### 路径 B：cgo 在 C 里"烧 CPU"，Go P 看起来低但系统 CPU 很高

**现象**：
- 进程 CPU 很高（被 cgo 线程吃掉）
- trace 的 Go P utilization 反而低（因为那段时间不算 Go 在 P 上跑）
- runnable goroutine 堆积

---

## 4. 一张"组合推导表"：用 3 个观测量快速定位大方向

在同一时间窗口下，关注三个量：

| 观测量 | 说明 |
| :--- | :--- |
| `P_busy` | P utilization（P lanes 是否满） |
| `G_runq` | runnable backlog（Sched wait 是否大） |
| `M_blocked` | 线程是否大量卡 syscall/cgo（Thread view / syscall 事件） |

### 组合 1：`P_busy ≈ P_total` 且 `G_runq 很大`

**结论：CPU 饱和（服务率不足）**

排队论直觉：服务器满载 + 队列还长。

> 下一步看 CPU pprof：top 是否被拷贝/分配/解析/压缩占满。

### 组合 2：`P_busy 很低` 且 `G_runq 很小`

**结论：没活 / 大多在 waiting（IO/锁/chan/timer）**

> 下一步看 trace 的 blocking profile（net/sync/chan）。

### 组合 3：`P_busy 很低` 但 `G_runq 很大`（反直觉核心）

- 若 `M_blocked 很高` ⇒ **线程被 syscall/cgo 吃掉**（M 不够导致 P 用不起来）
- 若 `M_blocked 不高` 且无 GC ⇒ 高度怀疑 **窗口/口径不一致** 或 **CPU quota/throttling** 等环境因素

### 组合 4：`P_busy 中等`，`G_runq 波动大`

常见于 **成批唤醒**（锁/cond/channel），表现为抖动式排队，需要结合 `GoBlockSync/GoBlockSend` 看"等待不可重叠/下游瓶颈"。

---

## 5. 这些"异常"在真实输出里长什么样？（示例）

> 下面示例是模拟的，结构尽量贴近真实 trace/pprof 的呈现。

### 例子 1：P 不满 + sched wait 巨大 + 线程大量 syscall/cgo（路径 A）

**Processor utilization（P lanes 空洞）**

```
Processor 0:  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Processor 1:  ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Processor 2:  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Processor 3:  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Legend: █ Running Go code, ░ Idle
Window: 10s
```

**Goroutine analysis（Sched wait 占大头）**

```
GID   Total   Running   Sched wait   Blocked   Syscall   Start func
1203  9.8s    110ms     8.9s         180ms     610ms     main.worker()
1187  9.7s    95ms      8.8s         220ms     590ms     main.worker()
```

**Thread view（大量线程在 syscall/cgo）**

```
Total threads: 64
Threads in syscall/cgo: 52
M12   9.6s     syscall (syscall.Read)
M13   9.4s     cgo call (C.read_big_blob)
...
```

> **结论：不是 P 被占了，而是 M 被卡住，P 没人用。**

---

### 例子 2：P 跑满 + runnable 还堆（组合 1：CPU 饱和）

**P lanes 全满**

```
Avg P busy: 97%
P0 ██████████████████████████
P1 ██████████████████████████
P2 ██████████████████████████
P3 ██████████████████████████
```

**CPU pprof（拷贝/分配/解析占满）**

```
(pprof) top
  flat  flat%   cum   cum%  function
 7.2s  24%     9.0s  30%   runtime.memmove
 5.8s  19%     8.1s  27%   bytes.(*Buffer).Write
 4.9s  16%     4.9s  16%   runtime.mallocgc
```

> **结论：真正瓶颈在 CPU/分配/拷贝，不是 IO wait。**

---

### 例子 3：看起来"runnable 很多"，但 goroutine dump 大多在 waiting（口径不一致）

**dump（瞬时快照）**

```
goroutine 1203 [chan send, 8 minutes]:
goroutine 1187 [IO wait]:
goroutine 1211 [semacquire]:
```

**trace（窗口累计）**

- Goroutine analysis 里 sched wait 很大只能说明窗口里"曾经排队过"，并不代表 dump 那一刻仍是 runnable。

> **结论：别拿"窗口累计"去对齐"瞬时快照"。**

---

### 例子 4：抖动式排队（成批唤醒导致"等待不可重叠"）

```
(repeats every ~50ms)
GoUnblock burst (500 runnable)
P busy spikes 100%
GoBlockSync/GoBlockSend spike (many block again)
P busy drops
```

**配合 blocking profile**：

```
sync.(*Mutex).Lock   4.2s
runtime.chansend     3.1s
runtime.chanrecv     3.8s
```

> **结论：不是持续 CPU 饱和，而是同步/chan 引发批量唤醒抖动，下游消费/临界区决定吞吐。**

---

## 6. 实战排查顺序（最省力的"自检流程"）

1. **对齐时间窗口**：trace / cpu.pprof / dump 必须是同一段问题区间
2. **看 P utilization**：跑满 vs 空洞
3. **看阻塞类型**：net/syscall vs sync vs chan vs GC
4. **看线程（M）**：Thread view 是否大量 syscall/cgo
5. **再用 pprof 落到具体热点**：
   - CPU 热：`top -cum` + `list` 找到行级
   - 锁竞争：mutex profile
   - chan/backpressure：block profile + trace 的 GoBlockSend/Recv

---

## 7. 结论

看到 "P 低但 runnable 多" 时，不要凭感觉猜是 IO 还是 CPU：

用 GMP 约束先判断"是否合理"，再用 trace 的三件武器盖章：

- **P lanes 是否空洞**
- **Sched wait 是否巨大**
- **Thread view 是否 syscall/cgo 占满**

最后再用 pprof 把锅甩到具体函数栈上。
