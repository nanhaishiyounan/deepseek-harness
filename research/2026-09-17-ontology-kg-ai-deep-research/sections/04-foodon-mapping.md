# 第 4 章 FoodOn 食品本体与 registry v4 映射（硬性要求 2）

## 4.1 FoodOn 全貌

- **版本/规模**：2025-12-30 release，EBI OLS API 实测 **39,682 terms（类）/ 125 properties（object properties 核心约 10-20 个）/ 435 individuals**；GitHub 238 stars、2026-08 仍活跃；**CC-BY-4.0**（Bioregistry 与 Ontobee 双源一致）——商用零障碍。
- **定位**："farm to fork ontology"，OBO Foundry 成员（FP-004 版本化原则），2018 年发布，源自 LanguaL 变换。
- **上游依赖**（GitHub `src/ontology/` 实锤）：主编辑文件 `foodon-edit.ofn`（OWL Functional Syntax）+ `imports/`：chebi/cob/ncbitaxon/cdno 四大 import + langual 子集 + robot_fdc.owl（USDA FoodData Central）+ general_import（BFO/IAO/RO/OBI/PO/UBERON/ENVO）；`components/`：**food_products.owl（9600+ 产品主库）**、food_materials.owl、food_process.owl、**sssom_mappings.owl（官方 SSSOM 映射先例）**。
- **交付形态**：release `foodon.owl`（RDF/XML 全量）+ 模块化 src；ODK Makefile 构建链。

## 4.2 顶层 class 层级（OLS API 实测原文，2023-06 起采用 COB 上层框架）

```
BFO_0000040 material entity
├─ FOODON_00002403 food material（主食品层级之顶；synonyms: food/foodstuff/nourishment）
│  ├─ FOODON_00001002 food product
│  │  ├─ FOODON_00001015 plant food product
│  │  │  → 00001264 legume food product → 00001635 bean food product
│  │  │  → 00002153 plant seed vegetable food product
│  │  │  → 00002265 soybean seed (field) food product → 00002266 soybean food product
│  │  │  → 00003301415 soybean → …00004697 tofu（soft/firm/extra firm/raw/fermented 全系）
│  │  ├─ FOODON_00004242 animal food product
│  │  ├─ FOODON_00002501 multi-component food、00001133 condiment、00001871 food material analog
│  ├─ FOODON_03400361 agency food product type（LanguaL Facet A：EFSA/GS1/FDA CFR 逐字复制；
│  │    FoodEx2 术语已作类存在，如 FOODON:03543901 "39010 - tofu salad (efsa foodex2)"）
│  ├─ FOODON_00001872 food material (to be processed)、00001714 food material component
│  ├─ FOODON_00002645 food material by process、00002454 by characteristic、
│  │  00002147 by consumer group、00002373 by meal type
├─ FOODON_03420116 organism material（farm-to-fork 生物源侧）
│  ├─ FOODON_00004331 plant material → 00002753 bean → 03310646 legume
│  ├─ FOODON_03420164 animal material、00004336 fungus material、00001145 microbial、00001184 algae
├─ FOODON_00003368 food contact material（包材）、00003510136 food consumer group
└─ 13 个外部本体类直接挂载：COB/ChEBI/CDNO/ENVO/GO/NCIT/OBI/PCO/PO/UBERON…
```

**多继承实证**：soybean 同时是 `PO_0009010 seed → UBERON anatomical entity`（生物解剖面）与 `food product`（产品面）的子类；process 与 product 分离（`FOODON_00002451 food transformation process → packaging/harvesting/treatment/winemaking` 在 BFO process 下）。

## 4.3 核心 object properties（官网关系页全文抄录）

| 属性 | IRI | 语义要点 |
|---|---|---|
| **has ingredient** | FOODON_00002420 | FoodOn 自定义（非 RO）："between a food material and another food material that has been added to it at some point in its history" |
| has defining ingredient | FOODON_00001563 | 子属性，定义性成分 |
| has substance added | — | 添加后可能不可辨 |
| has part | BFO_0000051 | 同类实体间部分 |
| has quality | — | 产品→PATO 质量（映射暂缓，PATO 依赖重） |
| member of | — | 挂外部机构分类，**刻意避免 is-a**（防机构分类逻辑污染主树） |
| derives from | RO | **语义缺陷**：RO 定义"Y 因 X 形成而消失"与食品部分取料冲突——官方文档自认，映射时弱化为"来源" |
| has food substance analog | FOODON_00001301 | 替代物 |
| ~~produced by~~ / ~~has taxonomic identifier~~ | 已淘汰 | 正被 `[organism part] and derives from some [NCBITaxon]` 模式替代 |

## 4.4 中文支持与 FoodEx2/LanguaL 取舍

- **本体文件零中文标签**（OLS `q=大豆` 命中 0；languages 列表含 zh 是引擎能力声明非覆盖）——**中文层必须自建**（LLM 批译 label_zh 列 + GB 术语对齐）。
- **FoodEx2**（EFSA 暴露分类）不需要单独引入：FoodOn 官方以 stand-alone SSSOM 映射表推进 FoodEx2→FoodOn（issue #354 + RDA Mapping Commons 案例），且 LanguaL Facet A 的 EFSA 分支已逐字入 FoodOn。
- **LanguaL**（14-facet 叙词表）：FoodOn 是其本体化超集——Facet B 全镜像（`FOODON_0341xxxx` = LanguaL Bxxxx，如 B1452→FOODON_03411452 soybean plant），全部 id 存 dbXref，废弃术语在 langual_deprecated_import.owl。**三者只需引 FoodOn。**

