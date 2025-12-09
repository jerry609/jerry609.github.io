---
title: "IPC：进程间通信详解"
description: "从管道、消息队列到共享内存、Socket 与 RPC，系统性梳理进程间通信（IPC）的核心实现方式、原理与选型。"
publishDate: "2025-12-09"
tags: ["IPC", "Linux", "System Programming", "OS"]
language: "zh-CN"
draft: false
---

## 一、IPC 是什么？

**IPC（Inter-Process Communication，进程间通信）** 指：**同一台机器上（也可以是不同机器上）不同进程之间，为了交换数据、同步状态而使用的一系列机制**。

因为每个进程有**独立的虚拟地址空间**，不能像函数那样直接调用彼此的变量，所以需要操作系统提供“桥梁”——这就是 IPC。

---

## 二、常见的 IPC 实现方式 & 原理

下面以类 Unix / Linux 为例，Windows 也有类似概念。

### 1. 管道（pipe / FIFO）

- **特点**：单向或半双工、面向字节流、父子进程之间使用很方便。
- **实现原理**：
  - 内核中维护一个**环形缓冲区**；
  - 写进程往缓冲区写数据，读进程从缓冲区读数据；
  - 内核负责阻塞/唤醒读写进程（没有数据时读阻塞、缓冲区满时写阻塞）。
- **命名管道（FIFO）**：有路径名，可以在**非亲缘关系进程之间**使用。

**适合**：简单的“流水线”式生产者-消费者。

**示例：C 语言匿名管道（父写子读）**

```c
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>

int main(void) {
  int fds[2];
  pipe(fds);

  if (fork() == 0) {            // child
    close(fds[1]);
    char buf[64] = {0};
    read(fds[0], buf, sizeof(buf));
    printf("child got: %s\n", buf);
    _exit(0);
  }

  close(fds[0]);
  const char *msg = "hello from parent";
  write(fds[1], msg, strlen(msg) + 1);
  close(fds[1]);
  wait(NULL);
}
```

---

### 2. 消息队列（Message Queue）

- **特点**：按**消息为单位**（有消息边界），支持优先级。
- **实现原理**：
  - 内核里维护一个“队列对象”；
  - 每条消息有类型 / 优先级，写入队列尾部或插队；
  - 读进程按类型/优先级取出消息；
  - 内核负责同步、阻塞、唤醒。
- **对比管道**：
  - 管道是“没有边界的字节流”，消息队列是“有边界的离散消息”。

**适合**：多生产者-多消费者、逻辑清晰、需要按消息处理的场景。

**示例：System V 消息队列（C 语言）**

```c
#include <stdio.h>
#include <sys/ipc.h>
#include <sys/msg.h>
#include <string.h>

struct msgbuf {
  long mtype;
  char text[64];
};

int main(void) {
  key_t key = ftok(".", 'q');
  int mqid = msgget(key, IPC_CREAT | 0666);

  if (fork() == 0) {             // consumer
    struct msgbuf msg;
    msgrcv(mqid, &msg, sizeof(msg.text), 1, 0);
    printf("worker: %s\n", msg.text);
  } else {
    struct msgbuf msg = {.mtype = 1};
    strcpy(msg.text, "build finished");
    msgsnd(mqid, &msg, sizeof(msg.text), 0);
    wait(NULL);
    msgctl(mqid, IPC_RMID, NULL);
  }
}
```

---

### 3. 共享内存（Shared Memory）

- **特点**：**最快的 IPC**；双方直接访问同一块内存。
- **实现原理**：
  - 内核分配一块物理内存；
  - 把这块物理内存映射到多个进程的虚拟地址空间；
  - 之后进程可以像访问自己内存一样读写这块区域。
- **问题**：没有自动同步，需要自己配合**锁 / 信号量 / 自旋锁 / 条件变量**等保证互斥和可见性。

**适合**：数据量很大、频繁读写、性能敏感的场景（例如多进程共享缓存）。

**示例：POSIX 共享内存 + memcpy**

```c
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <string.h>

int main(void) {
  const char *name = "/ipc_shm";
  int fd = shm_open(name, O_CREAT | O_RDWR, 0666);
  ftruncate(fd, 4096);

  void *addr = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  if (fork() == 0) {
    char buf[32];
    memcpy(buf, addr, sizeof(buf));
    printf("child read: %s\n", buf);
  } else {
    memcpy(addr, "shared data", 12);
    wait(NULL);
    munmap(addr, 4096);
    shm_unlink(name);
  }
}
```

