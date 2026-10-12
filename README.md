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

The commands above cover the harness itself; the full example stack — the kb-agent composition (a food-industry knowledge agent) on the DSH Web workbench over its five LLM data sources (lakehouse, carbon business system, WeKnora knowledge base, ontology registry, Neo4j graph) — starts in three steps from the repository root.

| Component | Address | Role |
|---|---|---|
| DSH Web workbench (kb-agent composition) | http://127.0.0.1:3080 | Chat, knowledge base, lakehouse, connectors, graph, business, governance pages |
| carbon ERP dev stack | http://127.0.0.1:3000 | Business source of truth (ERP/MES/QMS); PostgREST Data API on :54321, PostgreSQL on :51538 |
| WeKnora sidecar | http://127.0.0.1:18080 (UI), :18081 (API) | Knowledge-base retrieval (RAG); corpus lives under `workspace/weknora/` |
| Neo4j 5.26 | http://127.0.0.1:7474, bolt :7687 | Graph store for kg queries and ontology materialization |
| Gravitino + SeaweedFS | http://127.0.0.1:8090, S3 :9000 (console :9001) | Catalog hub + object storage (lakehouse Tier1 iceberg) |

1. Install dependencies and put `MINIMAX_API_KEY` in the repository-root `.env` (chat and embeddings; retrieval still works without a key):

```sh
pnpm install
```

2. Start the five sidecars (each is idempotent; full commands, credentials, and health checks live in the manual):

```sh
colima start                                                        # docker runtime
(cd /Users/mac/Downloads/carbon-main && bash packages/dev/bin/crbn up --no-portless) # carbon dev stack (:3000, :54321, :51538)
bash workspace/weknora/up.sh up                                     # WeKnora (:18080/:18081, embed-proxy :18082)
docker start dsh-neo4j                                              # Neo4j (:7474/:7687)
(cd workspace/governance && docker compose up -d)                   # Gravitino (:8090) + SeaweedFS (:9000/:9001)
```

3. Start the DSH Web workbench:

```sh
env CARBON_URL=http://127.0.0.1:54321 CARBON_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODE4OTUsImV4cCI6MjEwNjk0MTg5NX0.42nhGia5GsXBtJiW9aP12HCVwOoBmqwiZ3QZ060OU5o CARBON_EMAIL=test@carbon.ms CARBON_PASSWORD=password \
  DSH_NEO4J_URL=neo4j://localhost:7687 DSH_NEO4J_USER=neo4j DSH_NEO4J_PASSWORD=neo4j-b5-graph \
  DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml
# carbon/Neo4j credentials ride the launching environment (DSH_* keys must not go in .env);
# without them cb_*/kg_* answer with structured refusals while kb/lakehouse/MiniMax work from .env
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
