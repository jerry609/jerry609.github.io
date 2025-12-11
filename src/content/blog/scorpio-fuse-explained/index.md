---
title: "Scorpio：基于 FUSE 的 Monorepo 虚拟文件系统"
description: "系统拆解 Mega 项目中的 Scorpio 模块：FUSE 原理、Overlay 分层设计、按需加载的实现，以及面向 CI/CD 的 Antares 构建隔离方案。"
publishDate: "2025-12-11"
tags: ["FUSE", "Monorepo", "Mega", "Scorpio", "文件系统"]
language: "zh-CN"
draft: false
---

> 本文尝试系统拆解 Mega 项目中的 Scorpio 模块：从 FUSE 的基本原理，到 Overlay 文件系统的分层设计，看看如何用用户态文件系统实现一个按需加载的 monorepo 挂载方案。

## 一、背景：为什么需要 Scorpio？

在大型 monorepo 场景下，开发者经常会遇到一个两难选择：

- **完整克隆**：仓库体积可能达到几十 GB，`git clone` 需要耗费大量时间和磁盘空间
- **稀疏检出**：配置复杂，对目录结构变化不够友好，难以动态扩展工作集

Scorpio 提供了第三条路：**通过虚拟文件系统挂载远程仓库**。

它的目标形态是：

- 仓库被"挂载"到本地某个目录
- 初始只拉取目录树和必要元数据
- 文件在第一次访问时再按需下载
- 本地修改仍然可以正常版本控制和提交

粗略对比一下工作流：

```text
传统方式：git clone (下载全部) → 本地操作 → git push
Scorpio： mount (下载目录树) → 按需加载 → 本地操作 → commit & push
```

要实现这种行为，关键是 **FUSE（Filesystem in Userspace）**。

---

## 二、FUSE 原理简述

### 2.1 什么是 FUSE？

FUSE 是一个允许在用户态实现文件系统逻辑的框架。

- 传统文件系统（ext4、NTFS 等）运行在内核空间，开发和调试门槛较高
- FUSE 把「协议」留在内核里，把「具体读写逻辑」搬到了用户态进程中

这给了我们一个机会：**用普通用户态进程的方式实现自定义文件系统**，例如：

- sshfs（远程目录挂载）
- rclone（云存储挂载）
- 以及本文讨论的 Scorpio

### 2.2 FUSE 架构

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           用户空间 (User Space)                        │
│                                                                         │
│   ┌─────────────┐         ┌──────────────────────────────────────┐     │
│   │ Application │         │     FUSE Daemon (用户态文件系统)      │     │
│   │  (ls, cat)  │         │                                      │     │
│   └──────┬──────┘         │  ┌──────────────────────────────┐   │     │
│          │                │  │  实现 read/write/lookup 等    │   │     │
│          │ open/read      │  │  例如: Scorpio, sshfs, rclone │   │     │
│          │                │  └──────────────────────────────┘   │     │
│          │                └──────────────────┬───────────────────┘     │
└──────────│───────────────────────────────────│─────────────────────────┘
           │                                   │
           │ syscall                           │ /dev/fuse
           ▼                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           内核空间 (Kernel Space)                       │
│                                                                          │
│   ┌─────────────┐      ┌──────────────┐      ┌─────────────────┐        │
│   │     VFS     │ ───► │ FUSE Kernel  │ ───► │   /dev/fuse     │        │
│   │ (虚拟文件   │      │   Module     │      │ (字符设备)       │        │
│   │  系统层)    │      │              │      │                 │        │
│   └─────────────┘      └──────────────┘      └─────────────────┘        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.3 FUSE 请求处理流程

以 `cat /mnt/fuse/file.txt` 为例：

```text
1. 应用程序调用 open("/mnt/fuse/file.txt", O_RDONLY)
                    │
                    ▼
2. 系统调用进入内核 VFS 层
                    │
                    ▼
3. VFS 发现挂载点属于 FUSE，转发请求到 FUSE 内核模块
                    │
                    ▼
4. FUSE 内核模块将请求序列化，写入 /dev/fuse
                    │
                    ▼
5. 用户态 FUSE 守护进程从 /dev/fuse 读取请求
                    │
                    ▼
6. 守护进程处理请求（如从网络获取文件内容）
                    │
                    ▼
7. 守护进程将响应写回 /dev/fuse
                    │
                    ▼
8. FUSE 内核模块将响应返回给 VFS
                    │
                    ▼
9. 应用程序收到 open() 的返回值
```