## 4.5 映射表：FoodOn → registry v4（核心交付）

### A. Class 映射（裁剪导入 5 棵子树）

| FoodOn 子树（入口 IRI） | registry v4 落点 | 说明 |
|---|---|---|
| `FOODON_00001002 food product` + 全部后代（components/food_products.owl 单文件 9600+ 类，裁剪最好切口） | `Class(kind=食品类别)` | 主战场 |
| `FOODON_03420116 organism material` → plant/animal/fungus material（仅 2-3 层骨架） | `Class(kind=原料来源)` | 深叶（4000+ NCBITaxon）不引 |
| `FOODON_00002451 food transformation process`（4 直接子类+约 2 层） | `Class(kind=工艺)` | 工艺分类树 |
| `FOODON_00003368 food contact material` | `Class(kind=包材)` | 包材合规 |
| `FOODON_00004277 regulated food material` + `03400361 agency food product type`（仅顶级） | `Class(kind=法规分类)` 附加维度 | GB 标准挂点自建同级 |
| ~~by characteristic / by consumer group~~ | 暂缓（P2） | — |

**不引入**：COB/BFO 顶层与 PO/UBERON/ChEBI 深层——被引节点只留浅拷贝（id+label+一层父）。

### B. Relation 映射（domain/range 翻译规则）

| FoodOn object property | registry v4 Relation | domain/range 翻译 |
|---|---|---|
| has ingredient (00002420) | `Relation(name=含有原料)` | 定义语义即 food material→food material → domain=产品/配料实体, range=原料实体 |
| has defining ingredient (00001563) | `Relation(name=定义性原料)` | 同上，标记 parent=含有原料 |
| has substance added | `Relation(name=添加物)` | domain=食品实体，range=食品/化学实体 |
| derives from (RO) | `Relation(name=来源)` | 语义弱化为"来源追溯"，不承诺 RO 的"Y 消失" |
| has part (BFO_0000051) | `Relation(name=组成部分)` | 同类实体间，保持对称检查 |
| member of | `Relation(name=机构分类引用)` | **不让机构分类进 is-a 主树**（FoodOn 原设计意图） |
| has quality | 暂不映射（P3） | PATO 依赖重 |

### C. 单继承化策略（OWL 多继承 → 单 schema 图）

FoodOn 每类多父 → **registry 每节点选唯一"主父"沿产品面（00001002 树），其余父类降级为附加边**：`soybean --(跨面引用)--> plant material`，即主树单继承 + 横切边表多继承。

### D. 实例层 typing

`实体 --type--> Class(foodon_uri)`；同义词表直接吸收 OLS synonyms + 官方 foodon-synonyms.tsv；中文标签自建 `label_zh` 列。

### E. SQLite 存储（registry v5 增量字段）

```sql
-- class 表新增：
foodon_uri TEXT UNIQUE,     -- http://purl.obolibrary.org/obo/FOODON_00002403
foodon_id  TEXT,            -- FOODON:00002403（xref 便利）
langual_code TEXT NULL,     -- B1452（老库映射）
-- relation 表新增：foodon_prop_uri TEXT
-- 新表：SSSOM 式映射通道（预留直接吸收官方 FoodEx2 SSSOM 成果）
CREATE TABLE ontology_xref (
  subject_id TEXT NOT NULL, predicate_id TEXT NOT NULL, object_id TEXT NOT NULL,
  mapping_justification TEXT, PRIMARY KEY (subject_id, predicate_id, object_id));
```

**导入器**：推荐走 OLS API（`/ontologies/foodon/terms/{iri}/children|ancestors` 翻页，免 OWL 解析栈、TS 友好）；备选 release owl 子树过滤。两者只取其一。

## 4.6 张红喜供应商方案场景验证（全链路实测）

- 供应商 = `OBI_0000245 organization`（挂载点，实例自建）
- 原料 = `FOODON:03301415 soybean`（路径：food product→plant food product→legume food product→bean food product→plant seed vegetable food product→soybean seed (field) food product→soybean food product→soybean）；"非转基因"特性走 has quality / by characteristic
- 产品 = `FOODON:00004697 tofu`（soybean→tofu 用 has ingredient 表达；磨浆点卤工艺挂 food transformation process 子类）
- 包材 = food contact material
- 合规检测 = regulated food material + 自建 GB 检测项 Enum 挂接

**场景四环全部有本体落点，验证通过。**

## 4.7 OpenSPG 类型系统的补充映射（工业范式融合）

| SPG 概念 | registry v4 落点 |
|---|---|
| EntityType / EventType | Class（kind=entity / kind=event） |
| ConceptType + 概念实例 | 概念表 + Class 上的 conceptField；7 大谓词（HYP/CAU/...）作内置系统 Relation 封闭枚举（对齐 corefers_with 系统边先例） |
| constraint: NotNull/MultiValue/Enum/Regular | KgPropDef 扩展：required/isArray/enumValues/regex（抽取前+写库前双点校验） |
| STD.*（Email/Date/IdCardNo…） | PropertyValidator 注册表（食品行可加 Std.GB7718 分类码等自有 STD 集） |
| rule [[Define…]] KGDSL | 降维：声明式 JSON 规则（path-pattern+表达式白名单+action）+ SQL 物化，挂 kg-build derive 阶段；规则输出强制过 registry schema 校验 |
| 子属性嵌套 | 可后置，食品场景暂时扁平化 |
| namespace 前缀 | registry 命名空间/项目前缀 |
