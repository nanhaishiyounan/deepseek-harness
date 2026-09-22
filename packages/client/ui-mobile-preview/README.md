# @deepseek-ai/dsh-client-ui-mobile-preview

English | [中文](README.zh.md)

The PC workbench's mobile-preview conversation view: a 390×844 phone bezel embedding the same-origin `/mobile` page in an iframe. The embedded client is fully interactive — switch to this view inside a PC session and complete a task-card flow without leaving the workbench (the demo path). The view-context projection is title-level by design: the iframe's internal state never enters the model-visible report.

- Registers the `mobile-preview` entry on the `conversation.view` slot (label 移动端预览) plus a two-key zh/en locale namespace.
- The bezel scales to fit the conversation body (`ResizeObserver`); pointer events pass through the transform, so the embedded page stays operable at any scale.
- Deployments serve `/mobile` through the web-app bundle's `mobileEnabled` config; without it the iframe shows the gateway's 404 body.

## Model Experience

None, as a browser-side UI plugin layer this view registers nothing model-facing beyond a title-level view-context projection that carries no iframe state.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The iframe reloads its full page on hash-deep-links driven from outside; no postMessage channel exists between the PC shell and the embedded client.
- Deployments without `mobileEnabled` render the gateway's 404 body inside the bezel; the view does not probe availability first.
