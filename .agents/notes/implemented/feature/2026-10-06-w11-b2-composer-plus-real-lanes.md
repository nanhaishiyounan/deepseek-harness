# Agent Note: W11-B2 — the composer's + panel became real lanes (describe/extract RPCs, the voice three-state contract, X20)

Status: implemented

English | [中文](2026-10-06-w11-b2-composer-plus-real-lanes.zh.md)

Companion note: the composer capsule's 46px wrapper-box contract lives in [2026-10-05-w11-b1-composer-capsule-contract.md](2026-10-05-w11-b1-composer-capsule-contract.md); this note covers the B2 lanes that landed on top of it.

## Problem

The + panel's three tool entries were placeholder toasts. Turning them real needed an attachment→session injection seam, and the repo offered two: the wire layer already carries a multimodal `promptContentPartSchema` (image parts with base64), but the kb-agent composition defaults to MiniMax-M3 through `llm-minimax`, whose serializer hard-throws `UNSUPPORTED_CONTENT` on image content — a T2 (multimodal message body) send would be rejected by the model layer on arrival. The voice lane had a different shape: the WeChat webview (the product's main battlefield) never exposes `SpeechRecognition`, desktop Safari/Chrome do under HTTPS, and plain HTTP fails the secure-context gate — one tile cannot have one face.

## Decision

- **T1 (quote block) is the MVP injection seam; T2 stays deferred with its path proven.** Two minimal apiproxy RPCs, `data.describeImage` (admit one image through the shared attachment admission — same 20MB/64M-pixel/2048px normalization as `session.prompt` image parts — then describe it through the deployment's configured VLM endpoint, returning the durable `attachmentId`) and `data.extractText` (pdf/md/txt text layer, 6000-code-point wire bound, reusing `dsh-tool-kb`'s `extractPdfText` so the repo keeps one extraction implementation; nothing is stored). The mobile composer splices the returned description/text into the draft as a visible, deletable quote block; `send(text)` keeps its plain-text contract and the W9 identity link stays untouched. Enabling T2 later is pure increment: the wire schema, the `admitEncodedImages` durable pipeline, and the frontend's `DraftAttachment` row are all in place — the missing piece is a composed provider/model that accepts image content.
- **The voice lane is a three-state contract, cheapest refusal first** ([useVoiceInput.ts](../../../../packages/client/ui-mobile/src/client/messages/chat/useVoiceInput.ts)): `window.isSecureContext === false` or a missing constructor lands `no` (the panel renders three tiles, no voice — the WeChat webview and HTTP deployments), a throwing constructor lands `broken` (tile rendered inert with a hint toast), and a mid-session `onerror` (`not-allowed`, `service-not-allowed`, `audio-capture`, `network`) degrades to a human toast and unwinds the listening card — never a stuck card. Recognition text leaves only through the callbacks; the hook never touches the draft store.
- **X20 (consecutive tool rows fold the flow gap):** `.toolRow + .toolRow { margin-top: -5px }` folds the message flow's 10px gap into one status group, pinned by `composer-skin.client.spec.ts`.
- **antd-mobile TextArea puts `aria-label` on the wrapper, not the element** — live probe: `.adm-text-area[aria-label="消息输入"]` matches, `textarea[aria-label]` does not. The native `<textarea>` carries no accessible name of its own; probes and a11y anchors must target the wrapper (or use the placeholder).

## Consequences

- A model turn answers from an attachment's content only through the quote block the user can see and delete before sending — the whole citation is user-visible by construction, and a failed extraction surfaces on the chip (`data-extract-failed` → the scan-hint sentence) instead of silently shipping nothing.
- The voice detect verdict is a prop (`voiceSupported: 'yes' | 'no' | 'broken'`) the panel consumes; jsdom specs pin the hidden-tile branch and the three picker lanes, and the real-device checklist ([w11-b3-voice-realdevice.md](../../../../demos/acceptance-w11/w11-b3-voice-realdevice.md)) owns the on-hardware verdicts (OQ-2, user-fill).
- In-WeChat expectation: the tool grid shows three tiles with no voice tile — that absence is the contract working, not a regression.
- Office files (docx/xlsx), the WeChat JS-SDK mic lane, on-device ASR (sherpa-onnx), and multimodal T2 ride the W12 pool (deferral recorded in [demos/acceptance-w11/INDEX.md](../../../../demos/acceptance-w11/INDEX.md)).

## Alternatives considered

- Frontend pdfjs-dist extraction — flipped to the server side during implementation: the repo's `dsh-tool-kb` already owns `extractPdfText` (unpdf, lazy), and a frontend pdfjs would add a ~1MB bundle, a vite worker config, and a client-bundle-purity gate surface for zero new capability.
- T2 (sending the image as a wire content part) as the MVP — the wire schema and the durable admission pipeline are real, but `llm-minimax`'s serializer throws `UNSUPPORTED_CONTENT` on image content and DeepSeek has no vision model, so the send would be rejected at the model layer; T1 delivers the user value today and T2 remains pure increment.
- The cloud-ASR lane (MediaRecorder → cloud speech) as the voice fallback — the MiniMax CLI exposes no ASR command and the platform's ASR model is unverified; the Web Speech lane with its three-state contract covers the degradation honestly instead.
- Rendering the `no` voice state as a grayed tile instead of hiding it — in the WeChat webview the tile can never run, so a permanently dead tile would advertise a feature the page cannot deliver; three live tiles is the honest grid.
