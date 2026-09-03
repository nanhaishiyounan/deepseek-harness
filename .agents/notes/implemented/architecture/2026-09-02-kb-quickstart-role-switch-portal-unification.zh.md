# Agent Note：kb-agent QUICKSTART 换角色统一走场景门户

Status: implemented

[English](2026-09-02-kb-quickstart-role-switch-portal-unification.md) | 中文

## Problem

QUICKSTART 的换角色节把网页门户与 `agent-presets` 下的两个角色预设当作并列入口来教，把"复制进 `$DSH_HOME/.agent-presets`"当作让预设可选的常设指令。三个已落地的事实早越过了那套叙述：空白会话门户（[门户 IA 笔记](2026-09-01-kb-workbench-portal-ia.zh.md)）是每个网页会话的首屏，摆着三十张场景卡；`cordis.patch.yml` 把 `examples/kb-agent/agent-presets` 与 `examples/kb-agent/scenarios` 都挂为 user 信任的预设根，任何 `DSH_HOME` 下全部出厂预设零复制可达（[预设可达性笔记](../bug-fix/2026-09-01-web-new-session-preset-reachability.zh.md)）；门户目录与场景库在防漂移门禁下一对一镜像（[同步门禁笔记](../testing/2026-09-02-kb-portal-scenario-sync-gates.zh.md)）。照抄复制配方、或把两个角色预设当主路径找的读者，走的是与产品首屏相反的路。

## Decision

场景门户是 QUICKSTART 换角色的首选路径：点三十张卡之一，在角色确认框（描述加示例问题）里确认，点"开始会话"——示例问题预填输入框。`agent-presets` 的两个角色预设（`enterprise-data-assistant`、`food-compliance-officer`）在文档里是门户两张同名卡（`scenarios/enterprise-data`、`scenarios/food-compliance`）背后的点击直达，而非并列入口；`enterprise-data-assistant` 保持新建会话的默认角色。复制进 `$DSH_HOME/.agent-presets` 只作为自建预设的路径出现，默认角色可在 `$DSH_HOME/settings.yaml` 里用 roster 预设 id 覆盖——场景卡的 id（如 `food-compliance`）同样生效。命令行 headless 会话保持 kb-agent 基础角色：预设（含场景预设）只在网页工作台组合生效。

## Alternatives considered

**保留两个角色预设作为并列的文档入口。** 拒绝：门户是唯一从任何 `DSH_HOME` 零复制够到全部角色的入口，且两张同名卡经真实 `agentPresets.select` 往返选中的就是同一批角色；并列路径让文档旅程偏离产品首屏，换不来卡片缺失的任何能力。

**继续把复制配方当通用预设指令来教。** 拒绝：组合声明的预设根已让复制对全部出厂预设失去必要；可写根恰好只剩自建预设这一场景值得教，节里也只在那里教它。

## Consequences

文档的换角色旅程与网页首屏是同一条路，2026-09-02（Node 22.19.0）实测：点"企业数据助手"卡、确认框、会话头部的角色名、预填的示例问题（水电气 单耗）。节里对两个角色预设的覆盖收窄到卡片面上不写的部分——合规官的 GB 2760/GB 14881 依据与数据助手的五类问答面。自建预设的作者保有经可写根的成文路径，`settings.yaml` 默认角色覆盖接受场景 id，两个卡背角色无需复制任何东西即可被选为默认。