### 2.4 FUSE 核心操作

FUSE 要求实现一组基础文件系统操作，对应到常见系统调用：

| 操作 | 描述 | 对应系统调用 |
|------|------|--------------|
| `lookup` | 查找目录项 | `stat`, `access` |
| `getattr` | 获取文件属性 | `stat`, `fstat` |
| `readdir` | 读取目录内容 | `readdir`, `getdents` |
| `open` | 打开文件 | `open` |
| `read` | 读取文件内容 | `read`, `pread` |
| `write` | 写入文件内容 | `write`, `pwrite` |
| `create` | 创建文件 | `creat`, `open(O_CREAT)` |
| `mkdir` | 创建目录 | `mkdir` |
| `unlink` | 删除文件 | `unlink`, `remove` |
| `rename` | 重命名 | `rename` |

### 2.5 Rust 中的 FUSE 实现

Scorpio 使用的是 `rfuse3` 库，提供了异步 FUSE 支持。实现上就是在一个 trait 里把这些操作补全：

```rust
use rfuse3::raw::{Filesystem, Request};

impl Filesystem for MyFS {
    async fn lookup(&self, req: Request, parent: u64, name: &OsStr) -> Result<ReplyEntry> {
        // 查找 parent 目录下名为 name 的文件
        // 返回文件的 inode 和属性
    }

    async fn read(&self, req: Request, ino: u64, offset: i64, size: u32) -> Result<ReplyData> {
        // 读取 inode 为 ino 的文件，从 offset 开始读取 size 字节
    }

    async fn write(&self, req: Request, ino: u64, offset: i64, data: &[u8]) -> Result<ReplyWrite> {
        // 将 data 写入到 inode 为 ino 的文件的 offset 位置
    }
}
```

---

## 三、Scorpio 整体架构

### 3.1 设计目标

Scorpio 的整体设计可以概括为四个核心目标：

1. **按需加载**：访问某个文件时才从服务器拉取内容，节省带宽和本地磁盘
2. **本地读写**：在挂载目录下表现得像一个普通仓库，支持常规读写操作
3. **版本控制**：与 Git 流程集成，支持 `commit`、`push` 等操作
4. **构建隔离**：为 CI/CD 提供独立的构建工作空间

### 3.2 分层架构

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                              应用层                                    │
│                                                                         │
│   开发者工具 (IDE, 编译器, 脚本)                                         │
│         │                                                               │
│         ▼                                                               │
│   /workspace/src/main.rs  (挂载点)                                      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                            FUSE 接口层                                 │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                         MegaFuse                               │   │
│   │                                                                │   │
│   │   职责:                                                        │   │
│   │   - 实现 FUSE Filesystem trait                                 │   │
│   │   - 管理多个 OverlayFs 实例                                     │   │
│   │   - Inode 分配和映射                                            │   │
│   │   - 将请求路由到对应的文件系统层                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                           联合文件系统层                                │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        OverlayFs                               │   │
│   │                                                                │   │
│   │   ┌───────────────────────────────────────────────────────┐     │   │
│   │   │  Upper Layer (读写层)                                  │     │   │
│   │   │  - Passthrough 到本地目录                              │     │   │
│   │   │  - 所有写操作都在这里                                   │     │   │
│   │   │  - Copy-on-Write 语义                                  │     │   │
│   │   ├───────────────────────────────────────────────────────┤     │   │
│   │   │  CL Layer (可选，变更列表层)                            │     │   │
│   │   │  - 用于 CI/CD 场景的增量变更                            │     │   │
│   │   ├───────────────────────────────────────────────────────┤     │   │
│   │   │  Lower Layer (只读层)                                  │     │   │
│   │   │  - Dicfuse 虚拟文件系统                                 │     │   │
│   │   │  - 从 Mega 服务器按需拉取                               │     │   │
│   │   └───────────────────────────────────────────────────────┘     │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                            数据存储层                                  │
│                                                                         │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│   │   Tree Store     │  │  Content Store   │  │   Local Store    │     │
│   │                  │  │                  │  │                  │     │
│   │  目录树元数据     │  │  文件内容缓存    │  │  本地修改数据     │     │
│   │  (sled DB)       │  │  (内存+磁盘)     │  │  (passthrough)   │     │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                            网络层                                      │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      Mega Server API                           │   │
│   │                                                                │   │
│   │  GET /api/v1/tree/{commit_id}     获取目录树                    │   │
│   │  GET /api/v1/blob/{blob_id}       获取文件内容                  │   │
│   │  POST /api/v1/commit              提交变更                      │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 模块职责概览

