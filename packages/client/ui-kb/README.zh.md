# @deepseek-ai/dsh-client-ui-kb

[English](README.md) | 中文

知识库工作台表面插件：侧栏一级入口（文档图标 + 文档数角标）、blank 会话门户（经 additive 的 `conversation.hero.headline` 席位呈现产品标题，经 `conversation.input.dock` 呈现用量 chip、示例问题、场景卡栏与最近检索栏）、会话 `kb` view tab（带高亮与"带入对话追问"的引用检索、本地上传/网页链接/工作区目录浏览三通道的入库向导、会话内文档列表、用量卡）、会话 header 的切换按钮、`kb_*` 工具的 toolview 行（`kb_search` 的编号来源卡、入库对的回执、`kb_stats` 的用量计数，注册于 `tool.call.toolview`），以及知识库设置页（`settings.section` 下再次呈现用量卡）。全部数据走 connection 的 `api.kb` 面（门户场景另走 `agentPresets`，向导浏览另走 `host.listDirectory`）；未组合 kb 能力的部署在界面内联显示结构化拒绝。

## Model Experience

无，作为浏览器侧 UI 插件层，界面渲染网关数据，不注册任何模型可见内容。

#### KV Cache effect

无：界面在浏览器渲染，绝不参与模型请求；工作台检索复用网关的 kb.search 面。

## Known Limitations and Deferred Work

- 场景清单（`src/client/hero/scenarios.ts`）是与 `examples/kb-agent/scenarios/<id>/preset.yml` 人工同步的静态展示表；roster 本身来自 `agentPresets.list`。
- `host.listDirectory` 只列目录：向导的文件页签可视化浏览目录，文件名仍需输入；本地浏览器文件改走 `kb.upload` 通道，每个所选文件一行进度。
- 文档列表是会话内状态（入库回执 + 检索命中反推）；刷新后回退为用量总数，且无删除入口（无 API）。同名重传会替换旧文档——行完成时的提示条会明确报告替换事实。
- 用量卡的订阅徽标是静态占位，待计费 API 接入后替换数据源。
- `kb_*` toolview 行解析工具的模型面结果文本（引用列表、入库句、覆盖面句）；host 侧改写这些文本时回退为原样呈现。
