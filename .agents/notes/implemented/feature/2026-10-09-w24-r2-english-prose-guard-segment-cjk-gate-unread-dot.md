# Agent Note: W24-R2 English-prose guard, segment-granular CJK gate, and the unread-dot anchor

Status: implemented

## Problem

W24-R1 验证遗留唯一 BLOCKING：`potential`/`reviewing`/`preferred`/`rejected`/`eliminated` 五个供应商生命周期词仍留在无门的 `WORD_TERMS_CI`——它们都是英文日常词，英文散文叶（`The preferred supplier list is attached`）会被整体替换成人话词（`优选`），W24-R1 只给 `frozen`/`qualified` 上了 CJK 门，没覆盖这五个。附带三条 ADVISORY：jargon 断言面缺英文 fixture、CJK 门整叶粒度在混排叶（`frozen goods 已冻结`）上误伤英文半、未读点 `--right: -8px` 在 375px 审读里偏移过远。

## Decision

1. **五词并入 `CONTEXTUAL_WORD_TERMS`（BLOCKING）**：与 `frozen`/`qualified` 共享既有 CJK 门与裸叶例外（整叶就是枚举值时仍直映——metric value / action label 无散文可保护，W24-R1 的八态裸叶全值域断言继续把守）。`restricted` 留在 `WORD_TERMS_CI` 无门：英文散文不携带该词，上门只添死代码路径。`WORD_TERMS_CI` 的生命周期族派生 filter 自动收缩，单一事实源不变。
2. **CJK 门粒度整叶改句段（ADVISORY）**：`contextualStateWord` 增加 offset 探测——取 token 左右两侧最近的完整句段（边界=空白+中英标点，`SEGMENT_BOUNDARY`），任一侧含 Han 才映射。`该供方 potential 已停用` 的 token 紧邻段「该供方」含 Han → 映射潜在；`frozen goods 已冻结` 的 frozen 紧邻段是 `goods`（英文短语中段）→ 原样，英文半保词、中文半不动。与 token 直接相连无边界的情形（`已冻结frozen`）天然并入同段判定。
3. **英文散文面 fixture（ADVISORY，jargon-scan 英文面）**：三条验证句（`The preferred supplier list is attached` / `The potential risk is high` / `we are reviewing the order`）经 `sanitizeReportPayload` 在 subtitle/metrics.label/rows.label/rows.hint 四类叶原样往返；英文卡 fixture 断言协议 token 整段剥离（任意大小写无残留）、枚举英文词逐字保留且叶面零 Han 字符（裸叶枚举值仍整词直映，不存在词中插中文的中间态）。活体 `r1-jargon-scan.mjs` 不加 fixture：其扫描对象是存储服务的真实会话数据，合成 payload 无处注入；构建入口也不导出 sanitize 函数——英文面防回归由本 vitest fixture 把守。
4. **未读点 `--right: -8px` → `-4px`（ADVISORY）+ jsdom computedStyle 探针**：jsdom 不应用 CSS Modules，既有断言只能读源文本；R2 把模块源里的复合规则改写到真实 hash 类（`_timeBadge_<hash>`，前缀下划线——`\btimeBadge_` 匹配不到，正则须按 `_timeBadge_` 抓）注入 `<style>`，`getComputedStyle(dot)` 断言 `--right: -4px`、`--top: 2px`——选择器匹配与值双双经样式引擎实证。
5. **记债不做（ADVISORY）：RichContent 叙事面黑名单统一**。叙事渲染走 `sanitizeBizText`（词表映射层），报告卡走 `sanitizeReportPayload`（`sanitizeSubtitle` 档，含 `PROTOCOL_BLACKLIST`/`SUBTITLE_BLACKLIST` 剥离）——两层黑名单分叉，叙事正文里若泄漏 `wfl_*` 协议 token 不会被剥。上游 `splitCodeBlocks` 已把协议 fence 整块分离（协议负载不进叙事面），残余风险是模型把 token 写进散文。统一需把 denylist 剥离并入叙事管线（或 RichContent 换走 sanitizeBody），涉及叙事管线重构，本批不做，记为后续项。

## Testing

- vitest（jsdom）rich/sanitize/views 三文件新增全绿：五词英文保词三句、中文场景不回归（`该供方 potential 已停用`→`该供方 潜在 已停用`、八态全值域循环与既有 frozen/qualified 断言原样通过）、混排句段（`frozen goods 已冻结`/`rejected items 已退回` 原样）、三条英文句四类叶 `sanitizeReportPayload` 原样往返、英文卡 fixture 协议 token 剥离 + 枚举英文词零 Han、混排 subtitle DOM 断言、未读点 computedStyle `-4px`/`2px` 探针。
- 回归另含 ui-mobile 全量、`pnpm run typecheck`、staged lint（oxlint staged config）、e2e toolcard（`apps/web/tests/mobile-assistant-toolcard.e2e.ts`）、`pnpm run verify-agent-note-format`（本 note 按其骨架撰写）。
- 探针设计先行验证：一次性 jsdom 探针确认 `<style>` 注入后 `getComputedStyle` 可计算自定义属性（compound 选择器、trim 后值），探针文件已删除。

## Alternatives considered

- **整叶门 vs 句段门**：整叶门下混排叶英文半必然误伤（叶含 Han 即全部门开）；句段门只看紧邻段，孤 token 紧贴中文段仍映射（中文叙述语境），英文短语中段保词。代价是每个 token 两次线性段扫描——叶子文本短，可忽略。
- **五词上门 vs 全八态上门 vs restricted 也上门**：全上门则 `restricted` 加一条永不触发的门路径；restricted 非英文日常词（散文不携带），无门即无伤。
- **活体扫描脚本加英文 fixture vs vitest fixture**：活体脚本扫存储数据（Playwright + 网关 + buyer 登录），无法注入合成 payload；vitest fixture 直测 `sanitizeReportPayload` 并覆盖四类叶，是可回归的最小面。
- **computedStyle 探针 vs 纯源断言**：源断言（既有）证选择器形态，computedStyle 探针证选择器命中真实 badge 元素与值生效；jsdom 需改写 `:global()` 并注入，否则 CSS Modules 规则永不进样式引擎。

## Consequences

- 代价：`contextualStateWord` 签名加 offset，`sanitizeBizText` 的词回调传位；英文散文叶里的五词不再映射（英文叙述读英文词——与 `suggestions` 上下文规则同式的取舍）；未读点视觉锚点移动需活体复核。
- 买到：W24-R1 验证唯一 BLOCKING 清偿（英文散文保词 + 裸叶直映 + 中文映射三头自洽）；jargon 治理补齐英文面防回归；混排叶不再整体翻译；未读点偏移值经样式引擎实证而非源文本推断。
- 回滚：五词回 `WORD_TERMS_CI` 派生集即恢复无门；句段门退回 `HAS_CJK.test(whole)` 即整叶门；`-4px` 一行回 `-8px`（computedStyle 探针断言会先红）。
