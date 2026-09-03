# Agent Note: kb-agent QUICKSTART role switching unified on the scenario portal

Status: implemented

English | [中文](2026-09-02-kb-quickstart-role-switch-portal-unification.zh.md)

## Problem

The QUICKSTART's role-switching section taught the web portal and the two `agent-presets` role presets as parallel entry points, with the copy-into-`$DSH_HOME/.agent-presets` recipe as the standing instruction for making a preset selectable. Three shipped facts had already moved past that account: the blank-session portal ([portal IA note](2026-09-01-kb-workbench-portal-ia.md)) is the first screen of every web session and offers the thirty scenario cards; `cordis.patch.yml` mounts both `examples/kb-agent/agent-presets` and `examples/kb-agent/scenarios` as user-trust preset roots, so every shipped preset is reachable from any `DSH_HOME` with no copy step ([preset reachability note](../bug-fix/2026-09-01-web-new-session-preset-reachability.md)); and the portal catalog mirrors the scenario library one-for-one under a drift gate ([sync-gates note](../testing/2026-09-02-kb-portal-scenario-sync-gates.md)). A reader following the copy recipe, or hunting the two role presets as the primary path, was working against the product's own first screen.

## Decision

The scenario portal is the QUICKSTART's primary path for switching roles: click one of the thirty cards, confirm in the role dialog (description plus probe question), start the session — the probe prefills the composer. The two `agent-presets` role presets (`enterprise-data-assistant`, `food-compliance-officer`) are documented as the click-through behind the portal's two same-named cards (`scenarios/enterprise-data`, `scenarios/food-compliance`), not as separate entry points; `enterprise-data-assistant` stays the new-session default. Copying into `$DSH_HOME/.agent-presets` appears only as the locally-authored-preset path, and the default role can be overridden in `$DSH_HOME/settings.yaml` with a roster preset id — a scenario card's id (for example `food-compliance`) works the same way. Command-line headless sessions stay on the base kb-agent role: presets, the scenario presets included, compose only in the web workbench.

## Alternatives considered

**Keep the two role presets as a parallel documented entry.** Rejected: the portal is the one entry that reaches every role from any `DSH_HOME` with zero copies, and the two same-named cards select the same roles through the real `agentPresets.select` round trip; a parallel path splits the documented journey from the product's first screen for no capability the cards lack.

**Keep teaching the copy recipe as the general preset instruction.** Rejected: the composed preset roots made copying unnecessary for every shipped preset; the writable root remains the correct instruction exactly for locally authored presets, which is the only place the section teaches it now.

## Consequences

The documented role-switching journey and the web first screen are one path, verified live on 2026-09-02 (Node 22.19.0): the 企业数据助手 card, the confirm dialog, the role named in the session header, and the prefilled probe (水电气 单耗). The section's coverage of the two role presets narrows to what the cards do not say on their face — the GB 2760/GB 14881 basis of the compliance officer and the five-category scope of the data assistant. Authors of locally authored presets keep a documented path through the writable root, and the `settings.yaml` default-role override accepts scenario ids, so the two card-backed roles remain selectable defaults without copying anything.
