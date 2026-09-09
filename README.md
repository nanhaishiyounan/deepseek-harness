# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Developer preview

DeepSeek Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

### Local startup

The commands above cover the harness itself; the full example stack — the kb-agent composition (a food-industry knowledge-base agent) on the DSH Web workbench, plus a NocoBase business backend and local PostgreSQL — starts in three steps from the repository root.

| Component | Address | Role |
|---|---|---|
| DSH Web workbench (kb-agent composition) | http://127.0.0.1:3080 | Chat, knowledge base, data assets, connectors, graph, business pages |
| NocoBase business system (full UI) | http://127.0.0.1:13000 | Order source of truth and a standalone business admin: sign in to manage collections, the approval workflow, and system settings (initial admin admin@nocobase.com / admin123) |
| PostgreSQL 17 | localhost:5432 | NocoBase database, started idempotently by the setup script |

1. Install dependencies and put `MINIMAX_API_KEY` in the repository-root `.env` (shared by chat and embeddings; retrieval still works without a key):

```sh
pnpm install
```

2. Start NocoBase. The first run installs dependencies inside `platform/nocobase` (yarn, ~15 min), builds the full-UI client artifacts (~20 min once; the artifacts persist, so later starts are seconds), idempotently starts local PostgreSQL, initializes the five collections with seed data and the approval workflow, and writes `NOCOBASE_BASE_URL`/`NOCOBASE_API_KEY` into `.env`. `http://127.0.0.1:13000` is the complete business system: open it in a browser, sign in, and manage data, workflows, and settings — a second entry point alongside the DSH workbench (whose Business page embeds the same backend under "Advanced configuration"):

```sh
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts
```

For daily use, `start` boots the existing installation and `verify` re-checks it (asserts the full UI plus collections, seed, workflow, and the API key; `--env-file=.env` lets the API-key probe read the credential):

```sh
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts start
node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify
```

3. Start the DSH Web workbench:

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml
```

The command prints `dsh web: http://127.0.0.1:3080` and opens the browser; append `--no-open` (`dsh web --patch <file> --no-open`) to skip opening. Launcher flags such as `--patch` come before the web app's own flags — from the first argument the launcher does not know, everything passes verbatim to the web app. The workbench is unauthenticated — keep it on localhost. Server-side source changes (`packages/**/src`) take effect only after restarting this process; client artifacts are re-read per request.

Prerequisites, sample-data ingestion, scenario roles, and troubleshooting live in the full manual: [examples/kb-agent/QUICKSTART.zh.md](examples/kb-agent/QUICKSTART.zh.md) (Chinese).

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