| 模块 | 位置 | 职责 |
|------|------|------|
| **MegaFuse** | `fuse/mod.rs` | FUSE 入口，管理多个 overlay 实例 |
| **Dicfuse** | `dicfuse/mod.rs` | 只读虚拟层，提供目录树和按需加载 |
| **OverlayFs** | `libfuse-fs` | 联合文件系统，合并多层视图 |
| **Antares** | `antares/` | 轻量级挂载，用于 CI/CD 隔离 |
| **Manager** | `manager/` | Git 操作：commit, push, diff |
| **Daemon** | `daemon/` | HTTP API 服务 |

---

## 四、核心组件拆解

### 4.1 Dicfuse：按需加载的只读层

Dicfuse 是 Scorpio 里的「虚拟只读层」，实现了一个"字典式"文件系统：目录树结构和文件内容分开存储，内容按需加载。

```rust
pub struct Dicfuse {
    readable: bool,
    pub store: Arc<DictionaryStore>,  // 元数据存储
}

impl Dicfuse {
    /// 按需加载文件内容
    async fn load_one_file(&self, parent: u64, name: &OsStr) -> std::io::Result<()> {
        // 1. 查找父目录的 Tree 对象
        let parent_item = self.store.find_path(parent).await?;
        let tree = fetch_tree(&parent_item).await?;

        // 2. 在 Tree 中找到目标文件
        for item in tree.tree_items {
            if item.name == name && item.mode == Blob {
                // 3. 从服务器拉取 Blob 内容
                let url = format!("{}/{}", blob_endpoint, item.id);
                let content = client.get(url).send().await?.bytes().await?;

                // 4. 缓存到本地
                self.store.save_file(inode, content.to_vec());
            }
        }
        Ok(())
    }
}
```

**读取时的关键路径：**

```text
                     首次访问 /workspace/src/main.rs
                                    │
                                    ▼
              ┌─────────────────────────────────────────┐
              │  Dicfuse.lookup("src", "main.rs")       │
              │                                         │
              │  1. 检查本地缓存 → 未命中               │
              │  2. 查询 Tree Store 获取元数据          │
              │     → 找到: inode=42, size=1024        │
              │  3. 返回文件属性（不加载内容）          │
              └─────────────────────────────────────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────────┐
              │  Dicfuse.read(inode=42, offset=0)       │
              │                                         │
              │  1. 检查 Content Store → 未命中         │
              │  2. 从 Mega 服务器拉取 Blob             │
              │     GET /api/v1/blob/{sha1}            │
              │  3. 存入 Content Store                  │
              │  4. 返回文件内容                        │
              └─────────────────────────────────────────┘
```

目录结构可以提前知道，真正的内容只有在需要时才从服务器拉下来。

### 4.2 OverlayFs：联合文件系统

OverlayFs 把多层文件系统组合成一个统一视图，是「只读远程层 + 本地读写层」这个设计的核心。

```text
                    用户视角（合并视图）
                    /workspace/
                    ├── src/
                    │   ├── main.rs      (来自 Upper，已修改)
                    │   └── lib.rs       (来自 Lower，只读)
                    └── Cargo.toml       (来自 Lower，只读)

         ═══════════════════════════════════════════════════
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │ Upper Layer │  │  CL Layer   │  │ Lower Layer │
     │  (读写)     │  │  (可选)     │  │  (只读)     │
     ├─────────────┤  ├─────────────┤  ├─────────────┤
     │ src/        │  │             │  │ src/        │
     │   main.rs ✏ │  │             │  │   main.rs   │
     │             │  │             │  │   lib.rs    │
     │             │  │             │  │ Cargo.toml  │
     └─────────────┘  └─────────────┘  └─────────────┘
```

- **读操作优先级**：`Upper > CL > Lower`
- **写操作**：始终写入 Upper 层（Copy-on-Write）

