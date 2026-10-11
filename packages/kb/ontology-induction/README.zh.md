# dsh-ontology-induction

[English](README.md) | 中文

LLM 本体归纳管线（自动生成为主路径）：语料分块 → OntoGPT 范式结构化输出提示 → 候选合并 → SHACL 语义闸门（带界限修复回环）→ 确定性 JSON-LD 序列化——模型只出 JSON，代码负责序列化 RDF。

B5 批次实跑证据见 `research/2026-10-09-w24-rebuild/b5-ontology/`。

## Model Experience

None，因为本纯函数库不注册任何插件、prompt、schema 或工具；语料归纳的一切模型侧效应由管线脚本承担。

#### KV Cache effect

独立于模型请求流：库函数从不进入请求，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- 孤岛 <100 目标未达（桥接后 375；语料侧 Concept/Dataset 单例节点没有业务表名可桥接）——下一步：carbon 源 crossSource v2 + WeKnora 实体通道。
- ETL 每次运行先清图以保证可复现；增量 watermark 入图暂缓。
- 行表与 customer 经 READ_ONLY postgres attach（DuckLake 目录被 web 进程持锁期间）；并入湖仓快照暂缓。
