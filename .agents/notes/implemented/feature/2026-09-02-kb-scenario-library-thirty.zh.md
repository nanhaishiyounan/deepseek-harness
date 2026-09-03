# Agent Note: kb-agent 场景库铺满三十——probe 与脱敏语料的内容设计规则

Status: implemented

[English](2026-09-02-kb-scenario-library-thirty.md) | 中文

## 问题

食品产业 kb-agent 示例的 P2 目标是三十个场景。已有十一个场景且目录契约定型（`scenarios/<id>/{preset.yml, agent.cordis.yml, SKILL.md, data/corpus.md}`，由 `tests/scenarios.spec.ts` 自动纳入）；其余十九个只在双语 `scenarios/README` 里逐一点名。填充是纯内容工作，但两项性质在写内容时极易丢掉：场景的 probe 必须在 keyless 纯文本降级模式下真实检回自己的语料；语料必须脱敏，同时又要具体到能支撑 probe 问答。

## 决策

### 名单与类别逐字跟随已发布清单

十九个 id 与类别逐字来自场景 README 的"待填充"清单：市场洞察 3 个、工艺 2 个、食品安全 2 个、成本 2 个（其一为跨类综合的企业数据助手）、供应链 5 个、出海 4 个、数据资产 1 个；供应链金融官跨供应链/出海。order 接续既有 20–30 排到 31–49，门户卡片顺序保持确定。

### 四件套形态照抄不变

每个场景逐字保留已出厂模板：`preset.yml`（probe/name/description/order）、`agent.cordis.yml`（persona + scoped tool-kb 行，kb 栈仍在 host 面）、`SKILL.md`（何时使用/工作方式/工具）、`data/corpus.md`（3–4 节具体事实）。persona 一律要求先 kb_search、`[n]` 引用、无数据支撑的结论标注为假设。

### probe 措辞服从纯文本检索机制

纯文本降级检索按非词字符切分查询；≥3 码点的段进入 FTS5 OR 短语（≤8 码点整段、更长段切 4 码点滑窗），全部分段短于 3 码点的查询回退整串 LIKE。由此写入每条 probe 的规则：

- 每条 probe 至少保留一个 ≥3 码点、在**语料正文**中连续出现的段（chunk 索引只覆盖正文段落，不含标题行——cold-chain 的 probe 词最初只出现在标题里，检索零命中，移进正文句子后才通过）。
- 全短段 probe 一票否决："HS 归类 拼箱" 与 "豆粕 期货 套保" 都落入 LIKE 而必然失配，分别补入更长段（"预裁定"、"卖出套保"）。
- probe 词选跨语料独特的词，让每个场景优先引用自己的语料；spec 的 `some` 语义可容忍个别泛词共享。

### 语料来源与脱敏规则

企业名虚构（锦丰食品等），内部编号虚构（SOP-CC-04、SCF-01、PM-EXP-03）。法规锚点（GB 2760 / GB 14881 / GB 28050、FDA 设施注册、HALAL）保留——标准引用本身公开且 probe 需要可识别的锚点；不复制任何真实会议纪要原文。单个语料内数字必须自洽（冷链 30 分钟短时波动上限即断链触发阈值；库销比 2.0 预警对 2.3 读数），使 probe 问答可被支撑。业务主题跟随 `plans/food-kb-agent-plan.md` 的食品企业运营主线（采销/排产/冷链/出海/ESG）。

## 备选方案

- **embedding 优先的 probe**（挑只有 hybrid 模式才能检好的词）：拒绝——keyless spec 门禁在纯文本模式跑；需要 key 才能验证的 probe 在 CI 里不可验证。
- **每场景独立 host 组合**：拒绝——场景是纯内容预设；按目录契约 kb 栈留在 host 面。
- **更长、会议纪要风格的语料**：拒绝——出厂语料刻意紧凑（约 10–15 行）；probe 问答需要的是连续性与自洽而非篇幅，更长的文本反而抬高跨语料关键词冲突。

## 后果

- `tests/scenarios.spec.ts` 覆盖 30/30 场景且全部引用自己的语料；期望快照已重录，每条记录 `own corpus cited`。名单的门户侧同步及其防漂移门禁由[门户同步笔记](../testing/2026-09-02-kb-portal-scenario-sync-gates.zh.md)持有。
- probe 评审成为后续新增场景的检查清单：只用 ≥3 码点段、正文连续、跨语料独特。
- 双语场景 README 换成完整 30 行名单（"待填充"清单已删除），QUICKSTART 计数改为三十，`cordis.patch.yml` 注释里的 "eleven food-industry scenarios" 同步改为 thirty。
