# kb-agent 私有化部署指南（单租户）

English | [中文](DEPLOY.zh.md)

This guide deploys one kb-agent tenant on a single Linux host with no new infrastructure: the Node process supervisor is systemd, the knowledge base is one SQLite file, and the only secret is the MiniMax API key.

## 1. Prerequisites

- Node.js 22.19+ (nvm is fine) and pnpm 9+.
- A MiniMax API key (`MINIMAX_API_KEY`) for chat (MiniMax-M3) and embeddings (`embo-01`). Without the key the deployment still runs in text-only degraded mode (`mode: 'text'` on every search) — decide whether that is acceptable before going live.
- A dedicated OS user (example: `dsh`) with a writable data directory (example: `/srv/kb-agent`).

## 2. Install and build

```sh
git clone <this-repo> /srv/kb-agent/app
cd /srv/kb-agent/app
pnpm install
pnpm run build
```

## 3. Configure

Create `/srv/kb-agent/.env` (owner-only permissions):

```sh
MINIMAX_API_KEY=sk-...
# Optional overrides:
# DSH_KB_TENANT=my-company        # tenant binding for tools/presets/workbench (default demo-food-co)
# MINIMAX_BASE_URL=https://api.minimaxi.com/v1
```

`DSH_KB_TENANT` is the single source of truth for the tenant: `cordis.patch.yml` reads it for `tool-kb`'s `tenant`, the preset rows, and the api-gateway's `kbTenant` (all three fall back to `demo-food-co` when unset). One deployment = one tenant; a second company gets a second deployment with its own data directory.

### Retrieval relevance threshold (optional)

The kb seam config accepts `minRelevanceScore` (default 0 — keep every hit), which drops hits whose fused RRF score falls below it in both hybrid and text-only modes, so garbage queries can resolve to the zero-result empty state instead of top-N noise. RRF scores are rank-damped reciprocals: single-path hits score at most `1/(rrfK+1)` (0.0164 with the default rrfK 60), dual-path hits at most `2/(rrfK+1)`. A threshold above `1/(rrfK+1)` (e.g. 0.017) keeps only dual-path hits — on the demo corpus it empties every garbage probe but also the ~28% of eval questions whose gold document rides the vector path alone (their full-text path matches nothing), so weigh noise rejection against single-path recall for your corpus before enabling it; thresholds at or below `1/(rrfK+1)` prune only deep-rank noise. Configure it on the `kb` row of `cordis.patch.yml` (`config: { minRelevanceScore: 0.017 }`); calibration data and method: `examples/kb-agent/scripts/calibrate-relevance.mts`.

## 4. Data directory, backup, and restore

The knowledge base is `examples/kb-agent/workspace/kb.sqlite` (WAL mode: also copy `-wal`/`-shm` while the process is stopped, or use the SQLite backup API while it runs). Sessions live under `$DSH_HOME` (set it to `/srv/kb-agent/.dsh` so nothing lands in the user's home).

```sh
# Cold backup (process stopped):
tar czf /srv/kb-agent/backups/kb-$(date +%F).tgz -C /srv/kb-agent/app/examples/kb-agent/workspace kb.sqlite*
# Restore: stop the service, untar over the workspace, start the service.
```

Back up the `.dsh` session root the same way if conversation history must survive.

## 5. systemd unit

`/etc/systemd/system/kb-agent.service`:

```ini
[Unit]
Description=kb-agent (food-industry knowledge base + agent)
After=network-online.target

[Service]
Type=simple
User=dsh
WorkingDirectory=/srv/kb-agent/app
Environment=DSH_HOME=/srv/kb-agent/.dsh
EnvironmentFile=/srv/kb-agent/.env
ExecStart=/srv/kb-agent/app/node_modules/.bin/tsx /srv/kb-agent/app/apps/cli/src/bin.ts --profile headless --patch examples/kb-agent/cordis.patch.yml "待命：等待任务输入"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

One-shot tasks (the headless profile takes the task from argv) map naturally to `systemd-run --unit=kb-task-…` or a timer unit; long-running surfaces (the web workbench, `dsh web` with the same patches) use the same unit shape with the web bin. Verify after `systemctl enable --now kb-agent`: `journalctl -u kb-agent -f` shows the fail-loud boot diagnostics.

### Nightly jobs (manufacturing chain, optional, W2-B7)

The approval engine's `--serve` mode can run the nightly chain in-process — ROP scan-reorder → MRP close → (month-end) the monthly ledger snapshot → KPI materialization, with the quarterly supplier scorecard recomputed idempotently on every day of a quarter-start month — instead of an external cron curling the four verbs. Off by default: without the env the server behaves exactly as before, and the manual curl routes stay forever.

```ini
# Append to the [Service] section (or three lines in the .env behind EnvironmentFile)
Environment=W1_NIGHTLY_ENABLED=true      # default false; strictly true/false, anything else fails at boot
Environment=W1_NIGHTLY_AT=02:30          # HH:MM, default 02:30; a malformed value fails at boot
Environment=W1_NIGHTLY_TZ=Asia/Shanghai  # default (matches the KPI Shanghai day boundary)
```

A failed leg logs and the next leg still runs (legs never block each other); `POST :13110/run-nightly` triggers one manual pass at any time (it never marks the day); the in-process marker dedupes per day, and a restart may replay the same day — every leg is idempotent. Pick one scheduler — the built-in timer or your cron curling the four verbs — never both. The macOS launchd/cron demo path lives in the QUICKSTART manufacturing-chain section.

## 6. Upgrades

Stop the service, `git fetch && git checkout <tag>`, `pnpm install && pnpm run build`, start the service. Schema ownership is fail-loud: a knowledge-base file written by a different schema version is rejected at boot with the on-disk version in the message — restore that backup rather than hand-editing the file.

With no backup to restore, rename the rejected file and let the next boot rebuild an empty database (then re-ingest the corpus):

```sh
mv examples/kb-agent/workspace/kb.sqlite examples/kb-agent/workspace/kb.sqlite.v1-backup
```

A v2 backup does not become loadable again by upgrading: the v3 build rejects it the same way (schema versions only move forward). To rebuild the corpus on v3, re-ingest from the source documents (`workspace/data/` through the ingest tooling), or restore a backup that the v3 build itself wrote. Rolling back means rolling both back together: check out the old tag **and** restore the old database file — a v3-written file under v2 code fails the same boot gate.

## 7. Security notes

- The gateway (`dsh web` / the api-gateway plugin) is **unauthenticated**: never expose it to a public network. The kb write methods (`kb.ingest`, `kb.ingestUrl`) ship read-only by default (`kbWriteEnabled` absent); this example's patch opts in because the deployment is single-tenant behind disk-level access control.
- `kb.ingest` reads whatever path it is handed: with writes enabled, an attacker who reaches the gateway can ingest any readable file on the host (an arbitrary-file-read chain into the corpus). Keep the gateway on localhost or behind an authenticating reverse proxy.
- The `.env` file and the SQLite file carry the tenant's corpus: disk-level access control (the dedicated user, owner-only permissions) is the boundary.
- `kb_ingest_url` refuses private-network addresses unless the composition opts in (`allowPrivateNetworks`, default false) — keep the default on internet-facing deployments.
- The composition disables the base bundle's shell/editor/web tool rows (see `cordis.patch.yml`): every agent in this deployment answers from the knowledge base alone. Re-enabling them is a deliberate composition change, review it as such.