---

### 4. 信号量（Semaphore）& 互斥锁（Mutex）

严格说是**同步机制**，但经常和 IPC 绑定在一起用：

- **信号量**：整数计数 + 原子加减，控制可同时进入临界区的进程数。
- **互斥锁**：信号量的一种特殊情况（最大值 = 1），保证同一时间只有一个执行者。

通常搭配共享内存，做“数据共享 + 同步保护”。

**示例：POSIX 命名信号量保护临界区**

```c
#include <fcntl.h>
#include <semaphore.h>
#include <stdio.h>
#include <unistd.h>

int main(void) {
  sem_t *sem = sem_open("/ipc_sem", O_CREAT, 0644, 1);

  if (fork() == 0) {
    sem_wait(sem);
    puts("child enters critical section");
    sem_post(sem);
  } else {
    sem_wait(sem);
    puts("parent enters critical section");
    sem_post(sem);
    wait(NULL);
    sem_unlink("/ipc_sem");
  }
}
```

---

### 5. 信号（Signal）

- **特点**：非常轻量的“异步通知机制”。
- **实现原理**：
  - 内核给目标进程设置一个“信号标记”；
  - 进程在合适的时机（中断返回、系统调用返回）检查并调用对应的信号处理函数。
- **适合**：
  - 通知进程“发生了某件事”（如 SIGINT、SIGTERM、SIGCHLD 等）；
  - 不适合传输大数据，只传一点状态/编号。

**示例：Python 信号通知**

```python
import os
import signal
import time

def handle(sig, frame):
  print(f"parent got signal {sig}")

signal.signal(signal.SIGUSR1, handle)

if os.fork() == 0:
  time.sleep(1)
  os.kill(os.getppid(), signal.SIGUSR1)
else:
  signal.pause()  # 阻塞等待信号
```

---

### 6. 套接字（Socket）

- **本地 IPC 套接字（Unix Domain Socket）**：
  - 仍然是“socket”接口（`bind/listen/accept/connect/send/recv`），但**不走网络协议栈**；
  - 数据只在本机内核空间中传递，效率比 TCP/UDP 高。
- **网络套接字**则可以跨机器，是 “IPC + 网络” 的混合形式。

**适合**：

- 多进程服务器（例如 Nginx、PostgreSQL 的进程间通信）；
- 希望以后方便迁移到分布式（跨机器）的场景。

**示例：Python Unix Domain Socket echo**

```python
import os
import socket
import threading

SOCK_PATH = "/tmp/ipc.sock"

def serve():
  if os.path.exists(SOCK_PATH):
    os.remove(SOCK_PATH)
  with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
    server.bind(SOCK_PATH)
    server.listen()
    conn, _ = server.accept()
    with conn:
      data = conn.recv(1024)
      conn.sendall(data.upper())

threading.Thread(target=serve, daemon=True).start()

with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
  client.connect(SOCK_PATH)
  client.sendall(b"ping from client")
  print(client.recv(1024))
```

---

### 7. RPC / gRPC / D-Bus 等“高级 IPC”

这些通常是**在底层 IPC（如 socket 或管道）之上再封一层协议**：

- 自动帮你做：
  - 序列化 / 反序列化；
  - 请求-响应匹配；
  - 服务发现、重试、超时等。
- 本质：**函数调用的体验 + IPC 的实现**。

Linux 桌面上的 D-Bus、Android 的 Binder 都是典型的“增强型 IPC 框架”。

**示例：Python XML-RPC（RPC 的轻量形态）**

```python
from xmlrpc.server import SimpleXMLRPCServer
import threading
import xmlrpc.client

def add(x, y):
  return x + y

server = SimpleXMLRPCServer(("127.0.0.1", 9000), logRequests=False)
server.register_function(add, "add")
threading.Thread(target=server.serve_forever, daemon=True).start()

proxy = xmlrpc.client.ServerProxy("http://127.0.0.1:9000")
print("result:", proxy.add(40, 2))
```

---

## 三、IPC 的核心原理（抽象一下）

不管是哪种方式，本质上都是在解决三类问题：

1. **数据在不同地址空间之间怎么走？**

   - **拷贝（copy）**：管道、消息队列、socket 通常是“用户态 ⇄ 内核态 ⇄ 用户态两次拷贝”：
     - 用户态缓冲区 → 内核缓冲区；
     - 再从内核缓冲区 → 另一个进程的用户态缓冲区。
   - **共享（share）**：共享内存是通过**映射同一块物理页**，不拷贝。

