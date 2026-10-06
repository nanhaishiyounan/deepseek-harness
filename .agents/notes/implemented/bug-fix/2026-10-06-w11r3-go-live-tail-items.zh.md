# Agent Note: W11-R3 Go-live 收尾微批——登出披露、sweep 留痕、批失败 Toast 重锚与验证计数勘误

Status: implemented

[English](2026-10-06-w11r3-go-live-tail-items.md) | 中文

## 问题

W11-R2 复验以 PASS 87.7 收口（LAN HTTP 可交付），留下四条小时级 Go-live 建议。四项全部骑在 R2 批次自己的表面上：

- **验证计数勘误**：R2 的 INDEX 条目与 note（中英）声称 `w11-r2-live-verify.log` 11/11；log 实为九条断言（R2-0、R2-1a~1f、R2-2、R2-3）。
- **登出披露债**：W11-R2 的清扫会在登出时清除草稿、待发 outbox 消息与附件 strip，但确认弹窗仍只说「会话与业务数据保留在服务端」——扩大后的本地清除面在破坏性点击前未披露。
- **清扫静默**：`sweepSessionKeys()` 返回被清键名却无人消费——运维无法 grep 一次登出清了几把键，而 outboxStore 与附件卫生都留有结构化追踪。
- **批失败 Toast 压在附件条上**：antd-mobile 的 bottom toast 锚定在附件条同一视口带；它点名的 failed chip 正压在下方（375×812 视口实测 clearance −15px）。

## 决策

- **计数按 log 实读**——三个文件改为 9/9，随后 `verify-translation-pairing --write` 重录 note 配对的 blob hash。
- **弹窗披露清扫的本地面**：「退出后需重新输入账号密码登录；会话与业务数据保留在服务端；本地草稿与待发消息将被清除。」views spec 在破坏性点击前钉住披露行。
- **清扫留一条痕**：`App.onLogout` 消费返回的键名清单——`console.info(JSON.stringify({ type: 'session-keys.swept', count, keys, at }))`——outboxStore 的观测口径；`localKeys.ts` 的 `@returns` JSDoc 本就把键名清单命名为 trace detail。
- **Toast 在底缘重锚而非顶缘**：活体实测打开态 toast main 骑 `position: absolute` 且底缘钉死视口底部——覆盖内联 `top: 80%` 只拉伸盒子高度（rect.bottom 纹丝不动）。因此 lift 改走 toast 的 `maskClassName`（chat.module.css 内的 CSS-module 类）设 `top: auto !important; bottom: 150px !important`：底缘落在附件条顶轨上方 25px，且与 toast 高度无关（1~3 行批次实测皆稳）；`ToastShowProps` 没有 style 直通，`maskClassName` 是唯一能到达 main 挂靠的 mask 的通道。

## 后果

ui-mobile 754/754（断言并入既有用例；R2 记账为 745，差 9 为 R2 期新增）、`tsc -b tsconfig.client.json` 绿、改动文件 oxlint 0 errors。活体验证 `w11-r3-live-verify.log` 6/6，跑在重建的 :3080 dist 上：页面 identity 以合法 shape 直种 localStorage（受测四项全部为纯前端行为——零产品 seam 被 stub），种 token 引发的 `nocobase-unauthorized` 弹回以 `not-composed` 拒答隔离；Toast 几何断言 clearance=25.0px ≥15px 且 computed bottom=150px，弹窗文案逐字披露，登出留下 count=3 的 `session-keys.swept` 覆盖全部三类种子键而 theme 键保留。截图 `w11-r3-{toast-lift-clearance, logout-disclosure}-375.png`。

## 备选方案

- **以 `!important` 覆盖内联 top（第一版尝试）**——实测：computed top 移动了，rect bottom 不动；盒子在 top 偏移与钉死底边之间被拉伸，chip 依旧被盖。
- **更大的 top 式 lift（calc(80% − 300px)）**——所需偏移随 toast 自身高度缩放（双失败批次约 153px）；bottom 锚让 clearance 天生与高度无关。
- **Toast 改 position `center`**——也能让开附件条，但放弃了表面上其余 toast 共守的 bottom-toast 惯例；重锚保留了它。
- **把 trace 放进 `localKeys.ts`**——清扫模块就要拥有 console 策略；App.tsx 的登出路径才是其余登出追踪的所在地。
