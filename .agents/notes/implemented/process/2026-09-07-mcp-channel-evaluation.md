# Agent Note: MCP channel evaluation — the REST narrow tools stay primary

Status: implemented

English | [中文](2026-09-07-mcp-channel-evaluation.zh.md)

## Problem

PLAN decision B-6 split the agent's NocoBase consumption channel into two stages: V1–V4 built the narrow REST tools (nb_collections/nb_list/nb_get/nb_create/nb_update over the shared NocoBaseClient), and V6 must comparatively evaluate the official plugin-mcp-server streamable-HTTP channel (`/api/mcp`, six resource_* tools) and decide by evidence whether to switch the primary channel ([plans/nocobase-native-integration/03-batches.md](../../../../plans/nocobase-native-integration/03-batches.md) V6 §4).

## Decision

The REST narrow tools stay the primary channel; no switch. The live probe (examples/kb-agent/scripts/mcp-probe.mts against the in-repo NocoBase on :13000, 2026-09-07) confirmed the MCP endpoint active with resource_list/get/create/update/destroy/query and a slightly faster single call (31ms vs 65ms), but every product-frozen surface would need rebuilding above MCP: the write-confirmation semantics and persona routing live in the nb_* tool descriptions (02-design §2.2's confirmation ladder), error normalization would re-parse business failures out of result text, collection-enum suggestions would need schema injection, and the MCP client adds initialize/session/heartbeat state — the latency win does not pay for the protocol. plugin-mcp-server stays a re-evaluation option when multi-server MCP orchestration or resource_query's generic querying clearly beats the narrow face; the probe script is the rerunnable entry.

## Consequences

- The nb_* tools remain the single tuned surface for business reads/writes; persona and confirmation copy keep one home.
- The MCP endpoint stays enabled on the backend (zero cost), and any future re-evaluation reruns one script instead of rebuilding a client first.
- The evaluation evidence (latency table, tool list) lives in this note and the probe output, not in product code.

## Alternatives considered

- Switching the primary channel to MCP now: rejected — the confirmation-flow semantics and enum suggestions are frozen product surfaces that the generated resource_* descriptions do not carry.
- Disabling plugin-mcp-server on the backend: rejected — it is the standing re-evaluation probe target and costs nothing while idle.

## Evidence

- Probe output: REST 200/65ms; MCP six tools, resource_list ok/31ms (2026-09-07, live :13000 run).
- Source in-tree: platform/nocobase/packages/plugins/@nocobase/plugin-mcp-server (snapshot-shipped, instance-enabled).
