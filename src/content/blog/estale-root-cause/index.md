---
title: "ESTALE / StaleNetworkFileHandle Root Cause Analysis"
description: "深入分析 ESTALE (errno 116, StaleNetworkFileHandle) 错误在 Antares/Dicfuse 虚拟文件系统中的根本原因、触发链路及修复方案。涵盖 libfuse-fs 的 open_by_handle_at 机制、Dicfuse 目录刷新逻辑，以及短期缓解与长期修复策略。"
publishDate: "2026-01-31"
tags: ["FUSE", "FileSystem", "Debug", "Root Cause Analysis", "ai 整理生成"]
draft: false
---

## 概述

ESTALE (errno 116, StaleNetworkFileHandle) 错误在 Antares/Dicfuse 虚拟文件系统中偶发出现，导致构建中断或文件操作失败。本文档分析其根本原因、触发链路及修复方案。

---

## 症状表现

- 日志中出现 `open_by_handle_at failed error ... (code: 116, StaleNetworkFileHandle)`
- `libfuse_fs::passthrough::async_io` 显示 `do_getattr` 失败，错误码 `ESTALE`
- `buck2 targets //...` 或大规模文件扫描时概率性中断
- 需要 unmount/remount 后才能恢复正常

---

## 架构背景

```
┌─────────────────────────────────────────────────────────────┐
│                      Buck2 / 用户进程                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ FUSE syscall
┌─────────────────────────────────────────────────────────────┐
│                      OverlayFs (UnionFS)                     │
│   ┌─────────────┬─────────────┬─────────────────────────┐   │
│   │ Upper Layer │  CL Layer   │      Lower Layer        │   │
│   │ (Passthrough)│(Passthrough)│      (Dicfuse)          │   │
│   └─────────────┴─────────────┴─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   local disk          local disk             Mega 后端 API
  (upper_dir)           (cl_dir)            (tree/blob fetch)
```

**关键路径:**
- `scorpio/src/antares/fuse.rs:45-70` - AntaresFuse 构建 OverlayFs
- `scorpio/src/dicfuse/store.rs` - DictionaryStore 管理元数据/内容缓存
- `libfuse-fs` crate - Passthrough 层使用 `open_by_handle_at()` 打开文件

---

## 触发链路 (Trigger Chain)

```
                                 ┌──────────────────────────┐
                                 │  Dicfuse 后台刷新目录     │
                                 │  (TTL=5s 触发)           │
                                 └───────────┬──────────────┘
                                             │
                    ┌────────────────────────▼────────────────────────┐
                    │  文件 inode/btime 发生变化                        │
                    │  (后端更新、内容变化等)                            │
                    └────────────────────────┬────────────────────────┘
                                             │
    ┌────────────────────────────────────────▼────────────────────────────────────┐
    │  Passthrough 层 FileHandle 缓存仍持有旧的 (inode, btime) → handle 映射        │
    └────────────────────────────────────────┬────────────────────────────────────┘
                                             │
                    ┌────────────────────────▼────────────────────────┐
                    │  用户进程请求 open() → 使用缓存的旧 handle          │
                    │  → open_by_handle_at() 返回 ESTALE               │
                    └────────────────────────┬────────────────────────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │  错误向上传播，I/O 失败       │
                              └─────────────────────────────┘
```

**详细步骤:**

1. **Passthrough 使用 open-by-handle 机制**: `OpenableFileHandle::open()` 调用 `open_by_handle_at()` 系统调用
2. **Handle 缓存失效**: 缓存 key 为 `(inode, btime)`；当 Dicfuse 后台刷新导致文件 inode/btime 变化时，缓存的 handle 不再有效
3. **UnionFS 仅在 stat 路径处理 ESTALE**: `stat64_ignore_enoent()` 将 `ESTALE` 视为 `ENOENT`，但 **open 路径不做此处理**
4. **结果**: `open_by_handle_at()` 返回 `ESTALE` 后，错误持续传播直到文件系统重新挂载

---

## 关键代码引用

