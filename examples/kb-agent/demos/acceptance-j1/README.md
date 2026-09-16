# J1 real-machine acceptance — composer mode selector（2026-09-16, :3080）

Server: `dsh web --patch examples/kb-agent/cordis.patch.yml` on `127.0.0.1:3080`,
host restarted onto the J2 source (version banner `9fff3bb`).

| Evidence | What it shows |
|---|---|
| `state1-initial.png` | The accessory band carries the mode capsule naming the running preset (企业数据助手); trigger hint is the in-place-switch copy while the session is still blank. |
| `state2-menu.png` | One click opens the full roster — 36 entries (30 scenarios + 2 roles + 4 shipped), each with its name and description. |
| `state3-started-session.png` | On a started session (俄罗斯的仓库被炸了怎么办) the selector stays mounted; the hero chip's window is long closed at this point. |
| `state4-pick-opens-new-session.png` | From that started session, picking AI 供应商开发专员 lands a new session (the host's agent-preset lock stands; the pick becomes a new session, not a swap). |
| `state5-current-session-header.png` | The new session's transcript answers a cross-domain SRM question — see `../acceptance-j2/q-scenario-cross-domain.png`. |

## Known edge (recorded in the J1 Agent Note)

When the New Session flow reuses a mirror row whose `blank` bit predates that
session's first turn (stale cold-probe mirror), the reused session refuses the
preset swap and the pick lands on the deployment default. The same chain is
green in the `agent-preset-selection` e2e lane (clean mirror) and succeeded in
production logs before (session `4fb792bc…` carries `agent-preset/selected`).
Root fix belongs in the workspaces reuse scan (validate blankness at reuse
time); tracked for the next round.