2. **如何保证同步和一致性？**

   - 阻塞 / 非阻塞 IO；
   - 锁、信号量、自旋锁等原语；
   - 自定义协议（版本号、序列号、心跳、重试）等逻辑保证。

3. **如何标识对方并路由消息？**

   - 文件描述符（FD）：管道、Unix Socket 等都依赖 FD；
   - key / id：System V 消息队列 / 共享内存用 key；
   - 网络地址：IP + 端口，外加一些 RPC 框架里的 service name。

换个角度看：所有 IPC 方案只是在这些维度上做不同权衡。

---

## 四、IPC 与“其他通信方式”的区别

### 1. IPC vs 进程内通信（函数调用 / 线程共享内存）

**进程内（in-process）通信：**

- 所有线程共享同一地址空间；
- 调用成本基本就是函数调用 + 内存访问；
- 只需要考虑锁、条件变量等同步手段。

**IPC：**

- 至少要跨一次内核（系统调用）；
- 通常还要做序列化 / 拷贝；
- 但换来的是**崩溃隔离、权限隔离、安全隔离**。

一句话总结：

- 性能优先：**进程内 > IPC**；
- 隔离性和稳定性优先：**IPC > 进程内**。

很多大型系统都是两者混用：

- 同一个服务内部，用线程/协程共享内存；
- 服务与服务之间，用 IPC / 网络通信解耦。

---

### 2. IPC vs 网络通信（跨机器）

从接口看，Unix Socket 和 TCP 很像；差别主要在 **距离**：

- **本地 IPC：**
  - 通常只跑在本机内核里，不出机器；
  - 延迟低、带宽高；
  - 配置简单（不需要 IP / 端口 / DNS 等）。

- **网络通信：**
  - 可以跨机器、跨机房；
  - 多了路由、重传、拥塞控制、防火墙等复杂度；
  - 更适合分布式 / 微服务。

很多系统会采取这样的策略：

- 单机内：组件之间用 Unix Socket 或共享内存；
- 跨机：再暴露一层 HTTP/gRPC API。

---

### 3. 各种 IPC 方式之间的对比（速查表）

| 方式 | 特点 | 适用场景 |
| :--- | :--- | :--- |
| **管道** | 简单、流式、小数据、父子进程 | 简单的“流水线”式生产者-消费者 |
| **消息队列** | 有消息边界、多生产者/消费者、适合解耦 | 多生产者-多消费者、逻辑清晰 |
| **共享内存** | 最高性能，大块数据；但同步复杂 | 数据量很大、频繁读写、性能敏感 |
| **信号量/锁** | 不传数据，负责“协调访问” | 配合共享内存，做同步保护 |
| **信号** | 异步通知，用来“拍一下”对方 | 通知进程“发生了一件事” |
| **Unix Socket** | 通用且灵活、本地和网络可统一代码 | 想要 Socket 接口体验，或者为了未来扩展 |
| **RPC / D-Bus** | 高级封装，接口像“调用函数” | 复杂系统集成，需要服务发现和类型安全 |

---

## 五、怎么选用 IPC 方式？

按场景分类：

1. **大数据、高频率、本机共享**  
   ➜ *共享内存 + 锁 / 信号量*  
   例：多进程共享一块缓存，读多写少。

2. **简单父子进程通信 / 日志 / 命令输出**  
   ➜ *匿名管道（pipe）即可*  
   例：一个主进程 fork 出 worker，worker 把结果写回主进程。

3. **多个生产者/消费者、逻辑层次清晰**  
   ➜ *消息队列（内核队列或者中间件 MQ）*  
   例：日志采集、多模块异步事件。

4. **服务化通信，未来可能要跨机器**  
   ➜ *本机用 Unix Socket，远程用 TCP/HTTP + RPC 框架*  
   例：数据库前端进程和存储进程、Nginx worker 和 master。

5. **只需要“拍一下对方”，不需要带数据**  
   ➜ *信号 / 简单事件机制*  
   例：给服务发 SIGTERM 告诉它优雅退出；让守护进程知道子进程挂了。

---

## 六、一句话记 IPC

简化版“速记卡”：

> **IPC = 地址空间隔离下的“说话方式”。**  
> 进程看不到彼此内存，只能通过内核提供的管道、消息队列、共享内存、socket 等桥梁交换数据。  
> 选型时，在“性能 / 简单 / 隔离 / 跨机器”之间做权衡就好。

---

