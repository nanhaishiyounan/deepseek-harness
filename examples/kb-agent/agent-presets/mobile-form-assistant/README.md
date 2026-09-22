# Mobile Form Assistant (mobile-form-assistant)

English | [中文](README.zh.md)

The M3 mobile client's AI form-filling employee: extracts business-record fields from a conversational description, asks for missing slots, emits one fenced-JSON draft the mobile task card parses into an editable form, and calls `nb_create` only after the user's explicit push confirmation.

- `preset.yml` — the preset name and description (the roster discovery entry).
- `agent.cordis.yml` — the agent-plane composition: a persona plus the NocoBase tool row. No retrieval or destructive tools — this employee only registers business records.
- The write contract rides the persona: preview (the JSON draft) → user go-ahead (`确认推送` with the final fields) → `nb_create` → the fixed receipt `业务表 <collection> 行 id=<n> 已创建`; a rejection (`驳回`) discards the draft with no write.

The mobile workbench's 智能表单 entries create preset-bound sessions; the PC workbench can open the same sessions and watch the identical transcript (one sessions store). See [`QUICKSTART.zh.md`](../../QUICKSTART.zh.md) for the mobile-entry demo flow.
