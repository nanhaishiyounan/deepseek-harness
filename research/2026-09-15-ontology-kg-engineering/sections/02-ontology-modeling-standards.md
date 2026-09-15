# 02 · 本体建模标准对比：LinkML vs OWL/RDFS vs SHACL vs 自研 TS registry

> 对应调研问题 1。证据来源：LinkML 官方文档站全量细读、linkml-runtime.js 源码级克隆审计、W3C OWL2/SHACL 规范、zazuko/rdf-validate-shacl zip 源码审计、rdf-ext/shacl-engine npm 一手数据、K-CAP 2025 论文（转述级）、OBO Foundry FP-004。

## 2.1 四条路线总览

| 路线 | 一句话定位 | TS 栈契合度 | 本次证据强度 |
|---|---|---|---|
| LinkML | YAML 优先建模语言，一份 schema 生成 40+ 种工件（JSON Schema/OWL/SHACL/Pydantic/TS/SQL DDL…） | 中（编译期友好，运行时死寂） | Critical（官方文档 + 源码审计） |
| OWL/RDFS | W3C 本体推理标准，开放世界假设（OWA） | 低（推理机全 Java） | Critical |
| SHACL | W3C 闭世界约束校验标准 | 高（两个活跃 JS 实现） | Critical（源码级审计） |
| 自研 TS registry | 代码即 schema，类型系统即约束 | 最高（现状） | 内部事实 + 外部对照 |

## 2.2 LinkML 深度评估

### 2.2.1 schema 定义能力（官方文档实测）

slots（字段统一抽象）+ classes + types + enums 的组合可以表达（真实官方样例）：

```yaml
slots:
  gender:
    slot_uri: schema:gender
    range: GenderType            # enum 作 range
  has_medical_history:
    range: MedicalEvent          # class 作 range
    multivalued: true
    inlined_as_list: true
  age_in_years:
    range: integer
    minimum_value: 0
    maximum_value: 999
```

关键机制清单（对 31 类型/23 关系移植直接相关的部分加粗）：
- **`is_a` 继承 + `slot_usage` 上下文细化**（协变继承：子类缩窄父 slot 的 range——对应 23 种关系的多态约束）
- **`mixin` / `mixins:`** 非树形横切复用（如 HasAliases）
- `abstract: true` 禁止直接实例化
- `required` / `multivalued` / `cardinality`（UCL 记法 `0..1`）/ `pattern` / `minimum_value` / `maximum_value`
- **`inverse`**（声明逆 slot：`parent_of inverse child_of`）
- `ifabsent` 默认值（`int(42)`、`date("2020-01-31")`）
- **`designates_type: true`** 类型判别器——多态反序列化的关键
- `identifier: true` / `key` / `tree_root`
- 组合约束 `any_of/all_of/exactly_one_of/none_of` → JSON Schema 的 anyOf/allOf/oneOf/not

### 2.2.2 generators 全景（决定性发现）

文档站列出 40+ 个 generator。与本产品相关的核心四个：
1. **`gen-json-schema`**：输出标准 JSON Schema（`additionalProperties: false` 默认严格），继承 rolled-down，非 inlined 引用退化为 string（文档自认损失校验信息）——可喂 ajv。
2. **`gen-typescript`**：生成纯 TS interface/type 声明（官方原话："no effect on the resulting transpiled javascript code"——无运行时行为）。
3. `gen-shacl` / `gen-owl`：需要 RDF 互操作时随时可出。
4. `gen-sqltable`（SQL DDL）：SQLite 方言支持无专门承诺，需实测。

### 2.2.3 校验工具链

官方 6 种策略：`linkml-validator`（Python 包+CLI）、Python 对象实例化、**JSON Schema + 外部校验器**、SPARQL 约束、ShEx/SHACL、SQL 加载查询。API 形如 `validate(instance, "personinfo.yaml", "Person")`，可组合插件（JsonschemaValidationPlugin(closed=True) 等）。官方明言 "not all LinkML constructs expressible in JSON Schema"——弱项需 Pydantic/SHACL 补。**[Critical] 官方文档背书「LinkML → JSON Schema → ajv」组合，但社区无端到端教程；落地建议 CI 里 gen 后立即 ajv compile 冒烟锁 draft 兼容性。**

### 2.2.4 JS/TS runtime：负面决定性发现（源码审计）

