# W24-B0 任务三：carbon.ms 商业许可询价邮件草稿（未发送）

- 起草日期：2026-10-10
- 状态：**草稿，未发送**（按 B0 任务书要求仅起草）
- 发送对象：Carbon Manufacturing Systems Corporation（官网 https://carbon.ms 的销售/商务入口）
- 主题候选：`Commercial licensing inquiry: self-hosted deployment with API/MCP access`

---

**To:** sales@carbon.ms（以官网实际入口为准）

**Subject:** Commercial licensing inquiry: self-hosted deployment with API/MCP access

Hello Carbon team,

We are evaluating Carbon (the open-source ERP+MRP+MES+QMS suite from crbnos/carbon) as the business-system backbone for an internal manufacturing-data platform. Our deployment shape is a **self-hosted, single-tenant instance inside our own infrastructure**, with a custom AI assistant that drives business workflows programmatically.

We have reviewed the repository's dual-license structure (AGPL-3.0 for the community code, Carbon Commercial License for the `packages/ee` Enterprise files) and README section on API keys. Before we finalize our architecture, we would like a commercial quote and clarification on the following:

1. **API access terms for self-hosted deployments.** README states that "API keys and MCP are included with Business and Enterprise plans. Using them in a self-hosted deployment requires a commercial license." Please confirm:
   - Which plan tier unlocks API keys + the MCP server (`POST /api/mcp`) for a self-hosted instance, and the annual/multi-year pricing per tenant.
   - Whether the PostgREST Data API behind Kong (port 54321) — the same surface the ERP web UI itself uses — is covered by the community AGPL license when called programmatically with an authenticated user session, or whether any machine use of that surface also requires the commercial license.
   - Rate limits, key-scoping granularity, and per-key RBAC available on the API surface.

2. **Enterprise feature list and pricing.** A current price list and feature matrix for the EE-gated capabilities, notably: API keys, MCP server, Webhooks, Workflows, Approval rules, RBAC permissions (role/permission orchestration beyond community's "everyone is an admin"), Audit log, Customer portals, Forecast, Integrations (Slack/Jira/QuickBooks/Xero), and Backups.

3. **Self-hosted deployment support.** For a paying commercial license on a self-hosted (Docker, single-VPS, our-own-infra) deployment:
   - What support SLA/response channels are included (upgrades, migration assistance, security patches)?
   - Version cadence and rebase guidance for staying current with the upstream release train (we noted the schema moves fast — 170+ migrations with a BACKWARD_COMPATIBILITY contract).
   - Whether license enforcement is offline-friendly (air-gapped or restricted-network environments).

4. **Scope clarifications.**
   - Does a commercial license for API/MCP also cover programmatic (non-interactive) session-based access, or is a dedicated service account recommended?
   - Is there a development/staging tier for non-production instances of the same tenant?
   - Any restrictions on building internal tooling (custom UIs/agents) on top of the licensed API surface for internal use only?

A rough company profile for sizing: internal use only, single legal entity, ~50–200 business users, one production instance plus one staging instance, manufacturing operations in the food industry (process manufacturing with lot traceability).

Looking forward to your pricing and terms.

Best regards,
[Name]
[Company / role]
[Contact]

---

## 起草说明（内部备注，非邮件内容）

- 覆盖面核对：任务书要求覆盖 ①API/MCP 访问的商业条款（第 1 条）②EE 功能清单与价格（第 2 条）③self-host 部署支持（第 3 条）——全中。
- 第 1.2 点（PostgREST Data API 的机器调用是否需要商业许可）直接对应 B0 决定性实验 (a)：无论实验结果如何，书面确认都能消除条款不确定性——这是询价的真正价值。
- 公司画像按我方真实形态填写（内部使用、单实体、食品制造、50–200 用户）——发送前由编排者复核替换 [Name]/[Company] 占位。
- 发送与否及最终措辞由编排者/用户决定；本文件仅为 B0 产出物。
