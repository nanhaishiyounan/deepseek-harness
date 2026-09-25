# ui-mobile v6 exhaustive UI audit — findings (2026-09-24)

Read-only audit against the live `dsh web` server (PID 51859, http://127.0.0.1:3080/mobile).
Screenshots `audit-NN-*.png`, drivers `.audit-*.mjs`, machine evidence `.audit-*-evidence.json`
all in this directory. Two systemic root causes explain most findings.

## Root cause A — antd-mobile portals escape the `.dshm-root` token scope

antd-mobile renders Popup/Picker/DatePicker/Dialog/Toast into `document.body`, outside
`.dshm-root` where every `--dshm-*` and the `--adm-*` mapping live
(packages/client/ui-mobile/src/client/tokens.css:86-99). antd-mobile's own defaults are
declared at `:root` (antd-mobile bundle style.css: `--adm-color-primary: #1677ff`,
`--adm-color-background: #ffffff`). Consequences measured live:

- `.adm-popup-body` with `bodyClassName` (`.sheetBody`, TaskFormModal work.module.css:748-752)
  computes `background-color: rgba(0,0,0,0)` (invalid var → unset → transparent) and
  `border-radius: 0px` — audit-01/06/08/09 evidence.
- Body-level `--adm-color-primary` = `#1677ff` (antd default blue, not brand `#2e7cf6`)
  for every portal control: Picker/DatePicker confirm buttons, Switch checked fill,
  Dialog confirm — audit-02/03/17/31 evidence; the in-root Profile switch reads
  `#2e7cf6` (audit-02 evidence) → same component two colors.
- Dark track: portal surfaces keep antd light defaults (white panel, #333 text,
  #1677ff accents) — audit-07/08/09/30 evidence.
- Desktop ≥720px phone shell: portal popups are `position:fixed; width:100%` of the
  viewport — TaskForm/NewChat sheets measured `left:0, width:1280` against the 430px
  centered shell, mask covers the whole viewport — audit-37/38/30 evidence.

## Root cause B — `.dshm-root button { background:none; color:inherit; border:none; padding:0 }`
## out-cascades every module button class

tokens.css:172-179 resets buttons at specificity (0,1,1); every CSS-module button
class (`.reportPrimary`, `.actionPrimary`, `.sheetSubmit`, login `_submit_…`,
`.adm-button-primary` from antd…) is (0,1,0). The reset wins, so every custom button
renders transparent-background, border-less, ink text. Measured:

- Login CTA `bg rgba(0,0,0,0)` despite `.adm-button-primary` (audit-07, audit-32).
- Report-card actions both transparent, no primary/secondary split
  (audit-07 classList `_reportPrimary_10ex7_992` attached but ineffective; audit-41).
- Work-card actions 打回/确认完成 transparent (audit-07).
- Home quick actions read as bare text (audit-44).
- TaskFormModal 取消/创建任务 buttons transparent too (portal context: root-cause A
  kills the vars; the reset itself does not reach them).

## Issue register

| # | Sev | Issue | Evidence | Expected vs measured | Fix direction |
|---|-----|-------|----------|----------------------|---------------|
| 1 | P0 | TaskFormModal sheet background transparent, content overlaps the dimmed chat underneath (user-named) | audit-01/07, .audit-01b-evidence.json | bg `var(--dshm-card)` #ffffff / 16px top radius vs `rgba(0,0,0,0)`, `0px` | Portal-scope fix (root cause A) |
| 2 | P0 | `.dshm-root button` reset erases all module/antd button styling app-wide (login CTA, home quick actions, work actions, report actions, sheet buttons) | audit-07/32/41/44 | solid/bordered buttons vs transparent text-only | Raise module button specificity or drop `background`/`color` from the reset (root cause B) |
| 3 | P0 | Dark-track portals fully light: Picker/DatePicker white bg + #333 text, clear-demo/logout Dialog white + antd blue | audit-07/08/09/30/31 | track surfaces (--dshm-card #1a212d, text #e8ecf4, brand #2e7cf6) vs white/#333/#1677ff | Root cause A |
| 4 | P1 | antd default blue #1677ff leaks on portal controls while in-root reads brand #2e7cf6 (Switch, Picker confirm, Dialog confirm) | audit-02/03/17 + audit-02 (profile switch #2e7cf6) | #2e7cf6 both places | Root cause A |
| 5 | P1 | Desktop ≥720px: bottom sheets span the full 1280px viewport (shell is 430px centered); mask covers the whole viewport | audit-37/38/30 | contained in shell | `getContainer` into the shell root or width-constrain portals |
| 6 | P1 | Sheet corner radius lost (0px) on TaskForm/NewChat sheets | audit-01/08/09 | 16px | Root cause A |
| 7 | P1 | NewChatSheet transparent background (same as #1) | audit-08/09 | #ffffff / #1a212d | Root cause A |
| 8 | P1 | Report-card actions lose primary/secondary split (root cause B face) | audit-41 | primary #2e7cf6 solid + ghost soft | Root cause B |
| 9 | P2 | Toast is antd default (centered, rgba(0,0,0,.7), 8px radius, max-width 204px) vs design `bottom:110px` capsule rgba(24,32,47,.92) 999px | audit-11/14 vs design mock `.toast` | design values | Custom toast skin or accept antd default (design covers it) |
| 10 | P2 | Picker panel radius 8px (antd default) off the 16/14/13/12/11 scale | audit-02/17 | 16px | Root cause A fix also remaps `--adm-border-radius-*` |
| 11 | P2 | Work page: 8-card tool grid fills the first screen; default 待处理 tab is empty and its empty state sits below the fold | audit-18/34 | list visible on entry | Reorder (tabs+list above tools) or default to a non-empty tab |
| 12 | P2 | Sheet mask 0.55 vs design 0.5 | audit-01 evidence | 0.5 | low-cost alignment |
| 13 | Obs | Quick panel dims the last chat line; qp tool icons gray vs blue chips | audit-10 | — | optional polish |
| 14 | Obs | Home: red unread dot / green presence dot read harsh; search field faint (some of this is root-cause B flattening) | audit-44 | — | polish after B fix |
| 15 | Obs | AskChoice (采购单/入库单) renders white cards + hollow radios fine; selected-state contrast unverified (no selection captured) | audit-43 | — | follow-up interactive check |
| 16 | Not verified | Skeleton pulse (loading window too fast to capture), SwipeAction swipe (CDP touch limits), ImageViewer (no image in demo flows; same portal class as root cause A) | audit-16/28/40 | — | code-level: in-root components follow tokens; ImageViewer inherits root cause A |

## Healthy surfaces (no finding)

- In-root token plumbing: home/work/chats/profile dark+light pages ride `--dshm-*`
  correctly (audit-18/20 series); CapsuleTabs active `#2e7cf6`; tab bar active `#2e7cf6`;
  SearchBar `#151b26` dark; PTR head color follows `--dshm-muted-foreground`.
- Work detail (doing): progress gradient `linear-gradient(135deg,#2e7cf6,#22b8e8)`,
  8px track, done/running dots with halos, demo banner `--dshm-primary-10`/`--dshm-on-soft`,
  dark actions bar `#1a212d` + `#252e3e` line (audit-35/36).
- Login page dark: root `#0e131b`, input border `#e8ecf4`, light text (audit-33).
- Color palette sweep: no `#1677ff`/`#00b578`/v5-teal residue in module CSS; font ladder
  and 999px pills consistent; reduced-motion covered in 7 stylesheets; pageIn 220ms
  matches the design's `.22s`.

## Coverage matrix (task checklist reconciliation)

1. 弹层类 — 7 surfaces (TaskFormModal, owner Picker, DatePicker, NewChatSheet, clear-demo Dialog, logout Dialog, Toast; ImageViewer code-level) ×2 tracks → findings 1,3,4,5,6,7,9,10,12
2. 表单控件 — TaskFormModal inputs/pickers/switch, FieldWidget css, RelationSelect css, login inputs; portal Switch+Pickers live → findings 1,3,4 (+B)
3. 反馈类 — Toast, quick panel, PTR head, Skeleton (not captured) → findings 9,13,16
4. 页面级 — home/agents/work/tasks/files/chats/profile/login/chat/workdetail ×2 tracks + desktop shell → findings 2,5,11,14 + healthy list
5. 状态矩阵 — disabled login CTA, empty-title error (not captured: modal closed early), pressed/active via code review, empty work tab → finding 11 (+B faces)
6. 动效 — pageIn/progress fill transitions measured (0.8s bezier), reduced-motion code review → no finding
7. 一致性横切 — palette/typography/radius sweeps, #1677ff leak (finding 4), toast divergence (finding 9) → findings 4,9

## Recommended fix order

1. Root cause B (one-line-ish): remove `background`/`color` from the `.dshm-root button`
   reset (or scope it to `button:not([class])`) — instantly restores login CTA, home
   quick actions, work/report actions, sheet buttons.
2. Root cause A: mount antd-mobile portals into the shell (`getContainer` → a
   `.dshm-root`-classed portal host, or move the `--adm-*` mapping + `--dshm-*` tokens
   onto `:root`/`body` with `[data-theme]`) — fixes transparency, dark-track portals,
   #1677ff leak, lost radii, and (with a width-constrained container) desktop overflow
   in one sweep.
3. Then the P2 polish items: toast skin, picker radius via `--adm-border-radius-*`,
   work-page layout, mask opacity.
