# Agent Note: Knowledge-graph canvas UX — composer-overlay scroll chain, container resize, interaction surface

Status: implemented

English | [中文](2026-09-12-kg-canvas-ux-scroll-chain.zh.md)

## Problem

The graph page drew three user complaints in one breath: "scrolling is broken", "screen fit is broken", "interactions don't work". Three independent root causes, each verified on the running product:

1. **Scroll chain.** The kg view sat in ConversationRoot's default viewArea mode (`flex: 1 0 auto; min-height: auto`), so the viewArea grew with content and every scroll bubbled to the session-level scrollBody (which carries the sticky composer). The page's own `.page { overflow-y: auto }` became a dead scroller, the `.mainSplit → .canvasFrame → .canvasViewport` flex chain never resolved against a bounded height, and the canvas fell back to its `min-height: 300px` floor at every viewport. Wheel semantics oscillated between "zoom" (sigma preventDefaults over the canvas) and "scroll the whole page with a sticky footer" everywhere else.
2. **Resize.** sigma only listens for window resize. The product sidebar is a draggable grid (AppFrame's pointer-captured DragHandle), so dragging the sidebar never fired a window resize and the canvas kept its stale WebGL viewport — stretched or blank-edged. The stylesheet had zero media breakpoints, so narrow screens squeezed the split instead of stacking it.
3. **Interaction.** The Sigma constructor set no zoom bounds (`minCameraRatio`/`maxCameraRatio` both default `null`): the graph could be zoomed to nothing or panned off-screen. sigma v3 ships no node dragging, the WebGL path had no selection feedback (`selected` reached only the degraded relation list), there were no zoom controls, and every filter or walk switch rebuilt the whole renderer from scratch, discarding the user's camera.

## Decision

### The kg view joins the composer-overlay layout channel

`KgView`'s root now carries `data-conversation-composer-overlay` (the trajectory precedent): the skeleton bounds the viewArea (`flex: 1 1 0; min-height: 0; overflow: hidden`), the composer floats over the session column, and the view's `.page` becomes the page's one and only scroller. The page's bottom padding clears the floating composer via `calc(var(--dsh-composer-height, 152px) + 24px)` — the live seat height ConversationRoot publishes — so scrolled-to-bottom content (the legend, the details card) never hides under the input card. The planned fallback (a new `data-view-scrolls` attribute in ui-conversation) was not needed: live testing showed the composer floats over the reserved clearance, not over the canvas.

### Canvas geometry resolves against the real viewport, with a floor and a cap

`.canvasViewport` keeps `flex: 1` inside the now-bounded chain, gains `min-height: 380px` (short viewports — where the composer clearance plus hero/toolbar eat most of the flex fill — still get a usable canvas; the overflow rolls the page scroller) and `max-height: min(62vh, 100%)` (tall/narrow viewports cannot push the rest of the page under the composer). At ≤900px `.mainSplit` stacks vertically (the same cut the session-header kg button already uses), and the side zone drops its `min-width` so the canvas keeps a usable width.

### The renderer follows its container, not the window

A `ResizeObserver` on the canvas container calls `sigma.resize()` (disconnected on teardown). Sidebar drags resize the grid cell, the observer fires, sigma re-reads the box — no window event involved.

### One bounded, draggable, highlightable camera that survives rebuilds

Sigma construction now sets `minCameraRatio: 0.05`, `maxCameraRatio: 15`, and a `nodeReducer` fed from a mutable highlight ref: the selected node renders `highlighted` with `forceLabel`, direct neighbors render `highlighted`, everything else stays untouched. A selection change repaints through `refresh({ skipIndexation: true })` without rebuilding the renderer. Node dragging rides `downNode` → `moveBody` → `upStage`: a 4px threshold separates clicks from drags, a drag suppresses the trailing `clickNode`, and positions land through `viewportToGraph` + `setNodeAttribute` + refresh. On every teardown the camera state is snapshotted and reapplied to the successor instance, so filter and walk switches keep the user's zoom and pan. `visibleNodes`/`visibleEdges` are memoized so unrelated re-renders (typing in the search box) no longer rebuild the renderer at all.

### A three-button control cluster with a new minus glyph

The viewport's top-right corner hosts zoom in / zoom out / reset (`camera.animatedZoom` / `animatedUnzoom` / `animatedReset` — reset restores the fitted initial state), each an icon-only ghost button with `aria-label` and `title` from the locale keys `canvas.zoomIn` / `canvas.zoomOut` / `canvas.reset`. `IconMinusOutline16` joins ui-primitives (the plus glyph's horizontal bar alone) and the icon-set count assertion moved to 71.

## Alternatives considered

**`cameraPanBoundaries`.** Rejected for now: the FA2 layout's coordinate scale varies per walk, and a mismatched bound either pins the graph or over-restricts panning. The plan pre-authorized degrading to ratio bounds alone; reviving it means computing the bound from the walk's actual bounding box.

**A separate fit-graph button.** Rejected: sigma's initial camera state *is* the fitted view, so `animatedReset` covers both reset and fit; a fourth button would duplicate one behavior under two names.

**The `data-view-scrolls` fallback channel.** Not taken: reserved by the plan if the overlay attribute mispositioned the composer; live verification showed the trajectory-mode geometry applies cleanly to kg.

## Consequences

The renderer stack is unchanged (sigma/graphology/FA2, statically imported — the single-file bundle decision stands). The kg e2e lane now pins the geometry contract: wide-viewport canvas ≥ 500px, the 1280×800 floor case ≥ 360px, wheel over the canvas leaves both the page scroller and the session scrollBody at zero, wheel over the side panel scrolls only the page scroller, a sidebar drag shrinks the canvas bitmap (container resize without a window resize), 375px stacks the split with no horizontal overflow, and the control cluster clicks clean under the console-error tripwire. Unit tests assert the zoom-bound settings, the highlight reducer matrix, the drag threshold and click suppression, the observer lifecycle, the control-to-camera calls, and the camera hand-off across rebuilds. No golden snapshot references kg content, so none were re-recorded. Degraded (no-WebGL) environments keep the relation list; the control cluster is WebGL-path-only.
