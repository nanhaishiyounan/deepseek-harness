# 第 5 章 SHACL 约束校验闭环（硬性要求 3）

## 5.1 SHACL 核心机制（W3C Rec 2017-07-20）

SHACL 是「shapes 图 + data 图 → 校验报告」的数据校验语言（与 OWL 的推理职责互补：SHACL 闭合世界校验、OWL 开放世界推理）。NodeShape 通过 `sh:targetClass` 圈定 focus nodes，`sh:property` 挂 PropertyShape（`sh:path` 定位值）。核心约束组件：值类型（sh:class/datatype/nodeKind）、基数（sh:minCount/maxCount）、字符串（sh:pattern/minLength）、`sh:in`（枚举）、`sh:closed`+`sh:ignoredProperties`（禁止未声明谓词）、逻辑（not/and/or/xone）。

规范 §1.4 示例原文（节选）：

```turtle
ex:PersonShape
    a sh:NodeShape ;
    sh:targetClass ex:Person ;
    sh:property [
        sh:path ex:ssn ;
        sh:maxCount 1 ;
        sh:datatype xsd:string ;
        sh:pattern "^\\d{3}-\\d{2}-\\d{4}$" ;
    ] ;
    sh:closed true ;
    sh:ignoredProperties ( rdf:type ) .
```

报告结构（§3.6）：`sh:conforms` + 每条 `sh:ValidationResult` 含 `sh:resultSeverity`（Violation/Warning/Info）、`sh:focusNode`、`sh:resultPath`、`sh:value`、`sh:resultMessage`、`sh:sourceConstraintComponent`——**这套「错误定位四元组」天然适合格式化后回灌 LLM**。SHACL-AF 扩展：SPARQL 约束（sh:sparql）、SHACL Rules（三元组推理规则）、custom targets、functions。

## 5.2 两个 TS 实现对比（关键：TS 侧无需 Python）

| 维度 | shacl-engine (rdf-ext) | rdf-validate-shacl (zazuko) |
|---|---|---|
| 版本/许可 | **v1.1.2**（侦察所得 0.1.3 已过时）/ MIT | v0.6.5 / MIT |
| 周下载 / 活跃度 | 11,610 / 2026-09-14 仍提交 | 23,060 / npm 一年未发版（v1 在路上） |
| Core 覆盖 | 全部 Core（含 sh:class/in/closed） | 全部 Core（不支持 SHACL-SPARQL） |
| SHACL-AF | SPARQL 约束+Targets ✅（可选插件 shacl-engine/sparql.js）；AF rules 计划中 | ❌（支持 DASH 组件包+自定义 validator） |
| API | `new Validator(shapesDataset,{factory,coverage,details,trace})` → `await validator.validate({dataset, terms})` → report.conforms；**terms 参数支持只验新增候选** | `new SHACLValidator(shapes)` → `validate(data)` → report.results[] 对象化遍历（message/path/focusNode 直接可读） |
| 特色 | **coverage（返回 shape 命中的三元组子图）**、编译缓存 | maxErrors 早停 |
| 性能 | **40ms**（作者基准 100 次均值） | 632ms（同基准）；pySHACL 643ms 对照 |

性能结论：我们千节点/千边规模（≈数千三元组）下两个库都是几十 ms~亚秒级，**性能不是约束**。**选型：shacl-engine**（活跃度+coverage+SPARQL 可扩展性）；唯一让位条件是「零 RDF 依赖进 harness 核心」——此时用 5.5 的自研最小校验器。

## 5.3 registry v4 → SHACL shapes 生成器（TS 伪代码）

关键映射决策：registry 的 Class 直接生成 **closed NodeShape**（registry 本来就是闭包 schema，closed 语义完全对齐）；Relation 的 (domain, range, cardinality) 一比一映射 sh:property+sh:path+sh:class+minCount/maxCount；Enum → sh:in。

