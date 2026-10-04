# Agent Note: W8-B1 — mobile accessibility foundation (focus/link/touch/input tokens, keep-alive tabs)

Status: implemented

English | [中文](2026-10-04-w8-b1-mobile-a11y-foundation.zh.md)

The W8 audit's B1 batch (blueprint §4-B1): the mobile token set gains the four accessibility increments the WCAG sweep found missing (keyboard focus, a link grade that survives both tracks, the 40px secondary touch target, the 16px input floor), dark-track input wells step off the card face, the four tab pages stay mounted behind `[hidden]` so a tab switch keeps scroll/filter/half-typed state, and a light-track probe joins the W7 dark matrix as a standing acceptance gate. Token- and shell-level only — no page business logic moved.

## Problem

The audit's WCAG pass pinned four gaps the v6/v7 token base could not express: the whole client had zero `:focus-visible` rules (keyboard and screen-reader users got no focus indication at all), the dark-track brand blue `#2a5fa6` measured 2.38:1 against the card and still carried 33 pure-text tappable uses (chat-body links, todos/docs/alerts links and retries, the secondary approval chips), dark-track form inputs filled with the card value itself (a zero-contrast well whose only edge was a 1px border), and the 13px input controls triggered iOS Safari's focus auto-zoom. Separately, every tab switch remounted `<main>` — scroll position, CapsuleTabs filters, and half-typed drafts were destroyed by visiting a sibling tab and back (audit #⑧), which no exit animation could fix.

## Decision

- **Token increments**: `--dshm-focus-ring` (light `rgba(30,78,140,.35)` / dark `rgba(83,131,199,.5)`), `--dshm-link` (light `#1e4e8c` — the brand value already passes on white; dark `#7b9dd1` ≥4.5:1 on the card), `--dshm-touch-sm` lifted to 40px, and `--dshm-fs-input: 16px`. Global rules in `tokens.css`: `.dshm-root :focus-visible` renders the halo through a box-shadow (it wraps each control's own radius; pointer interaction never fires it; inputs that draw their own focus border keep that border under the halo), `.dshm-root { touch-action: manipulation }` removes the 300ms double-tap-zoom delay, and every `input`/`textarea` holds `font-size: max(var(--dshm-fs-input), 1em)` — the longhand after the shorthand overrides an inherited display grade, so a component dialing a larger size keeps it and nothing typing-sized drops under the iOS zoom floor.
- **Dark-track input wells**: `--dshm-input-bg` steps to `#141b26` (the muted tier; the previous value was the card itself). v3 fieldInput/fieldPicker, field-widget surfaces, the composer input, login, and search ride the token; the light track keeps its white fill + border and gains only the `--dshm-link` focus border.
- **Link-grade discipline**: pure-text tappables across seven module files read `var(--dshm-link)`; text on soft/10 fills reads `var(--dshm-on-soft)`; solid buttons, outline buttons, and icon decoration stay on `--dshm-primary` — the substrate decides the grade. The one hardcoded hex (the code plate's copy word) became `--dshm-code-action` (one value both tracks; the plate stays deep), leaving module CSS with zero bare hex literals (tokens.css is the whitelist).
- **Touch ladder**: secondary targets ride the 40px token (chips, stars, close buttons); the primary paths already at `--dshm-touch` 44 gained the composer stop and the search bar (both sized to 44). The password field gained its eye toggle (44px hit, `aria-label` 显示密码/隐藏密码), and the composer TextArea carries `aria-label="消息输入"` — placeholder-only was the audit's weak-accessible-name finding.
- **Keep-alive tabs**: the four tab pages (home/agents/work/me) mount lazily on first visit and stay mounted; `[hidden]` toggles the visible page, so scroll positions, list filters, and half-typed state survive a tab switch, while layer and secondary routes keep the per-route remount + slide transition (fade stays between tabs). `main` carries `tabIndex={-1}` and takes focus with `preventScroll` on route change. Every kept-alive page receives an `active` gate — a hidden page suspends its data reads and re-reads on becoming visible, so keep-alive never turns into four parallel pollers; W8-B3 wired `document.visibilityState` into the same gate (`tabAwake`).
- **`useAsync`/`usePoll` active gate**: `useAsync` gained an `active` parameter (default `true` — existing call sites unchanged). `false` suspends the fetch and keeps the last read; a false→true transition re-reads in place (a re-read over a ready cell keeps the value on screen instead of flashing the skeleton again). `usePoll` already had the same gate; the shell passes the selection × visibility conjunction.
- **Light probe**: `demos/acceptance-w8/w8-b1-light-probe.mjs` — the W7 dark probe's light twin (same computed-style truth chain) plus the facts that only exist as DOM: eleven gates — theme-light, textVsCard ≥4.5, mutedVsCard ≥4.5, linkVsCard ≥4.5, inputVsCard step ≥8, tabActiveVsTabbar ≥3, focus-ring declared, chips adjacent gap ≥8px, touchSm ≥40, searchBar ≥44, inputFloor ≥16. Raw JSON lands beside the script; any gate failure exits nonzero.
- **README v6→v7**: the mobile README pair carries the v7 Prussian-blue `#1E4E8C` narrative, the twelve-route IA, the keep-alive description, real-login Known Limitations (the six-digit-code era text retired), and the deferred verdicts (dynamic type, skip-link, landscape). Both languages together.

## Evidence

- `demos/acceptance-w8/w8-b1-light-probe.json` — 11/11 gates; the probe re-passed after both the B2 and B3 batches, and the `w7-b6` dark matrix shows zero regression.
- `hooks.client.spec.tsx` gained `suspends while gated off and re-reads in place when a keep-alive page becomes visible` (gate-off keeps the value; each false→true transition re-reads).
- `demos/acceptance-w8/w8-b1-01..08-*.png` (375×812, qc_inspector real login): the login eye toggle, light home/work, the home-restored-after-tab-switch shot (scroll kept), and four dark faces (home/agents/chats/chat — the dark chat shot carries the v3 input well and an in-text link).
- Bare-hex scan over `src/client/**/*.module.css` returns zero hits (tokens.css whitelisted).

## Known residue

- Skip-to-content stays deferred (audit verdict): the 430px shell with bottom-tab form keeps keyboard paths short; the focus ring plus tab order covers most of it. The px type ramp does not follow the system Dynamic Type (a 430px-shell decision — keyboard readability rides the focus ring), and landscape is not tuned (the portrait phone shell is the product shape). README Known Limitations records all three.
- The probe measures chips-gap on home only; other chip rows (agents roster, work tools) ride the same spacing tokens but are not separately gated.

## Alternatives considered

- **44px everywhere vs the 40/44 ladder** — WCAG 2.5.8 AA floors at 24px and Apple's 44pt guidance binds the primary paths; 40px clears both baselines while the chip/star/close rows keep their density, and the true primary paths (send, back, new-chat, stop, search) are all 44.
- **`outline` vs the box-shadow halo** — outline paints a rectangle that ignores each control's radius; box-shadow wraps it. `:focus-visible` (not `:focus`) keeps pointer taps from ever painting the halo.
- **Exit animations for tab switches vs keep-alive** — audit #⑧ asks for state survival, not animation; a kept-alive tab has no unmount to animate, and layers keep the one-way entrance stance.
- **Hard 16px inputs vs `max(16px, 1em)`** — the zoom guard needs only a floor; a hard 16px would drag down any surface whose display grade is larger.
- **A new input-well token vs stepping `--dshm-input-bg` onto the muted tier** — the `#141b26` step already exists in the ramp; the token stays separate so a future input-specific fill cannot drag the muted tier with it.
- **A dedicated link component vs the CSS-grade split** — the grade is a property of the substrate (plain text vs soft fill vs solid button), not of a component; module CSS expresses it with no new import surface.

## Consequences

- New module CSS carries no bare hex; color decisions land in `tokens.css` and surfaces read tokens (the zero-hit scan is the baseline a reviewer can re-run).
- A pure-text tappable reads `--dshm-link`, text on a soft fill reads `--dshm-on-soft`, and solid/outline buttons keep `--dshm-primary` — the substrate decides the grade, and the probe's linkVsCard/inputVsCard gates catch a surface that forgets.
- A kept-alive tab page that adds a data read must wire the `active`/`tabAwake` gate; without it four tabs poll in parallel (keep-alive removes the single-visible-page assumption the old remount model gave for free).
- `useAsync`/`usePoll` gates are conjunctive: call sites pass one `active` value; selection and visibility combine in the shell, not in N call sites.
- The light probe and the w7-b6 dark matrix are the mobile client's two standing computed-style acceptance gates; both re-run after any token or shell change.
