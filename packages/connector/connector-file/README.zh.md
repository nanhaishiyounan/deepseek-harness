# @deepseek-ai/dsh-connector-file

[English](README.md) | 中文

文件集连接器 Provider：把一个本地数据文件目录以 `file` 类型数据集的形式挂到 `ctx.connector`。发现阶段平铺列出路由器准入的扩展名（不递归）；拉取阶段带防目录穿越的 id 校验读取单个文件字节。分类决策留在缝里——Provider 只交出原始字节，由共享数据路由器在传输时决定进 kb 还是湖仓，因此投放目录与工作台上传走完全一致的路由。

## 行为

- **加载期建目录** —— root 缺失时在组合加载期自动创建（干净检出以空文件集起步）；其余 root 问题（路径被普通文件占据、父级不可读）仍然让组合加载 fail-loud，因此 `available()` 是不做 I/O 的恒真。
- **`discover`** —— 列出数据路由器准入扩展名（`.csv` `.xlsx` `.json` `.md` `.txt` `.pdf` `.docx`）的文件，跳过目录与其余扩展名；对请求的查询词做文件名大小写不敏感匹配，并尊重类型过滤（本 Provider 的数据集全部是 `file` 类型）。每条摘要以文件 mtime 作为 `updatedAt`。组合运行期间 root 被删时回答空列表——仅吞这一种 ENOENT，其余 errno 仍让调用 fail-loud。
- **`fetch`** —— 数据集 id 必须是纯文件名（带分隔符的一律在任何文件系统操作前拒绝）；文件缺失或目标是目录拒绝 `CONNECTOR_DATASET_MISSING`，超过上限拒绝 `CONNECTOR_FILE_TOO_LARGE`。

## 配置（schemastery）

- `root: string`（必填）—— 文件集目录，相对路径按进程 cwd 解析。
- `maxFileBytes?: number` —— 单文件拉取字节上限（默认 `10485760`，10 MiB）；超限拒绝而非无界载入。

## Model Experience

经工具消费方 `dsh-tool-connector` 间接影响模型：本 Provider 不注册任何 prompt、schema 或工具，所发现文件数据集的一切模型可见投影都归该包所有。

#### KV Cache effect

与模型请求流无关：目录扫描与文件读取产生的是后续请求消费的工具结果，本包既不向任何可复用请求前缀追加内容，也不使其失效。

## Known Limitations and Deferred Work

- 扫描按设计是平铺单层（投放目录语义）；递归树与 glob 模式等待真正需要它们的投放形态。
- 每次发现都重扫目录；缓存索引等待一个列表成本真正显著的目录。
- `.pdf`/`.docx` 可发现可拉取，但缝的传输通道今天会拒绝其 kb 落地（抽取归网关上传通道）——拒绝消息会列出支持的传输集合。
