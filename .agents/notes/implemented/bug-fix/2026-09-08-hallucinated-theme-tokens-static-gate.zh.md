# Agent Note: 幻觉 CSS 主题 token 静默失效，静态门禁兜底

Status: implemented

[English](2026-09-08-hallucinated-theme-tokens-static-gate.md) | 中文

## Problem

主题命名空间自定义属性（`--dsw-*`、`--ds-*`）在计算值阶段解析：未定义的 `var(--dsw-font-s-13)` 不是错误——声明在计算值阶段变为 invalid，属性回退到继承值或初始值。没有任何门禁比对 `var()` 引用与定义，于是引用了从未定义过的 token 名的组件 CSS（四个包约 77 处声明，另有五个包从更早起就带着 8 个此类 token）静默渲染错误且肉眼看似正常；同一波改动还留下 14 处携带字面量颜色的 `var()` fallback，[docs/web-styling.zh.md](../../../../docs/web-styling.zh.md) 禁止在功能组件里这样写。诊断与实测数字见 [plans/diagnosis-2026-09-08.zh.md](../../../../plans/diagnosis-2026-09-08.zh.md)。

## Decision

### 修复走"映射到既有 token"，不是补定义

多数幻觉名是既有语义 token 的误拼或近似重复（`--dsw-font-s-13` → `--dsw-font-xs-13`、`--dsw-alias-border` → `--dsw-alias-border-l1`、`--dsw-alias-bg-sink` → `--dsw-alias-bg-module-platform`、`--dsw-alias-state-danger` → `--dsw-alias-state-error-primary`）；每处引用改指既有 token，字面量色 fallback 同法删除——所需的每个语义色都已有 token。

三个 token 确实缺失，补了定义：

- `--dsw-alias-state-error-tertiary` 补齐 success/warn/business 早已拥有的 tertiary 层（亮段 `red-100`、暗段 `red-900`），写在 design-platform.css 的两个主题段里。
- `--ds-skeleton-pulse` / `--ds-skeleton-shimmer`（骨架屏动画时长）落在 base.css 的 upstream `--ds-*` 职责区，仅在 `prefers-reduced-motion: no-preference` 下定义，keyframes 相位相反。

`--dsw-alias-gap-sm` / `--dsw-alias-gap-md` 没有可映射的间距体系；这些调用点用内联 4px/8px 长度。

### 静态门禁：packages/client/ui-theme/tests/css-tokens.client.spec.ts

三条规则扫描全部 client CSS，随常规测试套件运行：

1. 主题命名空间的每个 `var()` 引用必须能在 client CSS 定义并集中解析；
2. 任何 `var()` fallback 不得携带颜色字面量（`#hex`、`rgb()`、`hsl()`）；唯一豁免是硬编码的 `FALLBACK_EXEMPTIONS` 清单——`web/src/base.css`，其 fallback 保证主题注入前首屏可读（启动顺序见 [pre-plugin theme bootstrap note](2026-08-10-pre-plugin-theme-bootstrap.zh.md)）——并有卫生测试保证每个条目仍是指向真实使用 fallback 的文件；不存在按行内注释豁免的语法；
3. design-platform.css 内定义的每个主题 token 必须在其亮、暗两段都有定义——该样式表把静态色阶与 alias/specific 层按主题各写一遍，只在一段出现的 token 会在另一主题里静默消失（规则落地时每段 173 个 token）。

非主题命名空间的组件契约变量（`--dsh-*`、`--trajectory-*`，React 运行时以内联样式注入）有意不在门禁命名空间内：它们对静态分析不可见是设计使然。

## Alternatives considered

**给每个幻觉 token 补定义而不是改引用。** 否决：这些名是既有语义 token 的近似重复；补定义会让 token 面多出同义词，且每对之间必然在未来漂移。

**用运行时 computed-style 扫描当门禁。** 否决：它只能观察被人打开的页面上已渲染的节点，CI 需要浏览器，且报告的是 DOM 位置而不是声明处的 file:line。静态扫描跑在 vitest 里，看得到包括未挂载组件在内的每个 CSS 文件，并在声明点失败。

**强制每个 `var()` 带 fallback。** 否决：fallback 会掩盖缺 token 的 bug（声明以 fallback 值"正常"渲染），并把 web-styling.md 禁止的字面量颜色路径重新合法化。

## Consequences

- 四个修复包的 327 处 `var()` 引用：未定义 104 → 0；全 client 主题命名空间：未定义 33 → 0；字面量 fallback 14 → 0（含 5 处动画 fallback）。
- 幻觉 token 名、base.css 之外的字面量色 fallback、design-platform.css 的亮/暗单侧定义，都会让 `pnpm test` 带 file:line 失败。
- 新的 design-platform token 必须同一改动落在两个主题段，否则对称规则构建失败。
- `web/src/base.css` 仍是唯一的 fallback 豁免；其启动顺序理由消失时需回头核对 pre-plugin theme bootstrap note。