### 1) libfuse-fs: `open_by_handle_at()` 无重试/刷新逻辑

**路径**: `~/.cargo/registry/src/.../libfuse-fs-0.1.9/src/passthrough/file_handle.rs`

```rust
pub fn open(&self, flags: libc::c_int) -> io::Result<File> {
    let ret = unsafe {
        open_by_handle_at(self.mount_fd.as_fd().as_raw_fd(),
                          self.handle.handle.wrapper.as_fam_struct_ptr(),
                          flags)
    };
    if ret >= 0 { Ok(File::from_raw_fd(ret)) } else {
        let e = io::Error::last_os_error();
        error!("open_by_handle_at failed error {e:?}");
        Err(e)  // ❌ 直接返回错误，无 ESTALE 特殊处理
    }
}
```

### 2) libfuse-fs: Handle 缓存 key = inode + btime

**路径**: `~/.cargo/registry/src/.../libfuse-fs-0.1.9/src/passthrough/mod.rs`

```rust
#[derive(Debug, Hash, Eq, PartialEq)]
struct FileUniqueKey(u64, statx_timestamp);  // (inode, btime)

// open_file_and_handle()
let st = statx::statx(&path_file, None)?;
let key = FileUniqueKey(st.st.st_ino, st.btime.unwrap());
if let Some(h) = cache.get(&key).await { ... }  // 命中缓存则复用 handle
```

### 3) libfuse-fs: UnionFS 仅在 stat 路径处理 ESTALE

**路径**: `~/.cargo/registry/src/.../libfuse-fs-0.1.9/src/unionfs/mod.rs`

```rust
match self.stat64(req).await {
    Ok(v) => Ok(Some(v)),
    Err(e) => match e.raw_os_error() {
        Some(raw) if raw == libc::ENOENT
            || raw == libc::ENAMETOOLONG
            || raw == libc::ESTALE => Ok(None),  // ✓ stat 路径: ESTALE → None
        _ => Err(e),
    },
}
// ❌ open 路径无类似处理
```

### 4) Mega: Dicfuse 目录刷新逻辑

**路径**: `scorpio/src/dicfuse/store.rs:1099-1106`

```rust
let ttl = self.dir_sync_ttl();  // 默认 5 秒

// Fast path: already loaded and still fresh.
if let Some(dir) = self.dirs.get(&parent_user_path) {
    if dir.loaded && !dir_needs_refresh(&dir, ttl) {
        return Ok(());
    }
}
// → 超过 TTL 则触发远程刷新，可能导致 inode/btime 变化
```

**路径**: `scorpio/src/dicfuse/store.rs:1152-1155`

```rust
// If a file changed, invalidate cached content so reads refetch lazily.
if !is_dir {
    let _ = self.remove_file_by_node(child_inode);  // 仅清除内容缓存
}
// ❌ 未通知 Passthrough 层清除 file handle 缓存
```

---

## 项目特定放大因素

### 1) 短 TTL 增加 inode 变动频率

| 配置项 | 默认值 | 位置 |
|--------|--------|------|
| `dicfuse_dir_sync_ttl_secs` | 5 秒 | `scorpio/src/util/config.rs:21` |
| `antares_dicfuse_dir_sync_ttl_secs` | 5 秒 | `scorpio/src/util/config.rs:300` |

**实际配置** (`scorpio/scorpio.toml`):
```toml
dicfuse_dir_sync_ttl_secs = "5"
antares_dicfuse_dir_sync_ttl_secs = "5"
```

### 2) 大规模目标扫描加剧碰撞概率

`buck2 targets //...` 会遍历整个仓库，在 5 秒 TTL 窗口内触发大量目录刷新，极大增加 ESTALE 碰撞概率。

### 3) 多层 Union 叠加

Antares 使用 3 层 Union (Upper + CL + Dicfuse lower)，每层 Passthrough 都有独立的 handle 缓存，任一层 ESTALE 都会导致整体失败。

---

## 复现条件