npm 包 `linkml-runtime`（仓库 linkml/linkml-runtime.js）实测数据：
- 3 个版本（0.1.1/0.1.2/0.2.0），**最后发布 2022-09-01（4 年前）**，周下载 5 次、月下载 32 次
- 全仓库有效逻辑仅 4 个文件约 1000 行：SchemaView.ts（752 行）、Namespaces.ts（159）、Walker.ts（95）；MetaModel.ts 4351 行是生成的纯 interface（编译后 JS 为空）
- README 自述 "Status: EXPERIMENTAL"；SchemaView 自述 "HIGHLY INCOMPLETE"
- **无任何校验能力**：源码中不存在 validator/JSON Schema 生成/数据实例校验；Walker.walk() 只在 strict 模式对「数组出现在非 multivalued 上下文」抛错
- 已知缺陷：`_index()` 空壳 TODO 导致 imports 场景 getEnum 查不到；slotRange() enum 分支疑似笔误
- ESM：无——package.json 无 "type" 字段（CommonJS），无 exports/module 字段

**结论：linkml-runtime.js 在「LinkML → JSON Schema → ajv」链路里没有任何位置；它只解决「TS 里读 LinkML schema 做元编程」的小众需求，且质量不足以生产使用。** 可抄资产：`inducedSlot`/`mergeSlot`（~50 行 slot 继承推导语义）、`bin/gen-linkml.js`（50 行 schema 物化 CLI 模板）、官方测试夹具 kitchen_sink.yaml。

### 2.2.5 版本化实践（官方 manage-releases 指南）

