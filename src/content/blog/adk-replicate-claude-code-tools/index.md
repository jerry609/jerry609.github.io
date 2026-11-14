---
title: '用 Google ADK 复现 Claude Code 工具系统'
description: '使用 Google Agent Development Kit (ADK) 从零实现 Grep、Glob、Read、Write、Edit、Bash 等核心工具，对比两种 Agent 框架的工具实现范式。'
publishDate: '2025-12-06'
layer: agent
tags: ['Google ADK', 'Claude', 'Agent', 'Tools', 'Python']
language: 'zh-CN'
draft: true
---

> 上一篇我们分析了 Claude Code 的内置工具系统。本文将使用 Google ADK 从零实现同样的工具集，直观展示两种框架在工具定义上的差异。

> 📚 系列相关文章：
> - 上一篇：**[Claude Code 工具系统：内置工具的实现剖析](/blog/claude-code-tools-implementation/)**（从 Claude 视角看 Glob/Grep/Read/Write/Bash 等内置工具）
> - 本文：**用 Google ADK 复现 Claude Code 工具系统**（在 ADK 中实现一套相同能力的工具集）
> - 延伸阅读：**[Claude Agent SDK vs Google ADK：两种 Agent 开发范式的深度对比](/blog/claude-sdk-vs-google-adk-1/)**（从更大尺度比较两家 SDK 的设计哲学）

## 一、ADK 工具定义基础

在 Google ADK 中，工具就是普通的 Python 函数。ADK 会自动从函数签名和 docstring 提取 Schema：

```python
from google.adk import Agent
from google.adk.tools import FunctionTool

def my_tool(param1: str, param2: int = 10) -> str:
    """工具描述会变成 description。
    
    Args:
        param1: 第一个参数的说明
        param2: 第二个参数的说明，有默认值
    
    Returns:
        返回结果的说明
    """
    return f"执行完成: {param1}, {param2}"

# 注册到 Agent
agent = Agent(
    model="gemini-2.5-flash",
    tools=[my_tool],  # 直接传函数
)
```

从源码角度看，`tools=[my_tool]` 底下会被包装成一个 `FunctionTool(my_tool)` 实例。ADK 会在 `function_tool.py` / `_automatic_function_calling_util.py` 里通过 `inspect` + `pydantic.create_model(...).model_json_schema()` 自动生成 JSON Schema，并转换成 Gemini 的 `FunctionDeclaration`，这一层机制让「函数即工具」真正可用。

---

## 二、实现文件读取类工具

### 2.1 Glob —— 文件模式匹配

```python
import fnmatch
from pathlib import Path
from typing import Optional

def glob_files(
    pattern: str,
    path: str = ".",
    ignore_patterns: Optional[list[str]] = None
) -> list[str]:
    """基于 glob 模式快速查找文件。
    
    Args:
        pattern: glob 模式，如 '**/*.py' 或 'src/**/*.ts'
        path: 搜索的根目录
        ignore_patterns: 要忽略的模式列表，如 ['node_modules', '.git']
    
    Returns:
        匹配的文件路径列表
    """
    ignore_patterns = ignore_patterns or ["node_modules", ".git", "__pycache__", ".venv"]
    root = Path(path).resolve()
    results = []
    
    for file_path in root.glob(pattern):
        # 检查是否应该忽略
        relative = str(file_path.relative_to(root))
        should_ignore = any(
            fnmatch.fnmatch(relative, f"*{ignore}*") 
            for ignore in ignore_patterns
        )
        if not should_ignore and file_path.is_file():
            results.append(str(file_path))
    
    # 限制返回数量，避免 Token 爆炸
    return results[:100]
```

### 2.2 Grep —— 内容搜索

