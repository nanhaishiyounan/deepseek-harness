# @deepseek-ai/dsh-expert-pdf

[English](README.md) | 中文

专家交付物的纯函数中文 PDF 排版库（`@deepseek-ai/dsh-expert-pdf`）：`renderPdf(spec)` 把一份 `DraftSpec` 排版为 PDF 字节——封面页（标题、客户、专家署名、日期、订单号）、正文页按序排布每个章节（标题、自动换行的中英混排段落、参考来源行）、结尾免责声明，以及页面版式（正文页的订单号页眉与"第 x 页/共 y 页"页脚）——字体为子集嵌入的 Noto Sans SC。无 LLM、无文件写入、无插件服务：持有这些职责的起草管线在 `@deepseek-ai/dsh-expert-orders`。

## 排版

- **字体**：包内 Noto Sans SC Regular（SIL OFL 1.1，见 `resources/fonts/LICENSE`），保存时子集嵌入，产物体积跟随实际用到的字形。`wrapCjkText` 按实测宽度换行：CJK 逐字断行、拉丁词元保持原子、显式换行符为硬换行，且换行结果拼接后与输入完全一致（不丢字、不替换字符）。
- **模板**：封面字段取自 spec；章节按起草方给出的顺序排布；spec 未携带免责声明时使用标准文案（`DEFAULT_DISCLAIMER`），携带时使用调用方文本。

## Model Experience

间接生效：经 `@deepseek-ai/dsh-expert-orders`——起草模型的严格 JSON 输出成为本库排版的 `DraftSpec`。本包自身不注册任何提示词、schema 或工具。

#### KV Cache effect

与模型请求流无关：排版消费已产出的 spec 并为工具结果产出字节，本包既不向任何可复用请求前缀追加内容，也不使其失效。

## Known Limitations and Deferred Work

- 单一字体、单一字重：强调只靠字号与颜色；粗体字面等有真实交付物需要时再引入。
- 换行没有 CJK 断行规则（行首禁排标点、标点悬挂均无），只有宽度预算。
- 包内携带完整 Noto Sans SC 字面（约 8 MB）以保证字形覆盖完整；子集化在每份文档保存时进行。