- schema 顶层元数据字段：`id` / `version` / `license` / `prefixes` / `imports`
- SemVer：Major=破坏性 / Minor=兼容新增 / Patch=修复；LinkML Project Copier 模板建仓（src/schema/*.yaml + Makefile + GH Action）；版本号由 uv-dynamic-versioning 从 Git tag 推导
- **关键坑（官方原话）**："the standard release mechanism does not handle package repositories for other languages, you will need to manage this part yourself"——TS 侧 npm 分发要自建 CI
- CIKM 2025 石化行业案例：1200+ class 本体 + 自研工具链（LinkML → graph DB schema/ER 图/文档/typed domain model code），证明 LinkML 管工业级大型本体，但其代码生成产物疑为 Python（论文全文被墙未确认）

### 2.2.6 linkml-map（映射层评估）

声明式模型间映射框架：TransformationSpecification（YAML）+ `populated_from`（class/slot 级映射）+ `expr`（Python 子集表达式，需 --unrestricted-eval）+ `inverse_of` + copy_directives + 可逆映射（表达式可逆时）+ 实验性 DuckDB SQL 编译后端。真实样例：

```yaml
class_derivations:
  Agent:
    is_a: Entity
    populated_from: Person
    slot_derivations:
      label: { populated_from: name }
      age:  { expr: "str({age_in_years}) + ' years'" }
```

**风险自认**："transformation data model is not yet fully stable"；expr 是 Python 语义（有 NULL/None/'NULL' 三义性 FIXME）。定位：若映射执行可离线（ETL 导入）可用 Python 子进程跑；若需 TS 运行时映射，只借鉴其 YAML 规范语义（populated_from/expr/inverse_of 语义简单可复刻）不引其运行时。

## 2.3 OWL/RDFS 路线

### 2.3.1 表达能力与推理生态

- 表达力：类层级、属性限制（someValuesAll/cardinality）、subclass/subproperty 传递推理——**开放世界假设（OWA）下的推理**
- 推理机生态：HermiT（唯一全 OWL 2 DL 一致实现，Java）、ELK（OWL 2 EL profile，Java）、Pellet（Java，AGPL）；Python Owlready2 也是打包的 Java 进程。**主流 OWL DL 推理机全部 Java，TS/JS 无成熟实现** [Critical]
- JS 侧可用替代（RDFS/规则级）：eyeling（纯 JS N3 reasoner，npm 可装，RDF-JS 互操作，TS 声明基于 @rdfjs/types）、eyereasoner（EYE 的 WASM 移植）、rdfjs-inference-engine（小型 TS 库，ingest 时物化）、OntoLogos（Rust+WASM）。**对「传递类层级闭包」需求，N3 规则物化即可覆盖；OWL DL 级推理在 TS 内无解**

### 2.3.2 OWA 工程陷阱（经典案例）

「每个 Order 必须有 Customer」——载入无 customer 的 order，OWL reasoner 说一切正常：**OWA 下缺失 ≠ 违规，minCardinality 不产生校验错误**。「必须有」类校验必须交给 SHACL（CWA）。另两条教训：OWL inconsistency ≠ SHACL violation（两个范式）；大数据上全 OWL DL 推理不可行，要 profile + 物化。

### 2.3.3 Protege 生态

桌面版是 Java 应用但自带 JRE 安装包（团队无需 Java 编码技能，只是装个桌面软件）；导出格式覆盖 Turtle/RDF-XML/OWL-XML/Manchester/JSON-LD——工程链路（n3.js/rdf-ext/jsonld.js 直接读）完全打通。WebProtégé 为 Web 协作版。对本产品：本体规模小（31 类型），Protege 的编辑 UI 价值有限，但其版本化惯例可借鉴（见 §2.6）。

## 2.4 SHACL 路线

### 2.4.1 规范能力

SHACL Core 28 个约束组件全清单（W3C 规范 §4）：值类型（class/datatype/nodeKind）、基数（minCount/maxCount）、值域（min/max Exclusive/Inclusive）、字符串（minLength/maxLength/pattern）、属性对（equals/disjoint/lessThan/lessThanOrEquals）、逻辑（not/and/or/xone）、形状级（node/property/qualifiedValueShape+计数）、其他（closed+ignoredProperties/in/languageIn/uniqueLang/hasValue）。

目标选择器：sh:targetNode/targetClass/targetObjectsOf/targetSubjectsOf——校验入口完全数据驱动。

**ValidationReport（§3.6）是「质量报告」的现成标准格式**：`sh:conforms` 布尔 + `sh:result` 列表，每条含 focusNode/resultPath/value/sourceShape/sourceConstraintComponent/resultMessage/resultSeverity（Info/Warning/Violation 三级）——可直接序列化存 SQLite 或喂 LLM。

### 2.4.2 TS/JS 实现横评（两个候选均有源码级证据）

**rdf-validate-shacl（zazuko）**——本次 zip 源码审计结论：
- MIT；0.6.5（2025-05-30 发布），master 最新提交 2025-10-28；TypeScript 源码 1851 行，纯 ESM（"type": "module"）
- **SHACL Core 28/28 全覆盖**（validators.ts 导出 28 个 validator，源码级核对）；SHACL-SPARQL 不支持（README Limitations 明示）
- 补偿机制：①自定义约束扩展点 `constraintValidators`（node/property/generic 三型）②property path 全 6 种语法 ③target 全 5 种 + sh:class 子类推理 ④OWL imports 支持
- 测试基础 = W3C 官方 data-shapes 套件（113 个 core 用例仅 skip 2 个，系规范自身争议）；CI 含 Bencher 持续性能基准（性能回归纳入评审）；自带 sh-sh.ttl 可自检 shapes 文件
- 性能证据：仓库基准负载 8.1MB / 61,329 三元组（欧盟 MARS 农产品数据）——10 万节点分批校验在量级内
- 复用陷阱：同一实例多次 validate() 时 violationsCount 不重置，配 maxErrors 会跨调用累计——分批复用实例时勿设 maxErrors；maxNodeChecks 默认 50（防循环引用栈溢出）
- 依赖树 11 个全部 RDFJS 官方小栈（不依赖 rdf-ext 本体/n3/SPARQL 引擎）

**shacl-engine（rdf-ext）**：
- MIT；1.1.2（2026-06-30 发布，维护更活跃）；**覆盖超过前者：SHACL Core + SHACL-SPARQL 约束 + SPARQL-based Targets**；代价是拉入 Comunica SPARQL 引擎
- 性能声称 15-26x 快（shacl-shacl 自检 15x、真实数据 26x）——**作者自测博客基准，无第三方复核 [Important]**；59 stars vs rdf-validate-shacl 540 使用者，性能与生态惯性未收敛

**选型**：数据校验只需 SHACL Core（JSON 字段级验证正是 minCount/datatype/pattern/range/in 主场）→ rdf-validate-shacl（依赖面小、可自写 validator、Core 全覆盖、W3C 套件背书）；需要 SPARQL 表达的跨节点规则或吞吐硬指标 → shacl-engine。二者 DatasetCore 接口同构，可先上前者后平替。**[Critical]**

### 2.4.3 JSON 数据进 SHACL 的最小路径（审计产出）

不必上 JSON-LD 全家桶——手工构 Dataset 更可控（十几行映射代码）：

```ts
import rdf from '@zazuko/env-node'
import SHACLValidator from 'rdf-validate-shacl'

const shapes = await rdf.dataset().import(rdf.fromFile('shapes.ttl'))
const validator = new SHACLValidator(shapes)   // shapes 复用；勿设 maxErrors

function toQuads(f, row) {  // sqlite JSON 节点 → RDF quads，字段→谓词映射可控
  const id = f.namedNode(`https://example.org/kg/company/${row.id}`)
  return [
    f.quad(id, f.namedNode(RDF+'type'), f.namedNode(`${ONT}${row.type}`)),
    f.quad(id, f.namedNode(`${ONT}name`), f.literal(String(row.name))),
    f.quad(id, f.namedNode(`${ONT}founded`), f.literal(String(row.founded), f.namedNode(XSD+'integer'))),
  ]
}
for await (const rows of readBatch(db, 1000)) {   // 10 万节点按 1000/批
  const dataset = rdf.dataset()
  for (const row of rows) dataset.addAll(toQuads(rdf, row))
  const report = await validator.validate(dataset)
  if (!report.conforms) for (const r of report.results)
    console.log(r.focusNode?.value, r.path?.value, r.sourceConstraintComponent?.value, r.message.map(m=>m.value))
}
```

### 2.4.4 K-CAP 2025 论文教训（OWL+SHACL 协同开发）

UPM 本体工程组，铁路运输领域真实案例（论文全文被 Cloudflare 拦截，核心教训经 dblp + 两条独立引用转述 [Important]）：方法论 = OWL 领域建模 + SKOS 术语 + SHACL 校验跟随；分工原则 = **「是否需要本体推理 vs 是否需要数据校验」决定约束放哪边**；生产中 OWL 本体版本与 SHACL shapes 版本必须协同演进（版本漂移 = 校验失效）。

## 2.5 自研 TS registry 路线（现状升级）

既有优势：代码即 schema（31 类型+23 关系已是 TS 类型）、零跨语言边界、与 sqlite 存储层同进程。短板与升级方向（对照标准路线得出）：
1. 约束表达不足（类型系统管不住运行时数据）→ 补 JSON Schema 派生 + ajv 校验
2. 无版本化机制 → 补 semver + schema_version 表 + 不可变迁移脚本（§5.4）
3. 无标准校验报告 → 采用 SHACL ValidationReport 结构作为质量报告格式
4. 无跨系统互操作 → 可选：LinkML 镜像（编译期生成，不进运行时）

## 2.6 版本化惯例对照

| 惯例 | 内容 | 来源 |
|---|---|---|
| OBO FP-004 | 每 release 唯一 versionIRI 且永久可解析；**已发布制品不可变**（bug 只能发新版）；版本号 ISO-8601 日期优先或 semver | obofoundry.org/principles/fp-004-versioning.html |
| OBO 术语管理 | term IRI **永不删除**，只 deprecated 并保留逻辑链接 | Cell Ontology 实践 |
| LinkML | semver（Major=breaking/Minor=兼容新增/Patch=修复）+ 版本从 git tag 推导 + release notes 替代 CHANGELOG | linkml.io manage-releases |
| OWL | owl:versionInfo（注释性）+ owl:versionIRI（规范引用）+ owl:backwardCompatibleWith | W3C OWL wiki |
| db migrations（类比） | version 表记录已应用版本；迁移文件不可变、只增不改 | 工程惯例 |

**统一建议**：本体 YAML/TS registry 与迁移脚本同 PR 提交；release 不可变；diff 用文本 diff（本体即文本文件 + Git 管理是主流实践）。

## 2.7 四路线决策矩阵与结论

| 维度 | LinkML | OWL/RDFS | SHACL | 自研 TS registry |
|---|---|---|---|---|
| schema 表达力 | 强（slot/继承/mixin/组合约束） | 最强（推理级） | 中（校验导向） | 强（TS 类型 + 自由元数据） |
| 约束表达 | 中（JSON Schema 有损映射） | OWA 下不能做「必须有」 | **最强（CWA 28 组件）** | 自定义（zod/JSON Schema） |
| 版本化 | 官方 semver 指南 | OBO/OWL 惯例成熟 | 随本体 | 需自建（= 空白） |
| 校验工具链（TS 内） | gen-json-schema → ajv（两跳） | 无推理机 | **rdf-validate-shacl / shacl-engine 直接可用** | ajv 直接用 |
| TS 运行时 | linkml-runtime 死寂 | 无 | 有（两个实现） | 原生 |
| 学习/维护成本 | 中（YAML+Python 工具链） | 高（语义网概念栈） | 中（RDF 转换层） | **零（已拥有）** |
| 锁死风险 | 中（Python 生态绑定） | 高 | 低 | 低 |

**最终立场**：
1. **主路线：升级自研 TS registry**——加三样东西：派生 JSON Schema（ajv 运行时校验）、semver+迁移机制、SHACL 风格质量报告。
2. **辅助路线：rdf-validate-shacl 做标准校验与质量报告**（当质量报告要作为数据资产给客户/审计/LLM 消费时，ValidationReport 是现成标准格式）。
3. **可选路线：LinkML 作互操作镜像**（schema 单一事实源仍在 TS registry；若未来需要与生医/工业本体生态交换或要用其 40+ generators，再以编译期生成方式引入，不进运行时）。
4. **明确不走：OWL DL 推理**（无 TS 实现，Java 依赖违反硬约束；RDFS 级传递闭包用 N3 规则物化或自写 20 行 TS 可覆盖）。
