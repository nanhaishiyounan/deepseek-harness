# 批次 G1：logo 统一（Brand 对齐 Hub）+ 移植基建（table-kit 拷入）

> 隶属 [PLAN.md](PLAN.md)。前置：无。两个独立小面：① CRM [`brand.tsx`](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx) 的 `Brand` 组件对齐 Hub 结构（修 logo 诉求）；② Hub [`lib/table-kit/`](../../platform/nocobase-portals/demo-portal-hub/src/lib/table-kit) 33 文件拷入 CRM（G2-G6 全部域批的列表页公共依赖），在本批打通「拷贝 → tsc → build → deploy → 浏览器」全链路。

## 改动面 1：Brand 组件对齐（根因见 [00 §1.2](00-research-notes.md)）

**文件**：[platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx)

仅改 `Brand` 函数体（:47-61），`BrandLogo`/`BrandWordmark`/APP_NAME 不动。目标结构 = Hub [`brand.tsx:49-61`](../../platform/nocobase-portals/demo-portal-hub/src/components/app-shell/brand.tsx:49) 逐行对齐：

```tsx
// NocoBase logo | App name
export function Brand({ className, logoClassName, showText = true }: BrandProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandLogo className={logoClassName} />
      {showText && (
        <>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          <BrandWordmark />
        </>
      )}
    </div>
  );
}
```

影响面（自动修复，无需改消费点）：[sidebar.tsx:295](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/sidebar.tsx:295)（展开态侧栏头部）、[header.tsx:113](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/header.tsx:113)（顶栏）、[auth-layout.tsx:24](../../platform/nocobase-portals/demo-portal-crm/src/components/auth/auth-layout.tsx:24)（登录页）。侧栏收起态（showText=false）行为不变（仍只显图形）——与 Hub 一致。`BrandWordmark` 不再吃 `logoClassName`（Hub 版如此；h-10 登录页字号由外层控制，浏览器验收确认）。

## 改动面 2：table-kit 基建拷入

```sh
cp -R platform/nocobase-portals/demo-portal-hub/src/lib/table-kit \
      platform/nocobase-portals/demo-portal-crm/src/lib/table-kit
```

- 33 文件（kpi-bar/bulk-bar/saved-view-bar/list-toolbar/toolbar-search/format-currency/format-date-time/format-number/csv/print/url-state 系 hooks 等，清单见 [00 §7](00-research-notes.md) lib 对比）；纯新增，与 CRM 现有 `pages/crm/list-toolkit.tsx` 并存互不干扰（两套列表工具本轮不合并——Hub 域页面 import `@/lib/table-kit`，CRM crm 页面继续用自己的 toolkit，统一留 H 轮）。
- 依赖检查：table-kit 内部仅依赖 `@/lib/utils`（cn）、`@/components/ui/*`（两侧逐字节相同的 63 件 shadcn）、lucide-react、date-fns 级别——两侧 package.json 依赖清单一致（仅 name 不同），**无新增 npm 依赖**。
- tsconfig `@/*` 别名两侧同构（`./src/*`），import 路径零改写。

## 实施步骤

1. 改 CRM brand.tsx `Brand` 函数体（上面的代码）；
2. `cp -R` 拷入 table-kit；
3. `cd platform/nocobase-portals/demo-portal-crm && pnpm tsc --noEmit`（EXIT=0）；
4. `node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts`（构建+部署；再跑一次确认树哈希一致——deploy 双跑惯例）；
5. `node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify`（既有品牌断言全绿）。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-g1/`）

1. 浏览器截图 ×4（:3080/nocobase/dist/crm/）：登录页、侧栏展开态首页、顶栏、暗色模式——四张均显示「图形徽标 | 竖线 | DSH食品业务平台」，与 Hub 同角度截图（:3080/nocobase/dist/hub/）并排对照；
2. `portal tsc --noEmit` EXIT=0；deploy 双跑树哈希一致；
3. verify 全绿（品牌资产断言 :892 组、网关 favicon :939 组——本批未动资产，预期不变绿转红均无）；
4. CRM 原有页面零回归：dashboard/deals/leads 三页浏览器抽查 + 既有 6 个 playwright e2e 跑通（`cd platform/nocobase-portals/demo-portal-crm && pnpm e2e` 或按其 package.json scripts）；
5. Hub Portal 截图一张证明未动（:3080/nocobase/dist/hub/ 首页正常）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 登录页 `logoClassName="h-10"` 语义变化（原来作用于 Wordmark 字号，现在作用于 BrandLogo 高度） | 低 | 浏览器实测登录页视觉；若徽标过大，消费点微调 `logoClassName`（h-8）——这是消费点样式，不属于结构回退 |
| table-kit 内有 Hub 侧独有依赖漏检（如某 ui 组件 CRM 缺） | 低 | tsc 全量类型检查兜底（本批步骤 3 即验证）；缺件从 Hub 对应目录补拷（两侧 ui 63 件逐字节相同，预期零缺） |

回滚：两个独立提交（brand.tsx 一改 / table-kit 一拷），revert + redeploy 即回。
