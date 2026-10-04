# W6-R6 证据 01：真话债双修摘录（修正前后）

两项 B10 终验留下的真话债，R6 按实测改写。修正落位：`research/2026-10-01-w6-rework/99-w6-deliverables.md`（§三 ECONNRESET 行、§五.1）与 B10 Note 双语（`2026-10-03-w6-b10-final-acceptance.md`/`.zh.md` §4/§5，pairing 已重录）。

## 债①：planner 直开驾驶舱「被拦」（§五.1）

实测反证：`w6-b10-actions.json` observe 条目（2026-10-03T03:06:16Z）——

```json
{ "role": "planner", "action": "observe /admin/w6b9cdzrc2lst1dm", "detail": "rendered=true denied=false" }
```

修正前（99 §五.1）：

> 演练观察项实测：planner 直开经营总览路由被拦（观察记录 `w6-b10-actions.json` observe 条目）。

修正后（99 §五.1，摘录）：

> 设计分层裁决——经营总览聚合面（KPI 卡/趋势/运营链/异常摘要）对 planner/buyer 等平台会话开放可读，客户级明细（Top 客户、账龄钻取行）由引擎侧服务端脱敏（非 finance/admin 读 `/fin/cockpit` 时 customers 置空 + masked=true；R6 复核断言 `w6-r6-02-cockpit-mask.log` 8/8 过），明细钱面 `/fin/aging` 对 planner 403。演练观察步实测 planner 直开经营总览路由渲染成功（rendered=true denied=false）——早前版本写作「被拦」与实测相反，R6 修正。

B10 Note 对应修正：zh §4「R5 推来裁决」与 en §4 同步改写（en：`the earlier "observed blocked" wording contradicted the measurement, fixed in R6`）。

## 债②：ECONNRESET「两次日志均留档」不可复核

可复核性核查（R6 实测）：`grep -rln ECONNRESET demos/` 仅命中 `w6-b10-gates.sh`（重试代码本身）；无任何 `*.retry1.log` 文件；`w6-b10-gate-b3-recall.log` 内 0 命中。两次命中的首试输出确未留存。

修正前（99 §三）：

> ECONNRESET……内置「仅限该错误码的单次透明重试，两次日志均留档」——最终轮未触发即绿。

修正后（99 §三，摘录）：

> ……内置仅限该错误码的单次透明重试（`w6-b10-gates.sh:41-49`，首试日志 mv 为 `*.retry1.log` 后重跑）——B10 试跑期间两次命中 `w6b3-recall --assert` 均重试后成功；该两次首试输出未随 demos 留存（demos 内 grep ECONNRESET 仅命中 gates.sh 本身、无 .retry1.log 文件），可复核面=重试代码与终轮 `gates-b10.log` 首试即绿（R6 修正：早前版本写作「两次日志均留档」，与 demos 现状不符）。

B10 Note 对应修正：zh §5 与 en §5 同步改写（en：`those two first-attempt outputs did not survive into demos … the checkable surface is the retry code plus the final run passing first-try`）。重试机制代码（真可复核面）：`w6-b10-gates.sh` 第 41-49 行——首试非零且日志含 ECONNRESET 时 mv 为 `.retry1.log` 并重跑一次。