```python
import re
import subprocess
from pathlib import Path
from dataclasses import dataclass

@dataclass
class GrepMatch:
    file: str
    line_number: int
    content: str

def grep_search(
    pattern: str,
    path: str = ".",
    include: Optional[list[str]] = None,
    max_results: int = 50
) -> list[dict]:
    """在文件中搜索匹配正则表达式的内容。
    
    Args:
        pattern: 正则表达式模式
        path: 搜索路径（文件或目录）
        include: 要包含的文件类型，如 ['*.py', '*.ts']
        max_results: 最大返回结果数
    
    Returns:
        匹配结果列表，每项包含 file, line_number, content
    """
    # 优先使用 ripgrep（如果可用）
    try:
        args = ["rg", "--json", "-m", str(max_results), pattern, path]
        if include:
            for glob in include:
                args.extend(["--glob", glob])
        
    result = subprocess.run(args, capture_output=True, text=True)
    # 解析 ripgrep JSON 输出（此处仅作示意，真实实现需要遍历每一行 JSON 事件并提取 match 信息）
    return _parse_rg_output(result.stdout)  # 伪实现占位
    except FileNotFoundError:
        # 回退到 Python 实现
        return _python_grep(pattern, path, include, max_results)

def _python_grep(
    pattern: str, 
    path: str, 
    include: Optional[list[str]], 
    max_results: int
) -> list[dict]:
    """纯 Python 实现的 grep"""
    regex = re.compile(pattern)
    results = []
    root = Path(path)
    
    files = root.rglob("*") if root.is_dir() else [root]
    
    for file_path in files:
        if not file_path.is_file():
            continue
        if include and not any(file_path.match(p) for p in include):
            continue
        
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            for i, line in enumerate(content.splitlines(), 1):
                if regex.search(line):
                    results.append({
                        "file": str(file_path),
                        "line_number": i,
                        "content": line.strip()[:200]  # 截断长行
                    })
                    if len(results) >= max_results:
                        return results
        except Exception:
            continue
    
    return results
```

### 2.3 Read —— 文件读取

```python
from pathlib import Path

def read_file(
    path: str,
    offset: int = 0,
    limit: int = 2000
) -> str:
    """读取文件内容，支持行范围限制。
    
    Args:
        path: 文件路径
        offset: 起始行号（从 0 开始）
        limit: 最大读取行数
    
    Returns:
        带行号的文件内容（类似 cat -n 格式）
    """
    file_path = Path(path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"文件不存在: {path}")
    
    if not file_path.is_file():
        raise ValueError(f"路径不是文件: {path}")
    
    # 检查文件大小
    if file_path.stat().st_size > 10 * 1024 * 1024:  # 10MB
        raise ValueError("文件过大，请使用 offset/limit 分段读取")
    
    content = file_path.read_text(encoding='utf-8', errors='replace')
    lines = content.splitlines()
    
    # 应用 offset 和 limit
    selected_lines = lines[offset:offset + limit]
    
    # 格式化输出（带行号）
    result = []
    for i, line in enumerate(selected_lines, start=offset + 1):
        result.append(f"{i:6d}\t{line}")
    
    return "\n".join(result)
```

### 2.4 LS —— 目录列表

```python
from pathlib import Path
from datetime import datetime

def list_directory(
    path: str = ".",
    ignore: Optional[list[str]] = None
) -> list[dict]:
    """列出目录内容。
    
    Args:
        path: 目录路径
        ignore: 要忽略的模式列表
    
    Returns:
        目录内容列表，包含 name, type, size, modified
    """
    ignore = ignore or ["node_modules", ".git", "__pycache__"]
    dir_path = Path(path)
    
    if not dir_path.is_dir():
        raise ValueError(f"路径不是目录: {path}")
    
    results = []
    for item in sorted(dir_path.iterdir()):
        # 检查忽略
        if any(item.name == ign for ign in ignore):
            continue
        
        stat = item.stat()
        results.append({
            "name": item.name,
            "type": "directory" if item.is_dir() else "file",
            "size": stat.st_size if item.is_file() else None,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
        })
    
    return results
```

---

## 三、实现文件写入类工具

### 3.1 Write —— 文件写入

```python
from pathlib import Path
import tempfile
import shutil

def write_file(path: str, content: str) -> dict:
    """将内容写入文件。如果文件存在会被覆盖。
    
    Args:
        path: 目标文件路径
        content: 要写入的内容
    
    Returns:
        操作结果，包含 success 和 path
    """
    file_path = Path(path)
    
    # 自动创建父目录
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 使用临时文件 + rename 实现原子写入
    temp_fd, temp_path = tempfile.mkstemp(
        dir=file_path.parent, 
        prefix=".tmp_"
    )
    try:
        with open(temp_fd, 'w', encoding='utf-8') as f:
            f.write(content)
        shutil.move(temp_path, file_path)
    except Exception as e:
        Path(temp_path).unlink(missing_ok=True)
        raise e
    
    return {"success": True, "path": str(file_path)}
```

### 3.2 Edit —— 精确编辑

