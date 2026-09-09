# @deepseek-ai/dsh-connector-file

English | [中文](README.zh.md)

File-set connector provider: one local directory of data files exposed as `file`-kind connector datasets on `ctx.connector`. Discovery lists the router-admitted extensions flat (no recursion); fetch reads one file's bytes with a traversal-proof id check. Classification stays with the seam — the provider hands over raw bytes and the shared data router decides kb or lakehouse at transfer time, so a drop-in directory routes exactly like a workbench upload.

## Behavior

- **Load-time validation** — the root must exist and be readable; a missing root fails composition load (misconfiguration fails loud at the earliest point), so `available()` is a constant `true` with no I/O.
- **`discover`** — lists files whose extensions the data router admits (`.csv` `.xlsx` `.json` `.md` `.txt` `.pdf` `.docx`), skipping directories and everything else; matches the request's query against file names case-insensitively and honors kind restrictions (every dataset here is `file` kind). Each summary carries the file's mtime as `updatedAt`.
- **`fetch`** — the dataset id must be one plain file name (anything carrying separators refuses before any filesystem work); a missing file or directory refuses `CONNECTOR_DATASET_MISSING`, an over-cap file refuses `CONNECTOR_FILE_TOO_LARGE`.

## Configuration (schemastery)

- `root: string` (required) — the file-set directory, resolved against the process cwd when relative.
- `maxFileBytes?: number` — per-file fetch cap in bytes (default `10485760`, 10 MiB); oversized files refuse instead of loading unbounded bytes.

## Model Experience

Indirectly, through the tool consumer `dsh-tool-connector`: this provider registers no prompt, schema, or tool of its own, so every model-facing projection of the discovered file datasets belongs to that package.

#### KV Cache effect

Independent of the model request stream: directory scans and file reads produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- The scan is flat and single-level by design (a drop-in directory); recursive trees and glob patterns wait for a real drop-in shape that needs them.
- File listings re-scan the directory per discover call; a cached index waits for a directory whose listing cost actually matters.
- `.pdf`/`.docx` files are discoverable and fetchable, but the seam's transfer path refuses their kb landing today (extraction belongs to the gateway upload channel) — the refusal names the supported transfer set.
