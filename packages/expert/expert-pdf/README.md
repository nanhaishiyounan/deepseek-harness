# @deepseek-ai/dsh-expert-pdf

English | [中文](README.zh.md)

Pure-function Chinese-capable PDF layout for expert deliverables (`@deepseek-ai/dsh-expert-pdf`): `renderPdf(spec)` typesets one `DraftSpec` — cover page (title, client, expert byline, date, order number), body pages running each section (heading, wrapped CJK/latin paragraphs, reference lines), the closing disclaimer, and page chrome (order-number header, page-x-of-y footer on body pages) — into PDF bytes with a subset-embedded Noto Sans SC. No LLM, no filesystem writes, no plugin services: the drafting pipeline that owns those concerns lives in `@deepseek-ai/dsh-expert-orders`.

## Typography

- **Font**: bundled Noto Sans SC Regular (SIL OFL 1.1; see `resources/fonts/LICENSE`), subset-embedded at save time, so output size follows the glyphs actually used. `wrapCjkText` wraps by measured width: CJK code units break per character, latin word runs stay atomic, explicit newlines are hard breaks, and the wrapped lines join back to the input exactly (no dropped or replaced character).
- **Template**: cover fields from the spec; sections in the drafter's order; the standard disclaimer when the spec carries none (`DEFAULT_DISCLAIMER`), a caller-supplied line otherwise.

## Model Experience

Indirectly, through `@deepseek-ai/dsh-expert-orders`: the drafting model's strict-JSON output becomes the `DraftSpec` this library typesets. This package registers no prompt, schema, or tool of its own.

#### KV Cache effect

Independent of the model request stream: typesetting consumes an already-produced spec and emits bytes for a tool result, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- One typeface, one weight: emphasis is by size and color only; a bold companion face waits for a deliverable that needs it.
- Wrapping has no CJK line-breaking rules (no forbidden-line-start punctuation handling, no hanging punctuation) beyond the width budget.
- The full Noto Sans SC face ships in the package (~8 MB) to keep the glyph coverage complete; subsetting happens per document at save time.