```python
from pathlib import Path
import re

def edit_file(
    path: str,
    old_string: str,
    new_string: str
) -> dict:
    """编辑文件的特定部分。
    
    Args:
        path: 文件路径
        old_string: 要替换的原内容（必须完全匹配）
        new_string: 替换后的新内容
    
    Returns:
        操作结果
    """
    file_path = Path(path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"文件不存在: {path}")
    
    content = file_path.read_text(encoding='utf-8')
    
    # 计算匹配次数
    escaped = re.escape(old_string)
    matches = re.findall(escaped, content)
    
    if len(matches) == 0:
        raise ValueError("未找到要替换的内容，请检查 old_string 是否正确")
    
    if len(matches) > 1:
        raise ValueError(
            f"找到 {len(matches)} 处匹配，请提供更精确的上下文使其唯一"
        )
    
    # 执行替换
    new_content = content.replace(old_string, new_string, 1)
    file_path.write_text(new_content, encoding='utf-8')
    
    return {
        "success": True,
        "path": str(file_path),
        "changes": 1
    }
```

### 3.3 MultiEdit —— 批量编辑

```python
from typing import TypedDict

class EditOperation(TypedDict):
    path: str
    old_string: str
    new_string: str

def multi_edit(edits: list[EditOperation]) -> list[dict]:
    """批量编辑多个位置。
    
    Args:
        edits: 编辑操作列表，每项包含 path, old_string, new_string
    
    Returns:
        每个编辑操作的结果列表
    """
    results = []
    
    for edit in edits:
        try:
            result = edit_file(
                edit["path"],
                edit["old_string"],
                edit["new_string"]
            )
            results.append(result)
        except Exception as e:
            results.append({
                "success": False,
                "path": edit["path"],
                "error": str(e)
            })
    
    return results
```

---

## 四、实现命令执行工具

### 4.1 Bash —— Shell 命令执行

```python
import subprocess
import shlex
from typing import Optional

# 危险命令黑名单
BLOCKED_COMMANDS = [
    "rm -rf /",
    "rm -rf ~",
    "mkfs",
    ":(){:|:&};:",  # Fork 炸弹
]

def bash_execute(
    command: str,
    timeout: int = 30,
    cwd: Optional[str] = None
) -> dict:
    """在 Shell 中执行命令。
    
    Args:
        command: 要执行的命令
        timeout: 超时时间（秒）
        cwd: 工作目录
    
    Returns:
        执行结果，包含 stdout, stderr, exit_code
    """
    # 安全检查
    for blocked in BLOCKED_COMMANDS:
        if blocked in command:
            raise ValueError(f"命令被安全策略禁止: {command}")
    
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd
        )
        
        # 截断过长输出
        max_output = 10000  # 字符
        stdout = result.stdout[:max_output]
        stderr = result.stderr[:max_output]
        
        if len(result.stdout) > max_output:
            stdout += f"\n... (输出被截断，共 {len(result.stdout)} 字符)"
        
        return {
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": result.returncode
        }
    
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"命令超时 ({timeout}s)",
            "exit_code": -1
        }
```

---

## 五、组装完整的 ADK Agent

```python
from google.adk import Agent
from google.adk.models import Gemini

# 创建带有所有工具的 Agent
coding_agent = Agent(
    name="CodingAgent",
    model=Gemini(model="gemini-2.5-flash"),
    description="一个具备文件操作和命令执行能力的编程助手",
    instruction="""你是一个编程助手。使用以下工具来帮助用户：
    
    文件搜索：
    - 用 glob_files 查找文件
    - 用 grep_search 搜索内容
    - 用 read_file 读取文件
    - 用 list_directory 列出目录
    
    文件修改：
    - 用 write_file 创建/覆盖文件
    - 用 edit_file 精确修改文件
    - 用 multi_edit 批量修改
    
    命令执行：
    - 用 bash_execute 运行 Shell 命令
    
    优先使用专用工具，而非 bash_execute + 命令组合。
    """,
    tools=[
        # 读取类
        glob_files,
        grep_search,
        read_file,
        list_directory,
        # 写入类
        write_file,
        edit_file,
        multi_edit,
        # 执行类
        bash_execute,
    ],
)

# 运行示例
async def main():
    result = await coding_agent.run("帮我找出所有 Python 文件中包含 'TODO' 的地方")
    print(result.output)
```

---

## 六、对比：Claude Code vs ADK 工具实现

| 维度 | Claude Code | Google ADK |
|:-----|:------------|:-----------|
| **工具定义** | 内置于 CLI | 自己用 Python 函数定义 |
| **底层实现** | ripgrep, fast-glob 等优化工具 | 自己选择（可调用 rg，也可纯 Python） |
| **权限控制** | 内置 `can_use_tool` + Hook | 自己在函数里实现 |
| **沙箱** | CLI 层面的 Sandbox | 需要自己用 Docker/容器 |
| **开发体验** | 开箱即用 | 灵活但需要自己实现 |

