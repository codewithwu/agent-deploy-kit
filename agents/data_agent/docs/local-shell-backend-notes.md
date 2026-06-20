# `LocalShellBackend` 与 deepagents 工具链笔记

> 范围：`agents/data_agent/data_agent.ipynb` 跑通过程中涉及的概念与踩坑记录。
> 适用读者：以后接手 `data_agent` / 想复用 `LocalShellBackend` 的同学。
> 内容来源：从 `deepagents==0.5.x` 与 `langchain-core` 源码分析 + 一次实际 agent 跑出来的 trace 复盘。

---

## 1. `LocalShellBackend` 是什么

源码：`.venv/lib/python3.13/site-packages/deepagents/backends/local_shell.py`

类签名：

```python
class LocalShellBackend(FilesystemBackend, SandboxBackendProtocol):
```

继承两个父类，能力是两者之和：

| 父类 | 提供的能力 | 来源 |
|---|---|---|
| `FilesystemBackend` | `read` / `write` / `ls` / `glob` / `grep` / `upload_files` / `download_files` | `backends/filesystem.py` |
| `SandboxBackendProtocol` | `execute` / `aexecute` 跑 shell 命令 | `backends/protocol.py` |

在 deepagents 体系里 backend 是给 deep agent 用的"**文件系统 + 执行环境**"抽象层（类似 LangChain 的工具后端）。`LocalShellBackend` 是其中**最危险但也最直接**的实现 —— 直接在宿主机上跑，**没有沙箱**。

### 安全模型（核心）

源码 `local_shell.py:1-6` 的 docstring 写得很直白：

> Filesystem backend with **unrestricted local shell execution**.
> This backend provides **NO sandboxing or isolation** - all operations run directly on the host machine with full system access.

具体风险：

- agent 可读**任何可达文件**（API key、`.env`、SSH key）—— `virtual_mode` 拦不住
- agent 可执行**任意 shell 命令**，含 `curl`、网络外联、装包、改系统
- 无进程隔离、无资源限制（CPU/内存/磁盘）
- 修改和执行是**永久且不可逆**的

**只适用于**：本地开发 CLI、信任 agent 输出的个人开发环境、CI/CD 配合 secret 管理。
**不能用于**：生产环境、多租户系统、处理不可信输入。

---

## 2. 构造函数逐参数

```python
def __init__(
    self,
    root_dir: str | Path | None = None,
    *,
    virtual_mode: bool | None = None,   # 0.6 默认值将变（弃用警告）
    timeout: int = 120,                 # shell 命令默认超时（秒）
    max_output_bytes: int = 100_000,    # 输出截断阈值
    env: dict[str, str] | None = None,  # 注入到子进程的环境变量
    inherit_env: bool = False,          # 是否继承父进程 env
) -> None
```

### 2.1 `root_dir` —— 「在哪个目录里干活」

`.` 即当前工作目录（notebook 启动 kernel 时的 cwd）。影响两类操作：

**(a) 文件操作的相对路径基准**

| agent 给的路径 | `virtual_mode=False` | `virtual_mode=True` |
|---|---|---|
| `"data.csv"` | → `{root_dir}/data.csv` | → `{root_dir}/data.csv` |
| `"/data.csv"` | → `/data.csv`（**直接读系统根**） | → `{root_dir}/data.csv` |
| `"../.ssh/id_rsa"` | → `{root_dir}/../.ssh/id_rsa`（**跳出 root_dir**） | ❌ 抛 `ValueError` |
| `"~/secrets.txt"` | 按字面处理 | ❌ 抛 `ValueError` |

**(b) shell 命令的 `cwd`**：`backend.execute("ls")` 在 `root_dir` 里跑。

⚠️ `virtual_mode=False`（默认）下 agent 用绝对路径或 `..` 能跳出 `root_dir`，**不是安全边界**。

### 2.2 `env={"PATH": "/usr/bin:/bin"}` —— 「子进程能看到哪些环境变量」

**只影响** `subprocess.run()` 起的 shell 子进程，**不影响**你的 Python 进程。