## 延伸阅读：Claude Agent SDK 的 IPC 使用

如果你对「IPC 在真实框架里怎么用」感兴趣，可以结合这篇文章一起看我之前写的 Claude SDK 源码分析：

- **[Claude Agent SDK 源码导读：子进程、IPC 与 Sandbox](/blog/claude-agent-sdk-1/)**

Claude Agent SDK 的核心设计之一，就是：

- Python SDK **不直接调用 HTTP API**，而是：
  - 在本地启动一个 `claude` CLI 子进程；
  - 通过标准输入/输出（stdin/stdout）以 **JSON Lines** 格式交换消息；
- 从 IPC 角度看，它就是：
  - 用 **管道（pipe）+ 文本协议** 做了一层“远程控制接口”；
  - SDK 负责序列化/反序列化、重试、流式读取等；
  - CLI 进程再去调用远端的 Anthropic API，并管理工具系统 / 沙箱环境。

从前面总结的三个问题看，这套设计分别是：

1. **数据怎么从 A 的地址空间跑到 B？**

   - 用标准输入 / 输出背后的**匿名管道**，做“拷贝型”传输：
     - Python 进程写 JSONL 到 stdout（用户态缓冲区 → 内核缓冲区）；
     - CLI 子进程从 stdin 读出来（内核缓冲区 → 另一进程用户态缓冲区）。
   - 为什么用 JSON Lines 而不是二进制 protocol buffer？
     - 文本可读、易调试；
     - 方便和 shell / 日志 / 其他语言集成；
     - 对于主要是控制类消息，性能足够。

   **对应源码（`claude_agent_sdk/_internal/transport/subprocess_cli.py`）**

   ```python
   self._process = await anyio.open_process(
       cmd,
       stdin=PIPE,
       stdout=PIPE,
       stderr=stderr_dest,
       cwd=self._cwd,
       env=process_env,
       user=self._options.user,
   )

   if self._process.stdout:
       self._stdout_stream = TextReceiveStream(self._process.stdout)

   if self._is_streaming and self._process.stdin:
       self._stdin_stream = TextSendStream(self._process.stdin)
   ```

2. **如何保证同步和一致性？**

   - 协议层定义好：
     - 每条消息有 type（tool_use / tool_result / event 等）；
     - 带上 id / conversation id / sequence；
   - 通过“请求-响应匹配 + 心跳 / 超时重试”保证一致性；
   - 流式输出通过 JSON Lines 的一行一事件来表达。

   **对应源码片段**

   ```python
   async def write(self, data: str) -> None:
     async with self._write_lock:
       if not self._ready or not self._stdin_stream:
         raise CLIConnectionError("ProcessTransport is not ready for writing")
       await self._stdin_stream.send(data)

   async for line in self._stdout_stream:
     line_str = line.strip()
     if not line_str:
       continue
     for json_line in line_str.split("\n"):
       json_buffer += json_line.strip()
       if len(json_buffer) > self._max_buffer_size:
         raise SDKJSONDecodeError(
           f"JSON message exceeded maximum buffer size of {self._max_buffer_size} bytes",
           ValueError(
             f"Buffer size {len(json_buffer)} exceeds limit {self._max_buffer_size}"
           ),
         )
       try:
         data = json.loads(json_buffer)
         json_buffer = ""
         yield data
       except json.JSONDecodeError:
         continue
   ```

3. **如何标识对方并路由消息？**

   - 内核层用文件描述符来标识管道两端；
   - 协议层用 `request_id` / `tool_call_id` 等字段路由到正确的 handler；
   - 多个工具、多种事件类型通过 type + id 组合区分。

   ```python
   # claude_agent_sdk/_internal/query.py
   async for message in self.transport.read_messages():
     msg_type = message.get("type")

     if msg_type == "control_response":
       response = message.get("response", {})
       request_id = response.get("request_id")
       if request_id in self.pending_control_responses:
         event = self.pending_control_responses[request_id]
         if response.get("subtype") == "error":
           self.pending_control_results[request_id] = Exception(
             response.get("error", "Unknown error")
           )
         else:
           self.pending_control_results[request_id] = response
         event.set()
       continue

     await self._message_send.send(message)
   ```

这样你可以把 Claude Agent SDK 看成一个“基于 IPC 的本地代理”：

- 上层代码以“函数调用 / 事件回调”的方式使用；
- SDK 内部通过 IPC 管道和 CLI 子进程通信；
- CLI 再通过 HTTP / TLS 等和远端模型服务打交道。