---

## 七、进阶：添加权限控制

```python
from functools import wraps
from typing import Callable

# 简易权限控制装饰器
def require_permission(permission: str):
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 这里可以接入你的权限系统（数据库 / 配置文件 / 内存表等），此处为示意实现
            if not check_permission(permission):
                raise PermissionError(f"需要权限: {permission}")
            return func(*args, **kwargs)
        return wrapper
    return decorator

@require_permission("file:write")
def write_file(path: str, content: str) -> dict:
    # ... 实现
    pass

@require_permission("bash:execute")
def bash_execute(command: str, timeout: int = 30) -> dict:
    # ... 实现
    pass
```

---

## 八、总结

通过 ADK 复现 Claude Code 的工具系统，我们可以清晰地看到两种框架的差异：

- **Claude Code**：工具作为"内置能力"，SDK 只是遥控器
- **Google ADK**：工具完全由你定义，框架只负责编排

ADK 的优势在于**完全可控**——你可以选择底层实现（ripgrep vs 纯 Python）、定制权限逻辑、添加审计日志等。

代价是**需要自己造轮子**——Claude Code 的内置工具已经做了大量优化（性能、Token 效率、安全边界），而 ADK 需要你自己实现这些。


## 附录：Gemini CLI 的工具是怎么写的？

本文主线是用 ADK 复刻 Claude Code 的工具，但如果你顺着仓库继续往下挖，会发现 **Gemini CLI 自己也内置了一套非常工程化的工具系统**。

在 `gemini-cli/packages/core/src/tools/` 目录下，每个工具都是一个 TypeScript 类，继承自 `BaseDeclarativeTool`：

```ts
// 以 ReadFileTool 为例（简化）
export class ReadFileTool extends BaseDeclarativeTool<ReadFileToolParams, ToolResult> {
    static readonly Name = READ_FILE_TOOL_NAME;

    constructor(private config: Config, messageBus?: MessageBus) {
        super(
            ReadFileTool.Name,
            'ReadFile',
            'Reads and returns the content of a specified file...',
            Kind.Read,                    // 工具类型：读/写/执行
            {
                properties: {
                    file_path: { type: 'string' },
                    offset: { type: 'number' },
                    limit: { type: 'number' },
                },
                required: ['file_path'],
                type: 'object',
            },
            true,   // isOutputMarkdown
            false,  // canUpdateOutput
            messageBus,
        );
    }

    protected override validateToolParamValues(params: ReadFileToolParams): string | null {
        // 强制参数校验（路径必须在 workspace 内等）
        // ... 详见 read-file.ts
        return null;
    }

    protected createInvocation(params: ReadFileToolParams, messageBus?: MessageBus) {
        return new ReadFileToolInvocation(this.config, params, messageBus);
    }
}
```

再比如 Shell 命令工具 `ShellTool`，会在 `shell.ts` 里：

```ts
export class ShellToolInvocation extends BaseToolInvocation<ShellToolParams, ToolResult> {
    protected override async getConfirmationDetails(...): Promise<ToolCallConfirmationDetails | false> {
        const command = stripShellWrapper(this.params.command);
        const rootCommands = [...new Set(getCommandRoots(command))];

        // 非交互模式下，如果命令不在 allowlist 里，直接报错而不是卡住等用户输入
        if (!this.config.isInteractive() && this.config.getApprovalMode() !== ApprovalMode.YOLO) {
            if (this.isInvocationAllowlisted(command)) {
                return false;
            }
            throw new Error(`Command "${command}" is not in the list of allowed tools...`);
        }

        // 交给 MessageBus + UI 做确认
        // ... 详见 shell.ts
    }
}
```

和 ADK 相比，Gemini CLI 的工具实现有几个明显特征：

- **强类型 + 手写 Schema**：每个工具都显式给出参数 JSON Schema，而不是从函数签名自动生成
- **验证与执行分离**：`BaseDeclarativeTool` 负责声明和参数校验，`*ToolInvocation` 负责真正的执行逻辑
- **内建策略与确认系统**：通过 `MessageBus` + policy engine 决定工具是否需要用户确认，甚至可以动态更新「永远允许」策略

如果把三者放在一起看：

- Claude Code：**工具是内置产品能力**，你只能遥控
- Gemini CLI：**工具是 CLI 的一等公民**，为本地开发体验做了大量工程优化
- Google ADK：**工具是你写的函数**，框架帮你接到 LLM 上

