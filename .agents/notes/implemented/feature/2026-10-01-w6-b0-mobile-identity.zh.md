# Agent Note: W6-B0 移动端真实身份与「登记即送审」基座（G4+G1）

Status: implemented

[English](2026-10-01-w6-b0-mobile-identity.md) | 中文

用户反馈把「mobile 与 NocoBase 的数据同步」列为无法投产的首要断点；W6 调研底稿把八断点中的两条定为投产阻塞：**G4**（任意六位验证码即可登录为固定「业务员」，所有审计记录 approver 恒为 admin）与 **G1**（确认登记后单据停在 doc_status=draft，除非用户再说一句「提交审批」）。

## Problem

mobile 走任意验证码假通道，写路径把审批人缺省成 admin——审批无法归因到人；G1（登记即送审）不存在。

## 交付内容

- **会话身份注册表**（`dsh-connector-nocobase/acting-user.ts`）：进程级 sessionId→身份映射。网关在每个携带身份的 prompt 上写入，nb_* 工具读取。不做成 Cordis 服务的原因：preset 子树禁止向 root realm 发布服务，且两个包本就共享该模块实例（workspace 软链 + tsdown 将 peer 保持 external）。
- **真实登录**：新增 `nocobase.signIn` wire 方法代理 NocoBase basic 认证器（`/api/auth:signIn`，用户名或邮箱 + 密码），只回档案不回 token——NocoBase 令牌不过线。`MobileIdentity` 改为 `{username, nickname, loggedAt}`；退役的手机号+验证码存量记录按已登出处理。
- **身份绑定**（`session.prompt` 增可选 `loginUser`）：服务端绑定会话身份，并在会话首条消息盖一行持久的【登录身份】行——模型叙述的身份与工具强制执行的身份同源（model-visible ⟺ logged 成立；该行随历史回放）。
- **工具侧强制**（`tool-nocobase/write.ts`）：绑定身份后 `nb_approve` 无视模型传入的 approver（审计人=登录人），approve/reject 先校验该登录人持有 open 待办（`assertActingUserHoldsTodo`——越权闸门）；`nb_create` 盖提交人列（`ACTING_USER_COLUMNS`：pur_requests.requester、qm_inspections.inspector、mfg_job_reports.operator）。匿名面（PC、CLI）保持原行为。
- **登记即送审**（preset 契约）：pur_orders/pur_requests/so_orders/mfg_orders/srm_suppliers 的 nb_create 成功后同回合链式调用 nb_approve(submit)；回执带「审批状态」行；重复送审被状态机拒绝（submit 只从 draft 出发——引擎 CAS 拒绝双写）。
- **主管链路由**（`w6b0-identity.mts`）：四个 mobile 单据的 `manager` 层从硬编码用户名切到引擎 `{type:'supervisorChain', levels:1, emptyPolicy:'transferAdmin'}` 标记——一级待办路由到提交人所在部门的 owner。

## 验证

buyer 活体链路：登录成功 + 错误密码被拒；PO-2026-1052 登记→自动送审；psql 显示 `submit|buyer`、待办 `chenliqun`（采购部 owner）；强制重复送审被拒后 submit 计数仍=1；keeper 审批尝试被待办闸门拦截；chenliqun 批准→`approved/chenliqun`。证据：`demos/acceptance-w6/w6-b0-01..09-*`。单测：approval.spec 的 acting-user describe（4 例）跑在 mock 引擎世界之上。

## 真话债事件（已记录，本批不修）

一次确认+驳回双动作的病态回合让模型编造了 `submit_receipt`（reasoning 原文写着「行 id 假设 105」；并无 nb_create，也无落库行）。客户端渲染围栏负载时不与工具结果交叉核对。B1+ 加固方向：回执卡以会话日志中匹配的工具结果 rowId 为准。

## 未做

- 不做按用户 NocoBase token 透传（写路径继续用部署级服务账号，身份走审计列 + wfl 记录）。行级 ACL 有诉求时是 B10+ 的决策。
- 不做客户端提交 outbox（G6）——本批以状态机拒绝作为幂等兜底。
- 引擎自身 OR 会签路径保持宽松（页面/CLI 传统）；身份闸门按设计只加在工具路径。

## Alternatives considered

- **保留演示验证码通道 vs 真实对接 NocoBase users**——选真实；演示通道仅作回滚 feature flag 保留。
- **一次做全 JWT vs 最小「身份透传+审计真实化」闭环**——选最小闭环，JWT 完整化分步。

## Consequences

成本：登录链路依赖 NocoBase users 存活。买到：审批逐单真实归因（实测非 admin 审批 73 单）+越权拒绝可取证。