```rust
impl MegaFuse {
    /// 挂载一个 overlay 文件系统
    pub async fn overlay_mount(
        &self,
        inode: u64,
        store_path: &Path,
        need_cl: bool,
        cl_link: Option<&str>,
    ) -> std::io::Result<()> {
        // 构建层结构
        let lower = store_path.join("lower");   // Dicfuse 映射
        let upper = store_path.join("upper");   // 本地写入层

        let mut lower_layers = vec![];

        // 可选的 CL 层
        if need_cl {
            let cl_path = store_path.join("cl").join(cl_link);
            lower_layers.push(new_passthroughfs_layer(cl_path));
        }

        // 添加只读下层
        lower_layers.push(new_passthroughfs_layer(lower));

        // 创建读写上层
        let upper_layer = new_passthroughfs_layer(upper);

        // 组装 OverlayFs
        let overlayfs = OverlayFs::new(
            Some(upper_layer),  // 读写层
            lower_layers,       // 只读层列表
            config,
            inode,
        )?;

        self.overlayfs.lock().await.insert(inode, Arc::new(overlayfs));
        Ok(())
    }
}
```

### 4.3 Inode 管理

FUSE 通过 inode 唯一标识文件。Scorpio 需要在多个 overlay 实例之间避免 inode 冲突，因此会做「按批分配」：

```rust
pub struct InodeAlloc {
    // 每个 overlay 分配一个 inode 区间
    // 避免不同 overlay 的 inode 冲突
    allocations: Mutex<HashMap<u64, InodeBatch>>,
}

struct InodeBatch {
    start: u64,
    end: u64,
    next: u64,
}

impl InodeAlloc {
    /// 为新的 overlay 分配 inode 批次
    pub async fn alloc_inode(&self, overlay_inode: u64) -> InodeBatch {
        let mut alloc = self.allocations.lock().await;

        // 计算新的区间
        let batch_size = 0x1000_0000;  // 每个 overlay 分配 256M 个 inode
        let start = overlay_inode * batch_size;
        let end = start + batch_size - 1;

        let batch = InodeBatch { start, end, next: start + 1 };
        alloc.insert(overlay_inode, batch);
        batch
    }
}
```

### 4.4 Antares：CI/CD 构建隔离

Antares 是基于 Scorpio 抽出来的一个「面向 CI/CD 的挂载层」，关注点是：

- 为每个构建 Job 提供独立的 Upper 层
- 共享只读的 Dicfuse 层，节省内存和网络

```text
┌──────────────────────────────────────────────────────────────┐
│                       CI/CD Pipeline                        │
│                                                              │
│  Job 1 ─────► Antares Mount ─────► /mnt/job1/                │
│               (独立工作空间)        ├── src/ (Dicfuse)        │
│                                    └── build/ (Upper)        │
│                                                              │
│  Job 2 ─────► Antares Mount ─────► /mnt/job2/                │
│               (独立工作空间)        ├── src/ (Dicfuse)        │
│                                    └── build/ (Upper)        │
│                                                              │
│  共享只读层：Dicfuse（单例，节省内存）                        │
└──────────────────────────────────────────────────────────────┘
```

实现上只是对 overlay 的一个包装：

```rust
pub struct AntaresFuse {
    pub mountpoint: PathBuf,
    pub upper_dir: PathBuf,           // 独立的写入层
    pub dic: Arc<Dicfuse>,            // 共享的只读层
    pub cl_dir: Option<PathBuf>,      // 可选的 CL 层
    fuse_task: Option<JoinHandle<()>>,
}

impl AntaresFuse {
    /// 构建 overlay 并挂载
    pub async fn mount(&mut self) -> std::io::Result<()> {
        let overlay = self.build_overlay().await?;

        // 启动 FUSE 会话
        let handle = mount_filesystem(overlay, &self.mountpoint).await;

        self.fuse_task = Some(tokio::spawn(async move {
            let _ = handle.await;
        }));

        Ok(())
    }

    /// 卸载
    pub async fn unmount(&mut self) -> std::io::Result<()> {
        // 调用 fusermount -u 卸载
        Command::new("fusermount")
            .arg("-u")
            .arg(&self.mountpoint)
            .output()
            .await?;
        Ok(())
    }
}
```

