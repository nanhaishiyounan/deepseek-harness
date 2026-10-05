# Agent Note: W10 — 章名单一 selector 与三面同源规则

Status: implemented

[English](2026-10-05-w10-stamp-name-single-selector.md) | 中文

## Problem

同事章（两字头像方块）渲染在三面上——会话列表（消息页会话行与首页最近对话行）、roster 页、chat 面（头章+回合章）——但直到 W10-R3 收口前，各面名源各不相同：roster 页读自己的行名；chat 面自 W10-R2 修复（6b2b9203ff）起读新增的共享 selector `colleagueNameOf`（roster 名，缺省 visual 的职责标签）；两个列表面仍经 `titleOf` 读会话标题，于是同一同事的章随会话漂移——问题文本标题借出标题自己的头两字，新会话标题借出「新会」，同一 preset 的每个会话都展示一个其来源 roster 页永不展示的章。同一 preset 三面读到三个不同的名字，而 chat 面的单独修复留下了四处独立收敛的存量债：`MessagesView` 会话行章、`HomeView` 最近对话行的两处章、roster 页裸传 `row.name`、以及 `ChatView` 头部副标签逐字符复写 selector 表达式。

## Decision

`colleagues.ts` 的 `colleagueNameOf(presetId, rosterRow)` 是所有章面读取的唯一名源模板——roster 行显示名，缺省 visual 职责标签；会话标题永不进章。W10-R3 收口让每个列表面都组合 `stampAcronymOf(preset, colleagueNameOf(preset, rosterRow))`：`MessagesView` 用挂载即读一次的 `listAiEmployees` 喂一张 preset-id→行映射供会话行用；`HomeView` 在既有 roster 读之上建同一张映射供最近对话行用；`AgentsView` 传 `colleagueNameOf(row.id, row)` 替代裸 `row.name`（行为等价——行名胜出——但同源规则从此靠构造成立而非碰巧一致）；`ChatView` 的 `presetLabelOf` 头部副标签非本地分支复用该 selector 替代重复表达式（头章/回合章本身已在 W10-R2 迁移）。W10-R4 守卫收口把最后两处裸名直传——新建会话弹层的 roster 行与首页 roster 横条——并入同一组合，从此每一面都靠构造走同一 selector 链。会话标题保有自己的位置——行标题文本、搜索匹配、chat 头部主标题——约束只有一条：标题永不喂给章。

## Alternatives considered

**列表面保留 `titleOf` 名源（只收口 roster 与 chat）。** 列表章继续随会话漂移；同一同事在 roster 页展示 roster 章、chat 里展示借名章、每个列表行展示随标题而变的章——正是 W10 审计标记、R2 着手移除的同面不一致。

**各调用点内联 `rosterRow?.name ?? visual.duty`（R2 前 `presetLabelOf` 的形态）。** 一个表达式的四份拷贝恰恰招致 selector 要防止的漂移；roster 页那份已经漂成裸 `row.name`，一致只是巧合。

**把借字规则（`stampAcronymOf`）折进 `colleagueNameOf`。** 两个 selector 回答不同问题——完整显示名（头部副标签、回合名行）对比带 AI 前缀借出与兜底的两字章词。折叠会把章专属边界（「AI」兜底词、`!!` 对、空名护栏）推进从不需要它们的全名调用点。

## Consequences

列表章的展示内容变了：以问题文本命名的会话不再借标题头两字——同一 preset 的每个会话现在都带该同事自己的章词（AI 食安合规官 →「食安」），与同 preset 的 roster 面、chat 面一致。消息列表新增一次挂载即读的 roster 读；roster 读失败或未携带某 preset 行时，各面一致落到同一职责标签路径，降级态下三面仍同源。借字边界与六种标题场景一同钉在 `views.client.spec.tsx`：特殊字符名（`AI!!报警` → `!!`）与空名/纯空格名（→ `AI` 词），借字永不渲染空对，三面同源规则靠断言成立而非靠假设。
