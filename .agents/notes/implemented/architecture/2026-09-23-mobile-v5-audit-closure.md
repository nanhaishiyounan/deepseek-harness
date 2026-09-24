# Agent Note: Mobile v5 audit closure — PageNav as the one back affordance, skeleton loading states, touch tokens, and the top safe area

Status: implemented

English | [中文](2026-09-23-mobile-v5-audit-closure.zh.md)

## Problem

The v5 audit surfaced one user-facing defect and a family of consistency gaps. The chat page's NavBar passed no `back`/`backIcon`/`onBack` while hand-rolling its back arrow through the `left` slot — antd-mobile renders the default back area whenever `back !== null`, so the header showed **two** left arrows, one of them a dead glyph. Around it: secondary pages each carried their own 52px NavBar boilerplate; the first-load states mixed three vocabularies (blank paint, an empty-state ErrorBlock standing in for loading, plain-text errors); touch targets ranged 28–40px across surfaces with a 44px comment over a 40px rule; only the bottom safe inset existed while the host page sets `viewport-fit=cover`; and two surfaces nested a button inside a button.

## Decision

**PageNav owns the back affordance.** `PageNav` (title, onBack, right?) wraps the antd-mobile NavBar and is the only header every secondary page and full-screen layer mounts — chat, work detail (both faces), agents, tasks, files. It passes `back=""`, `backIcon`, and `onBack` explicitly, never the `left` slot: antd's default-back rendering is an explicit contract, not a coincidence to lean on. The back glyph itself is a real `<button aria-label="返回">` riding the 44px primary touch target; its click bubbles to antd's `.adm-nav-bar-back` click layer, so both the labeled button and the antd hit area work. antd-mobile hardcodes `role='button'` on its left container without an accessible name and offers no override prop; the labeled inner button carries the semantics and the anonymous container stays a known redundancy.

**Loading is a skeleton or a spinner, never an empty-state card.** Shared atoms `SkelRow`/`SkelCard` breathe on the global `dshm-skel-pulse` keyframe (tokens.css; CSS Modules keep foreign animation names verbatim) and render aria-hidden inside a page group carrying `role="status"`. Home shows roster-card and recent-chat silhouettes while its reads are in flight (the empty copy now waits for the ready read); the agents directory shows skeleton cards, NoticeCard for both the empty roster and the roster failure (retiring the plain-text `p.empty`), and a DotLoading 创建中 mark while a session start is busy; the chats list shows five skeleton rows instead of an ErrorBlock titled 加载中; the chat flow's first read is a centered SpinLoading row. Empty and error states keep the existing NoticeCard/ErrorBlock vocabulary with a CTA where an action exists.

**Touch targets are two tokens.** `--dshm-touch: 44px` for primary actions (the back hit, send, the two new-chat plus buttons) and `--dshm-touch-sm: 36px` for secondary ones (quick chips, shortcuts, task/file entries, card actions, search bar, sheet close buttons, the favorites star's hit area). Every surface that hardcoded 28–40px cites a token; the 44px-comment-over-a-40px-rule back button died with its hand-rolled JSX. The chats and work tab headers align to the PageNav's 52px height — NavBar sizes itself from antd-mobile's own `--height` variable, overridden in the `.pageNav` CSS Modules scope — so all page heads share one measure.

**The root clears the top safe area.** `.dshm-root` carries `padding-top: env(safe-area-inset-top)`; every page (tab heads, secondary NavBars, the login gate) inherits the notch clearance through the one root, while each surface keeps owning its bottom inset. The box-sizing border-box root keeps its 100% height, so the layout below shifts down, not under.

**No control nests inside a control.** The new-chat sheet's form chips render as plain spans — their start action is the roster row's own, so the row button keeps the one interactive role. The files row's star moved out of the open button: the row head is a div holding the open button and the sibling star hit (36px, keyboard-operable as before).

## Consequences

- The mobile golden snapshot (`apps/web/tests/snapshots/mobile-assistant/chat.expected.md`) records the single `button "返回"`; it was refreshed with the fix.
- `getByRole('button', { name: '返回' })` resolves to the PageNav's labeled button in jsdom — the pre-fix tests passed only because antd's left container has no accessible name, not because the dead arrow was invisible to layout users.
- Loading-first paints mean home's empty-copies assert after `waitFor`; the tests that pinned the synchronous empty paint were updated with the behavior change.
- The chat header's title/hint lines lost their 200px clamps and flex-shrink with `min-width: 0` — long titles ellipsize against the NavBar's own title box instead of an invented pixel budget.
- Direction-aware page transitions were considered and declined: the hash router cannot tell a link-driven push from `history.back()` without owning a history stack, and a wrong-guess slide direction reads worse than the consistent single-side entrance; the decision is recorded in transitions.css, not a TODO.
- The KG evidence entry's magnifier emoji became a lucide Search glyph (the no-emoji-as-icons rule); the sheet close unified on the lucide X at 18px.

## Alternatives considered

- **Fixing the double back by passing `back={null}` and keeping the `left` button.** Rejected: it preserves the hand-rolled arrow the audit set out to retire and leaves five pages with five NavBar templates; PageNav collapses the template and the fix into one owner.
- **Overriding antd's left container role via a wrapper or a forked NavBar.** Rejected: no prop reaches it, a fork outlives its usefulness, and the anonymous role is harmless behind the labeled button.
- **Skeletons as per-page CSS only.** Rejected: the row and card silhouettes repeat across four surfaces; the shared atoms keep one pulse and one aria contract.
- **Direction-aware transitions with a history-ownership shim.** Rejected on the risk/benefit above; recorded as a deliberate stance in transitions.css.
- **Treating the star's outer row as the single button and moving the pin action into a long-press.** Rejected: a hidden gesture replaces a visible affordance; the sibling hit keeps both actions discoverable and valid HTML.

## Testing

Package tests cover the single back affordance through the existing `getByRole('button', { name: '返回' })` assertions (shell layer test, chat flow test) and the antd back-area click through the `.adm-nav-bar-back` selectors (agents, files); home's empty-copy tests assert after `waitFor` for the loading-first paint; the golden `pnpm run test:web -- mobile-assistant` pins the refreshed a11y tree.