---

## 五、关键路径拆解

### 5.1 启动流程

```rust
#[tokio::main]
async fn main() {
    // 1. 加载配置
    config::init_config("scorpio.toml")?;

    // 2. 初始化 ScorpioManager，检查工作目录状态
    let mut manager = ScorpioManager::from_toml(config_file)?;
    manager.check().await;  // 同步目录树元数据

    // 3. 创建 MegaFuse，挂载工作目录
    let fuse = MegaFuse::new_from_manager(&manager).await;

    // 4. 启动 FUSE 会话
    let mount_handle = mount_filesystem(fuse, mountpoint).await;

    // 5. 启动 HTTP daemon
    tokio::spawn(daemon_main(Arc::new(fuse), manager));

    // 6. 等待退出信号
    tokio::select! {
        _ = mount_handle => {},
        _ = signal::ctrl_c() => {
            mount_handle.unmount().await?;
        }
    }
}
```

### 5.2 文件读取流程

```text
用户执行: cat /workspace/src/main.rs
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  1. VFS → FUSE 内核模块 → /dev/fuse                     │
│     FUSE_LOOKUP: parent=1, name="src"                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. MegaFuse.lookup(parent=1, name="src")               │
│     → 查找 overlay 映射                                  │
│     → 委托给 OverlayFs.lookup()                          │
│     → 返回 inode=2, attr={dir, mode=0755}               │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. MegaFuse.lookup(parent=2, name="main.rs")           │
│     → OverlayFs 按优先级查找：                           │
│       a. Upper 层：不存在                                │
│       b. Lower 层 (Dicfuse)：存在元数据                  │
│     → 返回 inode=42, attr={file, size=1024}             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. MegaFuse.open(inode=42, flags=O_RDONLY)             │
│     → 返回 file handle                                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  5. MegaFuse.read(inode=42, offset=0, size=4096)        │
│     → OverlayFs.read() → Dicfuse.read()                 │
│     → 检查 Content Store：未命中                         │
│     → HTTP GET /api/v1/blob/{sha1}                      │
│     → 缓存内容到 Content Store                           │
│     → 返回文件数据                                       │
└─────────────────────────────────────────────────────────┘
```

### 5.3 文件写入（Copy-on-Write）

```text
用户执行: echo "new content" >> /workspace/src/main.rs
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  1. MegaFuse.open(inode=42, flags=O_WRONLY|O_APPEND)    │
│     → OverlayFs 检测到写操作                             │
│     → 触发 Copy-on-Write                                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Copy-on-Write 过程：                                │
│     a. 从 Lower 层读取原始内容                           │
│     b. 在 Upper 层创建同名文件                           │
│     c. 将原始内容复制到 Upper 层                         │
│     d. 标记 Upper 层文件为"覆盖"                         │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. MegaFuse.write(inode=42, data="new content\n")      │
│     → 写入 Upper 层文件                                  │
│     → Lower 层原始文件保持不变                           │
└─────────────────────────────────────────────────────────┘

写入后的层结构：
┌─────────────┐
│ Upper Layer │  src/main.rs  ← 包含新内容
├─────────────┤
│ Lower Layer │  src/main.rs  ← 原始内容（被遮盖）
└─────────────┘
```

### 5.4 提交流程

```text
用户执行: scorpio commit -m "update main.rs"
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  1. 扫描 Upper 层变更                                    │
│     → 遍历 upper/ 目录                                   │
│     → 收集所有修改/新增/删除的文件                        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. 构建 Git 对象                                        │
│     a. 为每个修改的文件创建 Blob 对象                    │
│     b. 构建新的 Tree 对象（合并变更）                    │
│     c. 创建 Commit 对象                                  │
│        - parent: 上一个 commit                          │
│        - tree: 新的根 tree                              │
│        - message: "update main.rs"                      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. 推送到服务器                                         │
│     POST /api/v1/commit                                 │
│     Body: { objects: [...], commit: {...} }             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. 更新本地状态                                         │
│     → 清空 Upper 层                                      │
│     → 更新 Tree Store 到新 commit                        │
└─────────────────────────────────────────────────────────┘
```

---

## 六、性能优化策略

### 6.1 元数据预取

目录树可以提前拉取，降低首次访问延迟：