| 写法 | 子进程能看到的 | 后果 |
|---|---|---|
| 不传 `env` | `{}`（空） | 连 `ls` 都跑不了（无 PATH） |
| `env={"PATH": "/usr/bin:/bin"}` | 只有 `PATH=/usr/bin:/bin` | 能用 `ls`/`cat`/`python3`；**拿不到** `ANTHROPIC_API_KEY`/`HOME`/`USER` 等 |
| `env={...很多}` + `inherit_env=True` | 父进程 env + 你指定的 | 几乎等同于宿主 shell |

效果示例：

- ✅ `cat /etc/passwd` 能跑（PATH 让 shell 找到 `/bin/cat`）
- ❌ `echo $ANTHROPIC_API_KEY` 拿不到 key
- ❌ `ls ~/.ssh` 因 `~` 不展开而失败（`HOME` 为空）

⚠️ **`env` 清空只是减少敏感变量泄露，不是安全边界**。agent 仍可用 `cat /etc/passwd`、`curl` 外联、`python3 -c "import os; ..."` 内省等方式读/发任何东西。

### 2.3 `virtual_mode` —— 0.5 必显式，0.6 默认会变

**只影响文件操作**的路径解析，**完全管不到** `execute()` 跑的 shell。

- `False`（当前默认）：路径按字面意思处理，绝对路径和 `..` 都能跳出 `root_dir`
- `True`：`root_dir` 当虚拟根，`/xxx` 映射到 `{root_dir}/xxx`，`..` 和 `~` 都被禁

0.5 跑会抛 `LangChainDeprecationWarning`，要求显式指定。**0.6 默认值会变**，从源码看 `False` 行为更宽松（agent 可用绝对路径），`True` 行为更严格但跟工具描述里"绝对路径"的预期会冲突。**当前推荐**：显式写 `virtual_mode=False` 消警告，保持现有行为。

### 2.4 其他参数

| 参数 | 默认 | 作用 |
|---|---|---|
| `timeout` | 120 | 单条 shell 命令超时（秒），超时报 exit_code=124 |
| `max_output_bytes` | 100,000 | 命令输出截断阈值，超过会在 output 末尾加 `[Output truncated at N bytes]` |
| `inherit_env` | False | 是否把 `os.environ` 拷给子进程 |

### 2.5 推荐 notebook 配置

```python
from deepagents.backends import LocalShellBackend

backend = LocalShellBackend(
    root_dir="/abs/path/to/workdir",
    virtual_mode=False,                              # 显式写，消 deprecation 警告
    env={"PATH": ".venv/bin:/usr/bin:/bin"},         # 让 agent 摸到 uv 和项目 .venv
)
```

`.venv/bin` 加到 PATH 是关键 —— 不加的话 agent 装包时只能摸系统 `pip`（通常不存在），又没 root 跑 `apt-get`，会卡死。

---

## 3. `execute()` 行为

源码核心（`local_shell.py:306-317`）：

```python
result = subprocess.run(
    command,
    check=False,
    shell=True,                  # 走 /bin/sh，支持管道/重定向
    capture_output=True,
    stdin=subprocess.DEVNULL,    # 防止 cat/python 等交互式命令卡住
    text=True,
    timeout=effective_timeout,
    env=self._env,
    cwd=str(self.cwd),
)
```

返回 `ExecuteResponse`：

| 字段 | 含义 |
|---|---|
| `output` | stdout + stderr 合并，stderr 行前加 `[stderr] ` 前缀 |
| `exit_code` | 子进程退出码（0=成功，124=超时） |
| `truncated` | 是否被 `max_output_bytes` 截断 |

非零退出码自动在 output 末尾追加 `Exit code: N`。

---

## 4. `@tool(parse_docstring=True)`

源码：`langchain_core/tools/base.py:127-202`

`parse_docstring=True` 让 `@tool` 装饰器**用 Google 风格解析 docstring**，抽两样东西喂给 LLM：

| 从 docstring 抽 | 用途 |
|---|---|
| 函数首段（summary） | tool 的 `description` |
| `Args:` 块里每个参数的说明 | tool 的 JSON schema 里**每个字段的 description** |

### 效果对比

