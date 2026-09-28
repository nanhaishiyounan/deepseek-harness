# W3-B7 终验发现并修复的三个 B6 遗留缺陷

> 取证时间 2026-09-28；发现方式 = B7 五角色真实旅程（J5 仓管扫码收货 / J4 质检员逐项打分 /
> J3 车间主任齐套领料重入）。
> 三者均为「B6 终端端点上线后首次被真实动线踩到」——页面存在性验证（B6 批次）未覆盖到
> 数据闭环的正例全程，终验的任务完成性动线补上了这一层。

## 缺陷 1：receive-goods 收货单编号永远撞号（HTTP 400 already exists）

- **现象**：J5 收货终端【验证收货】→ 端点拒收 `POST /api/wms_receipts:create -> HTTP 400:
  入库单号 already exists`。B6 首跑成功是巧合（表空时 max=0），第二张起必炸。
- **根因**：[`nextDocCode()`](../../examples/kb-agent/scripts/approval-engine.mts) 按集合的
  `code` 列扫最大号，但 `wms_receipts` 的编号列是 `receipt_no`（无 code 列）——扫描恒为空，
  每次都生成 `RCV-TERM-<年>-0001`，与 B6 留下的首行冲突。
- **修复**：`nextDocCode` 增加 `codeField` 参数（默认 `code`），`/receive-goods` 调用传
  `receipt_no`；报工端点（`mfg_job_reports` 用 code 列）不受影响。
- **验证**：修复后 RCV-TERM-2026-0002/0003 连续生成，两张收货单过账进待检区
  （hold bin SH-Q-02-01），movements 各 +1；`j5-psql面` 见
  [`w3-b7-journey-chain1.txt`](w3-b7-journey-chain1.txt)。
- **防呆评价**：fail-loud 语义正确（撞号即 400、库内无残留行），属「正例走不通」而非「错数据入库」。

## 缺陷 2：感官检验行「不合格」被静默翻转为「合格」（质量判定失真）

- **现象**：J4 质检工作台对 C 单（七项全超限）打分，UI 行级判定 7/7 全红，但端点总判回执
  `defects.major=6`（少计感官行），库内 `qm_inspection_readings.感官·外观.pass = true`。
- **隔离取证**（[`/tmp` 探针复现，2026-09-28]）：
  `defectsFromReadings([{parameter:'感官', spec_min:null, spec_max:null, pass:false}])`
  纯函数即返回 `judged.pass=true`——翻转在引擎内部，与 UI/传输无关。
- **根因**：`Number(null) === 0`。`isNumericRow` 用 `Number.isFinite(Number(spec))` 判数值行，
  两个 null 边界被当成 `[0, 0]` 数值行；`actual=null` 同样折算 0；`0 ∈ [0, 0]` → pass=true。
  感官行的显式 pass:false 永远不被读取。数值行（spec/actual 均有值）不受影响。
- **修复**：`isNumericRow` 改 `typeof spec === 'number'`（null 是缺席不是零）；数值分支的
  min/max 改 typeof 收窄；actual 缺失检查同步堵住（数值行忘填读数原先静默判 0，现在 fail-loud）。
- **验证**：修复后 D 单同型打分 `d=7`（major 含感官行）→ failed ✓、
  `qm_inspection_readings` 感官行 `pass=false` ✓、`--selftest` 全绿（终端校验三数等式/读数
  判定/缺陷汇总/收货卡口）；E 单（真实 hold 库存）d=2 → failed → return 处置单闭环
  （QM-NC-2026-0006 closed），并触发供应商 AQL 严格度状态机 reduced→normal（GB/T 2828.1
  第 9 章，最近 5 批 1 拒）——质量域全链恢复真实。
- **取证单**：QI-B7J4-C 是缺陷本体的取证单（其感官行落库 pass=true 即缺陷现场，保留不改）；
  修复后的干净判定走 QI-B7J4-D / QI-B7J4-E。

## 缺陷 3：availability-check 重入把预留打入永久 released，领料死锁

- **现象**：J3 车间主任旅程——齐套重跑后 `reservation_state=assigned`，但 `--post-issue`
  领料四项全部「无有效预留」被拒，MO 停在 released 永远到不了 in_progress。
- **根因**：[`availabilityCheck()`](../../examples/kb-agent/scripts/nocobase-h5-wms.mts) 重入时
  先释放本 MO 的 reserved 旧行（→ released），但 `reserve()` 按 code 幂等「already exists
  (released; kept)」——released 旧行永久挡住重挑。齐套读 assigned 而领料无 reserved 可耗，
  两视图死锁。W 轮 9 步链未踩到：s6 幂等复跑时 MO 已 completed 整段跳过，「check→check→领料」
  序列只在 B7 的真实旅程里第一次连续发生。
- **修复**：重入时同步 destroy 本 MO 的 released 旧行（释放已归还 ATP，destroy 后 reserve
  按 FEFO 重挑），重入语义完整。
- **验证**：MO-2026-0014 重入 check 后预留 4 行 reserved（FEFO 批次 + ATP 扣减日志）→
  领料 MI-B7J2-0014-01..04 全部 posted → MO released→in_progress（首次领料开工）→
  三工序报齐 → completed → OQC passed → 放行，制造执行全链贯通
  （[`w3-b7-journey-chain2.txt`](w3-b7-journey-chain2.txt)、[`w3-b7-psql.txt`](w3-b7-psql.txt)）。
- **防呆评价**：与缺陷 1 同族——fail-loud 拒绝正确、无错数据，但正例不可达。

## 共性教训（进 Agent Note）

终验批次的价值实证：B6 批次的「端点冒烟」验证了正例可通（首张单），但**三个缺陷都藏在
「第二次」里**——只有把角色动线走满（多张单、两种判定路径、库存后果、重入序列）才会
暴露。W 轮验收总则第 4 条（任务完成性 ≠ 页面存在性）由本批坐实。