```rust
impl Dicfuse {
    /// 批量预取目录内容
    pub async fn prefetch_directory(&self, inode: u64) {
        let tree = fetch_tree(inode).await;

        // 将所有子项元数据存入 Tree Store
        for item in tree.items {
            self.store.insert_metadata(item);
        }
    }
}
```

### 6.2 内容缓存策略

```text
┌─────────────────────────────────────────────────────────┐
│                    缓存层次                              │
│                                                         │
│  L1: 内存缓存 (LRU，限制大小)                           │
│       ↓ miss                                            │
│  L2: 本地磁盘缓存 (Content Store)                       │
│       ↓ miss                                            │
│  L3: Mega 服务器                                        │
└─────────────────────────────────────────────────────────┘
```

### 6.3 并发控制

对读多写少的场景，用 `RwLock` 做简单的读写分离：

```rust
pub struct DictionaryStore {
    tree_cache: RwLock<HashMap<u64, TreeNode>>,
    content_cache: RwLock<HashMap<u64, Vec<u8>>>,
}

// 读操作使用读锁，允许并发
async fn get_metadata(&self, inode: u64) -> Option<TreeNode> {
    self.tree_cache.read().await.get(&inode).cloned()
}

// 写操作使用写锁
async fn insert_metadata(&self, inode: u64, node: TreeNode) {
    self.tree_cache.write().await.insert(inode, node);
}
```

---

## 七、与其他方案对比

| 特性 | Scorpio | Git Sparse Checkout | VFS for Git | GitFS |
|------|---------|---------------------|-------------|-------|
| 按需加载 | ✅ | ❌（需预定义） | ✅ | ✅ |
| 本地修改 | ✅ | ✅ | ✅ | ❌ |
| 版本控制 | ✅（内置） | ✅（Git） | ✅（Git） | ❌ |
| 构建隔离 | ✅（Antares） | ❌ | ❌ | ❌ |
| 实现方式 | FUSE | Git 原生 | FUSE | FUSE |
| 平台支持 | Linux/macOS | 全平台 | Windows | Linux |

---

## 八、使用示例

### 8.1 基本使用

```bash
# 启动 Scorpio
./scorpio -c scorpio.toml

# 查看挂载的工作空间
ls /workspace
# src/  Cargo.toml  README.md

# 像普通仓库一样使用
cd /workspace
cargo build
vim src/main.rs

# 提交变更
curl -X POST http://localhost:8000/api/commit \
  -H "Content-Type: application/json" \
  -d '{"message": "fix bug"}'
```

### 8.2 Antares 在 CI/CD 中的使用

```bash
# 启动 Antares daemon
./antares serve --bind 0.0.0.0:2726

# 创建构建环境
curl -X POST http://localhost:2726/mounts \
  -H "Content-Type: application/json" \
  -d '{
    "mountpoint": "/mnt/job1",
    "upper_dir": "/var/antares/upper/job1",
    "labels": ["ci", "build"],
    "readonly": false
  }'

# 在隔离环境中构建
cd /mnt/job1
./build.sh

# 清理
curl -X DELETE http://localhost:2726/mounts/{mount_id}
```

---

## 九、总结

从整体上看，Scorpio 用 FUSE 搭了一套适合大体量 monorepo 的访问方案：

1. **FUSE 提供基础设施**：把文件系统逻辑放在用户态，避免内核开发成本
2. **Dicfuse 负责按需加载**：目录树和文件内容解耦，内容按访问懒加载
3. **OverlayFs 提供本地读写语义**：Copy-on-Write 保护远程只读层，同时允许本地修改
4. **Antares 面向 CI/CD 做隔离**：为流水线构建提供轻量、可回收的工作空间

这种组合在以下场景特别有价值：

- 超大体量 monorepo（数十 GB 甚至更大）
- 频繁切换分支 / 项目子目录
- CI/CD 构建隔离和缓存复用
- 带宽或磁盘资源受限的环境

---

## 参考资料

- [FUSE Protocol Specification](https://libfuse.github.io/doxygen/)
- [Linux OverlayFS Documentation](https://docs.kernel.org/filesystems/overlayfs.html)
- [rfuse3 - Rust FUSE Library](https://docs.rs/rfuse3)
- [Mega Project](https://github.com/web3infra-foundation/mega)