```python
@tool(parse_docstring=True)
def get_weather(city: str, unit: str = "celsius") -> str:
    """查询指定城市的当前天气。

    Args:
        city: 城市名，比如 "北京" 或 "Beijing"。
        unit: 温度单位，"celsius" 或 "fahrenheit"。
    """
    ...
```

**`True` 时 LLM 看到**：

```json
{
  "name": "get_weather",
  "description": "查询指定城市的当前天气。",
  "parameters": {
    "properties": {
      "city":  {"type": "string", "description": "城市名，比如 \"北京\" 或 \"Beijing\"。"},
      "unit":  {"type": "string", "description": "温度单位，\"celsius\" 或 \"fahrenheit\"。"}
    },
    "required": ["city"]
  }
}
```

**`False`（默认）时**：参数没有 description，LLM 只能靠参数名猜。

### 三条硬约束

1. **必须用 Google 风格**（`Args:` / `Returns:` / `Raises:`），不认 Numpy 和 reST
2. **`Args:` 里写的参数必须在函数签名里存在**，否则 `error_on_invalid_docstring=True` 时抛 `ValueError`，`False`（默认）时**静默忽略** —— 默认行为比较坑
3. **docstring 必须是 function 上的**（用 `inspect.getdoc` 拿），缩进/引号漏了就没收益

---

## 5. `backend.upload_files()`

源码：`filesystem.py:968-1000`

```python
def upload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
    for path, content in files:
        resolved_path = self._resolve_path(path)
        resolved_path.parent.mkdir(parents=True, exist_ok=True)  # 自动建父目录
        fd = os.open(resolved_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o644)
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        responses.append(FileUploadResponse(path=path, error=None))
```

等价于：

```python
os.makedirs(parent_dir, exist_ok=True)
with open(path, "wb") as f:
    f.write(content)
```

但用 backend 接口的好处：

- 返回结构化的 `FileUploadResponse`（含 `path` 和 `error`），不抛异常
- 每个文件独立报错
- 跨 backend 可移植（远程 / 沙箱 backend 内部可能是上传到 S3 / 写到容器 / 推到远程 host）

### 典型用法

```python
import csv, io

data = [["Date", "Product"], ["2025-08-01", "Widget A"], ...]
buf = io.StringIO()
csv.writer(buf).writerows(data)
csv_bytes = buf.getvalue().encode("utf-8")

backend.upload_files([("/abs/path/to/sales_data.csv", csv_bytes)])
```

---

## 6. 实际跑出来的 trace 复盘

输入 prompt：

> "Analyze ./data/sales_data.csv in the current dir and generate a beautiful plot. When finished, send your analysis and the plot to Slack using the tool."

agent 走的 14 步循环（截断在最后）：

| 步 | 模型动作 | 结果 | 评价 |
|---|---|---|---|
| 1 | `read_file('./data/sales_data.csv')` | `Error: '/data/sales_data.csv' not found` | 🐛 路径规范化 bug |
| 2 | `execute("find / -name 'sales_data.csv' 2>/dev/null")` | 超时 120s | 🐛 盲扫全盘 |
| 3 | `execute("ls -la ./data/ ...; ls -la .")` | 找到文件 | ✅ |
| 4 | 再 `read_file('./data/sales_data.csv')` | 同样错 | 🐛 复现 |
| 5 | `execute("cat ./data/sales_data.csv")` | 读到内容 | ✅ 绕开 |
| 6 | 写 821 token 画图脚本 | — | 内容完整 |
| 7 | 跑 `pip install ...; python3 ...` | `ModuleNotFoundError: pandas` | 🐛 `2>/dev/null` 吞 install 失败 |
| 8-10 | `pip` / `pip3` / `python3 -m pip` | 都不存在 | — |
| 11 | `apt-get install ...` | `Permission denied`（非 root） | — |
| 12 | `find / -name matplotlib ...` | 大概率又超时 | — |

**`send_message` 从未被调用**，因为卡在装 `matplotlib` 循环里。

### 三个根因