```ts
function registryToShapes(reg: OntologyRegistry, f: DataFactory): DatasetCore {
  const ds = dataset(); const SH = namespace('http://www.w3.org/ns/shacl#');
  const propShape = (p: PropDef) => {
    const s = f.blankNode();
    ds.add([s, SH('path'), f.namedNode(reg.iri(p.id))]);
    if (p.range.kind === 'class')  ds.add([s, SH('class'),  f.namedNode(reg.iri(p.range.id))]);
    if (p.range.kind === 'enum')   ds.add([s, SH('in'),     rdfList(p.range.members.map(xsdLiteral))]);
    if (p.range.kind === 'string') ds.add([s, SH('datatype'), xsd('string')]);
    if (p.range.kind === 'number') ds.add([s, SH('datatype'), xsd(p.range.int ? 'integer' : 'decimal')]);
    if (p.min)  ds.add([s, SH('minCount'), f.literal(p.min)]);
    if (p.max)  ds.add([s, SH('maxCount'), f.literal(p.max)]);
    if (p.pattern) ds.add([s, SH('pattern'), f.literal(p.pattern)]);
    return s;
  };
  for (const c of reg.classes) {
    const shape = f.blankNode();
    ds.add([shape, f.namedNode('rdf:type'), SH('NodeShape')]);
    ds.add([shape, SH('targetClass'), f.namedNode(reg.iri(c.id))]);
    for (const p of reg.propertiesOf(c.id)) ds.add([shape, SH('property'), propShape(p)]);
    if (c.closed) {
      ds.add([shape, SH('closed'), f.literal('true', xsd('boolean'))]);
      ds.add([shape, SH('ignoredProperties'), rdfList([f.namedNode('rdf:type')])]);
    }
  }
  return ds;
}
```

shapes 从哪来的业界答案：owl2shacl/Astrea 等 OWL→SHACL 生成器是「升维」（OWL 开放世界→SHACL 闭合世界，只覆盖简单本体）；**registry v4 是强类型闭包 schema，生成 shapes 是降维，完全可行**。

## 5.4 校验闭环架构（接入 kg-build extract 后置钩子）

```
LLM 抽取（按 registry prompt，Instruct-KGC JSON 协议）
  → 候选实体/关系（内存对象）
  → [gate] candidatesToRDF()（IRI/字面量 → RDF/JS Dataset，~50 行）
  → [gate] validator.validate({ dataset, terms: 本批候选 IRI })   ← shacl-engine 支持只验新增
  → conforms? ──是→ 落库 SQLite
       │否
       ↓
  ValidationReport → FeedbackFormatter → 回灌 prompt 重试（上限 3 轮；2 轮无改善即隔离）
  → 仍失败 → 隔离区（人工/后续处理），绝不部分落库
```

钩子实现为独立 capability（校验器注册为 provider，request/spec 分离对齐 dsh-shell 模板）；shapes 图在 registry 变更时重编译缓存（Validator 构造一次复用）。

**回灌格式的实证依据（kg-correction-loop，180 受控错误）**：SHACL 检出 150/180 ≫ LLM grounding 120 ≫ OWL HermiT 60（互补非互替）；修复 ≤5 轮可移除 166/180，但**最终可用图仅 117/180，附带损伤 99 例**；关键 A/B 实验：回灌只给"判决/位置"→ 修复率 **0/30**；给"点名违反了哪两个不相交类"的解释性反馈 → **19/30**（Holm 校正 p=1.14e-5）。结论：**ValidationResult→prompt 必须带解释句，且明确"仅重出被点名条目，禁止改动未点名条目"（防附带损伤）**：

```
你上一轮抽取的以下候选未通过本体校验，请修正后重新输出（仅重出被点名的条目，禁止改动未点名条目）：
1. 实体 <订单#123> 的属性 status 值 "已完成X"：
   违反：status 必须是枚举 [pending, paid, shipped, done] 之一（EnumConstraintComponent）
2. 关系 supplier→"SKU-9"：
   违反：值必须是 Product 类的实例（ClassConstraintComponent）；候选类型不在本体 Class 清单中
```

shacl-engine 的 coverage 输出可附加"该 shape 实际命中的三元组"，进一步帮助模型对齐上下文。

## 5.5 自研最小 shapes 校验器（<200 行）——零 RDF 依赖备选

仅当不想把 RDF 栈（@rdfjs/data-model + dataset + n3）拉进 dsh 依赖树时执行。直接跑在内存候选对象上，镜像 SHACL 报告词汇（对齐 5.4 格式化器，未来可无缝换 shacl-engine）：

1. shapes IR：`{ targetClass, closed, ignored, props: [{path, class?, in?, datatype?, nodeKind?, minCount?, maxCount?, pattern?}] }`（由 5.3 映射直接产出，跳过 RDF 序列化）；
2. target 解析：仅 sh:targetClass（按候选 type 分桶）；
3. 组件函数 6 个（各 10-20 行）：class / in / datatype-nodeKind 四分 / minCount-maxCount / pattern / closed（谓词白名单）；
4. 报告：`{focusNode, path, value, message, sourceConstraintComponent}[] + conforms`；
5. 不做：SPARQL 约束、rules、属性对约束、逻辑组合、path 逆序/序列。

此方案把 SHACL 当「语义契约规范」而非「RDF 运行时」——报告结构与 W3C 词汇一一对应，是标准合规与依赖最小化的折中。**推荐路径：先做 5.5（纯 TS 内部 IR），量大后再评估是否切 shacl-engine 获得完整 SHACL 生态。**
