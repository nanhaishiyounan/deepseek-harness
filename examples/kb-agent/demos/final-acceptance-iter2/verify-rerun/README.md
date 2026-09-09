# Hands-On Exploration 复测证据（verify-rerun, 2026-09-09 00:50–01:19 CST）

QA Explorer 复测轮证据目录。因 chrome-devtools MCP 的 workspace-roots 配置拒绝任何 filePath 落盘，
截图以内联形式记录于验证会话（视觉分析结论见各场景备注），本目录落盘 DOM/API 断言 JSON
（浏览器内 fetch POST 到 127.0.0.1:17777 临时证据服务器写入）。

## dsh/ — DSH Web :3080

| 文件 | 场景 | 关键实测值 |
| --- | --- | --- |
| C1-market-dom.json | C1 市场门户 | 数据产品 175 · 供方 2 · 本月成交 39；共 175/175 项 |
| C2-filter-counts.json | C1/C2 类型筛选 | 专家 34、专家服务 52、文档 88、数据表 1、文件 0（合计 175，对账一致） |
| C1-search-zhanghongxi.json | C1 搜索 | 「张红喜」精确命中 1/175 |
| C2-expert-detail-zhanghongxi.json | C2 专家卡展开 | 张红喜：漯河市电子商务协会（会长），5 个领域标签，问数/引用按钮 |
| C2-service-card-detail.json | C2 服务卡详情 | 海外仓风险应对咨询 ¥6,800/份 · PDF 方案 · 下单按钮 |
| C3-subgraph-count.json | C3 图谱子图 | seeds=[nocobase:experts:1] hops=2 → 74 节点（72±5% 内）；单跳 4 节点 3 边 |
| C4-orders-object.json | C4 对象切换 | 专家→专家服务订单切换成功，20 张订单卡（ORD-20260905-* 系列） |
| C6-iframe-login-experts.json | C6 iframe 互通 | /nocobase 反代 iframe 登录成功 → 专家数据 Total 35 items |
| C5-kb-search.json | C5 KB 检索 | 「海外仓 风险应对」约 7 条结果 · 来自 3 份文档 |
| C5-kb-workbench.json | C5 KB 工作台 | 46 份文档；累计用量 检索 122 / 入库 77 / 知识库文档 46 |
| C7-chat-answer-citations.json | C7 对话查询 | 3 次检索（7+7+8 来源）+ 9 条编号引用，全部可溯源到 KB 文档路径 |
| C7-empty-submit.json | C7 附加 | 空输入时发送按钮 disabled（UI 阻止空提交） |
| Phase4-exploration.json | E1/翻页/移动/console | reload 状态保持、5 连击翻页网络 delta=0、375x812 无致命破版、reload 后 console 零 error |

## nocobase/ — NocoBase :13000（隔离浏览器上下文，完整登录流程）

| 文件 | 场景 | 关键实测值 |
| --- | --- | --- |
| B3-orders-stats.json | B3 orders 表 | 全表 94 单；状态分布 delivered 50 / pending 27 / failed 16 / generating 1；近 30 天（generatedAt）50 单 ≥ 24 |
| B4-workflow.json | B4 workflow | 「专家服务订单审批交付」存在，Collection event，异步执行，Executed 103，ant-switch checked（Enabled） |
| B5-todo-detail.json | B5 真实点击 | 点击待办「订单审批」→ /admin/workflow/tasks/manual/pending/385588319682563 详情打开（2026-09-09 01:00:38 创建，Pending） |
| B6-ui-editor.json | B6 UI Editor | 编辑模式加载成功：Add menu item / Add block / Configure actions / Configure columns，23 个 designer 元素，可正常退出 |

## 复核备注

- B1 登录、B2 experts 35 行（Total 35 items，33±2 容差上限内）：截图级证据在会话内联（隔离上下文 signin → admin/c8rl4krpqqx）。
- 图谱 WebGL 可用（sigma 7 层 canvas 渲染成功），未走降级列表路径。
- MCP 落盘受限的处置细节见 Phase4-exploration.json 与最终报告。