1. **`read_file` 路径规范化不一致**：模型传 `./data/...`，工具报 `/data/...` not found。`./` 被吞、`/` 被补。这是 `read_file` 工具内部用 `virtual_mode`-style 解析、而 backend 是 `virtual_mode=False` 的语义错位。
2. **环境 PATH 残缺 + 无 root**：`env={"PATH": "/usr/bin:/bin"}` 让 agent 摸不到 `uv` / `pip`，系统 Python 3.12.3 没 pip，cooper 用户跑不了 apt-get。
3. **盲扫全盘**：`find /` 跑 120s 超时，遍历 `/proc` `/sys` 又慢又涉及敏感路径，应该先用 `ls`。

---

## 7. `send_message` 工具评估

当前实现（`data_agent.ipynb` Cell 2）：

```python
@tool(parse_docstring=True)
def send_message(text: str, file_path: str | None = None) -> str:
    """Send message, optionally including attachments such as images.

    Args:
        text: (str) text content of the message
        file_path: (str) file path of attachment in the filesystem.
    """
    if not file_path:
        print(f"{text}")
    else:
        fp = backend.download_files([file_path])
        print(f"{fp[0].content}")
    return "Message sent."
```

### 两个问题

1. **只 `print`，不发 Slack**：
   - 无 `file_path` 时把 `text` 打 stdout（**不返回给 LLM**，LLM 看不到）
   - 有 `file_path` 时把**文件二进制内容**打 stdout（图片字节打出来是乱码）
   - 永远返回 `"Message sent."`，没真正调 Slack API

2. **错误静默吞**：`backend.download_files([file_path])` 如果文件不存在，`fp[0].error` 非空、`fp[0].content` 是 `None`。代码不看 `error`，直接 `print(None)`，返回 `"Message sent."` —— **LLM 以为发成功了**。

### 改进方向

- 接 Slack Webhook / SDK（不要用 `print`）
- 检查 `fp[0].error`，失败时返回带错误信息的字符串
- 让函数有可观测的副作用（log + return），不要 print 后假装返回

---

## 8. 测试 `send_message` 的 prompt 模板

只测工具，不跑分析 / 画图 / 装包。

### 最小版（推荐先跑）

```python
input_message = {
    "role": "user",
    "content": "Use the send_message tool to send the text 'hello from data_agent' to Slack. Do not do anything else.",
}
```

预期：stdout 打印 `hello from data_agent`，返回 `"Message sent."`。

### 带 file_path 版（测有附件分支）

```python
input_message = {
    "role": "user",
    "content": "Call send_message with text='analysis report' and file_path='./data/sales_data.csv'.",
}
```

⚠️ 当前 stub 实现会打印 CSV 原始字节（乱码）。测这个分支最好用 `.txt` 文件。

### 验证错误吞掉 bug

```python
input_message = {
    "role": "user",
    "content": "Call send_message with text='test' and file_path='./does_not_exist.txt'. Report what the tool returned.",
}
```

预期：工具返回 `"Message sent."`（**bug**），模型会以为发成功。可以用来验证"`fp[0].error` 没被检查"的问题。

---

## 9. 速查表

| 想做的事 | 怎么做 |
|---|---|
| 消 `virtual_mode` deprecation 警告 | 显式写 `virtual_mode=False` |
| 让 agent 摸到 `uv` / 项目 `.venv` | `env={"PATH": ".venv/bin:/usr/bin:/bin"}` |
| 让 LLM 拿到结构化工具字段说明 | `@tool(parse_docstring=True)` + Google 风格 docstring |
| 跨 backend 移植文件写入 | `backend.upload_files([(path, bytes)])` 不用直接 `open()` |
| 跑 shell 命令 | `backend.execute("cmd")` 返回 `ExecuteResponse` |
| 确认工具被注册 | `create_deep_agent(tools=[...])` 显式传入 |

---

## 10. 待解决

- [ ] `read_file` 路径规范化 bug 复现 → 反馈给 deepagents 库 owner
- [ ] `send_message` 工具要么改成真正的 Slack 集成，要么从 notebook 拿掉（避免误导）
- [ ] notebook 是否要 default `env` 加上 `.venv/bin`？需要团队约定
