-- W6-B2 预警引擎对账 SQL（终验矩阵腿引用；psql -f 本文件逐段核对）
-- 口径锚：全部日期比较在 SQL 内走 CURRENT_DATE（PG 会话时区 = Asia/Shanghai，
-- 与引擎扫描器 w6b2-rules.mts 的 hitsSelect 同锚——W6-R1 教训：date-only 串列不与
-- ISO 即时串比较，引擎与对账共用 CURRENT_DATE 一种口径）。
-- 凭据：platform/nocobase/.env 的 DB_*（psql -h localhost -U postgres -d nocobase）。

-- ① 四路规则在库且启用（expect 4 行：expiry/cert_due/ar_overdue/quality_abnormal）
SELECT rule_type, params, route_to, enabled FROM alert_rules ORDER BY id;

-- ② 效期对账（引擎行数 = 手写四日期×双轨阈值 SQL，差异必须为 0）
-- 引擎侧：
SELECT count(*) AS engine_expiry
FROM wfl_alerts WHERE rule_type = 'expiry' AND last_seen_at = CURRENT_DATE;
-- 手写对账侧（监管分档双轨：≥365 天保质期→45 天、180~364→20、90~179→15、30~89→10、<30→3，
-- 与配置 warn_days 取孰早；alert_date 已过且未过期亦命中）：
WITH rule AS (SELECT params FROM alert_rules WHERE rule_type = 'expiry')
SELECT count(*) AS recon_expiry
FROM wms_lots l, rule r
WHERE l.expiry_date IS NOT NULL
  AND (l.expiry_date <= CURRENT_DATE + LEAST((r.params->>'warn_days')::int,
        CASE WHEN (r.params->>'regulatory')::boolean IS NOT FALSE THEN
          CASE WHEN l.production_date IS NULL OR l.expiry_date - l.production_date >= 365 THEN 45
               WHEN l.expiry_date - l.production_date >= 180 THEN 20
               WHEN l.expiry_date - l.production_date >= 90 THEN 15
               WHEN l.expiry_date - l.production_date >= 30 THEN 10
               ELSE 3 END
        ELSE 999999 END)
    OR (l.alert_date IS NOT NULL AND l.alert_date <= CURRENT_DATE AND l.expiry_date >= CURRENT_DATE));

-- ③ 四路各取一行样例（规则名/对象/级别/时间——验收证据②的 psql 对账面）
SELECT rule_type, severity, entity, entity_code, title, status, owner,
       notify_users, first_seen_at, last_seen_at, reopen_count
FROM wfl_alerts
WHERE status <> 'resolved'
ORDER BY rule_type, severity DESC, entity_code LIMIT 12;

-- ④ 幂等对账（连续两轮扫描前后总行数不变；引擎 CLI --assert ④ 同款）
SELECT count(*) AS total_rows, count(DISTINCT dedup_key) AS distinct_dedup FROM wfl_alerts;
-- （total_rows = distinct_dedup —— dedup_key 唯一索引 ux_wfl_alerts_dedup 保证）

-- ⑤ 通知送达对账（alert-center 渠道行数 ≥4；keeper 至少 1 条效期通知）
SELECT "channelName", count(*) FROM "notificationInAppMessages" WHERE "channelName" = 'alert-center' GROUP BY 1;
SELECT u.username, count(*) FROM "notificationInAppMessages" m JOIN users u ON u.id = m."userId"
WHERE m."channelName" = 'alert-center' GROUP BY 1 ORDER BY 2 DESC;

-- ⑥ 责任人路由对账（每路 notify_users 覆盖预期账号）
SELECT rule_type, min(notify_users::text) FROM wfl_alerts WHERE status <> 'resolved' GROUP BY rule_type;
-- expect：expiry 含 b4guard/keeper（仓储部）；cert_due 含 chenliqun/buyer（采购部）；
--         ar_overdue = ["finance","sales_rep"]；quality_abnormal 含 quality_lead/qc_inspector（质检部）

-- ⑦ 处理动作状态流（open → acknowledged(认领) → resolved(关闭)；越权拒绝见 --assert ⑧）
SELECT id, rule_type, status, owner, resolved_by, resolve_note, reopen_count
FROM wfl_alerts WHERE owner IS NOT NULL OR resolved_by IS NOT NULL ORDER BY id DESC LIMIT 6;

-- ⑧ 预警中心页面结构（菜单组 + 两 flowPage + 表格块 + 统计卡块 + 筛选表单块）
SELECT title, type FROM "desktopRoutes" WHERE title IN ('预警中心','预警列表','预警规则') ORDER BY type;
SELECT f.options->>'use' AS block_use, f.uid, coalesce(f.options->>'sortIndex','NULL') AS sort_index
FROM "flowModels" f
WHERE f.options->>'parentId' = (
  SELECT uid FROM "flowModels" WHERE options->>'use' = 'BlockGridModel'
    AND uid IN (SELECT options->>'parentId' FROM "flowModels" WHERE options->>'use' = 'TableBlockModel'
      AND options->'stepParams'->'resourceSettings'->'init'->>'collectionName' = 'wfl_alerts'))
ORDER BY block_use, uid;

-- ⑨ 角色读权限（member/admin/root 对两集合 view —— mobile 读通道 wfl_ 前缀豁免外的显式授权）
SELECT r."roleName", r.name, string_agg(a.name, ',') AS actions
FROM "rolesResources" r JOIN "rolesResourcesActions" a ON a."rolesResourceId" = r.id
WHERE r.name IN ('wfl_alerts','alert_rules') GROUP BY 1,2 ORDER BY 1,2;