1. Antares mount 挂载成功
2. 运行 `buck2 targets //...` 或其他大规模文件遍历
3. 等待 > 5 秒 (TTL 超时)，后台 Dicfuse 刷新目录
4. 继续访问刷新过的文件 → 概率性触发 ESTALE

---

## 现有缓解措施

### 1) Orion: buck2 targets 重试机制

**路径**: `orion/src/buck_controller.rs:429-464`

```rust
fn get_repo_targets(file_name: &str, repo_path: &Path) -> anyhow::Result<Targets> {
    const MAX_ATTEMPTS: usize = 2;  // 最多重试 2 次

    for attempt in 1..=MAX_ATTEMPTS {
        // ... run buck2 targets ...
        if status.success() {
            return Targets::from_file(&jsonl_path);
        }
        if attempt < MAX_ATTEMPTS {
            std::thread::sleep(std::time::Duration::from_secs(1));  // 重试间隔 1 秒
        }
    }
    Err(anyhow!("buck2 targets failed after {MAX_ATTEMPTS} attempts"))
}
```

### 2) AntaresFuse: lazy unmount

**路径**: `scorpio/src/antares/fuse.rs:132-135`

```rust
.arg("-uz")  // -u: unmount, -z: lazy unmount
```

---

## 短期缓解方案 (Stopgap)

| 方案 | 优点 | 缺点 |
|------|------|------|
| **增加 `dir_sync_ttl`** (如 30-60 秒) | 减少刷新频率 | 元数据更新延迟增加 |
| **限制 buck2 扫描范围** | 降低碰撞概率 | 功能受限 |
| **调用层重试** | 透明恢复 | 增加延迟，不解决根因 |

**推荐配置调整** (`scorpio.toml`):
```toml
dicfuse_dir_sync_ttl_secs = "30"
antares_dicfuse_dir_sync_ttl_secs = "60"
```

---

## 长期修复方案

### 方案 A: libfuse-fs ESTALE 自动恢复 (推荐)

**修改位置**: `libfuse-fs/src/passthrough/file_handle.rs`

```rust
pub fn open(&self, flags: libc::c_int) -> io::Result<File> {
    let ret = unsafe { open_by_handle_at(...) };
    if ret >= 0 {
        Ok(File::from_raw_fd(ret))
    } else {
        let e = io::Error::last_os_error();
        if e.raw_os_error() == Some(libc::ESTALE) {
            // 新增: 清除缓存并重试
            self.invalidate_handle_cache();
            return self.open_via_path_fallback(flags);
        }
        Err(e)
    }
}
```

### 方案 B: Dicfuse 刷新时主动清除 Passthrough 缓存

**修改位置**: `scorpio/src/dicfuse/store.rs`

当检测到文件变化时，通知 Passthrough 层清除对应的 handle 缓存:

```rust
// 在 dir refresh 逻辑中
if file_changed {
    self.remove_file_by_node(child_inode);
    // 新增: 通知 Passthrough 层
    passthrough_layer.invalidate_handle_for_inode(child_inode);
}
```

### 方案 C: 禁用 open-by-handle 机制

在 `PassthroughArgs` 中增加选项，允许 fallback 到纯路径打开:

```rust
PassthroughArgs {
    root_dir: &self.upper_dir,
    mapping: None::<String>,
    use_file_handle: false,  // 新增: 禁用 open_by_handle_at
}
```

**权衡**: 性能略降，但完全规避 ESTALE 问题。

---

## 已知限制

- 本分析基于 `libfuse-fs` 0.1.9 版本
- 如上游更新 handle 缓存策略，需重新评估
- 方案 A/B 需修改 `libfuse-fs` crate (可能需 fork 或提 PR)

---

## 相关链接

- [Linux man: open_by_handle_at(2)](https://man7.org/linux/man-pages/man2/open_by_handle_at.2.html)
- ESTALE 错误码定义: `ESTALE = 116` (Stale file handle)
- Mega 配置: `scorpio/scorpio.toml`
- Antares FUSE: `scorpio/src/antares/fuse.rs`
