/**
 * The mobile v3 form registry: the six business forms the fill-assistant
 * covers — each entry's trigger vocabulary, field tiers, and derivation
 * rules — plus the intent scorer that turns one free-form sentence into a
 * unique match or an ask-choice fork. The same table feeds the persona text
 * (examples/kb-agent/agent-presets/mobile-form-assistant), the welcome
 * capabilities, and the front-end matcher; keep the copies in sync when an
 * entry changes. No React imports.
 */

import type { FieldWidgetKind } from './protocol.ts'

/** One required field the user must decide (the 请确认/需要你定 layout). */
export interface RequiredFieldSpec {
  readonly name: string
  readonly label: string
  readonly widget: FieldWidgetKind
}

/** One derived or system field with the rule the assistant derives it by. */
export interface DerivedFieldSpec {
  readonly name: string
  readonly label: string
  /** The derivation instruction the persona follows (今天 / 数量×单价 / …). */
  readonly rule: string
}

/** One registry entry: one business form the assistant can register. */
export interface FormRegistryEntry {
  readonly collection: string
  readonly bizName: string
  readonly glyph: string
  readonly intentTerms: ReadonlyArray<{ readonly term: string; readonly weight: number }>
  /** Reverse signals; each hit subtracts 2 from this entry's score. */
  readonly antiTerms?: readonly string[]
  readonly required: readonly RequiredFieldSpec[]
  readonly derived: readonly DerivedFieldSpec[]
  readonly system: readonly DerivedFieldSpec[]
  readonly examples: readonly string[]
}

/** The seventeen-form registry (B4 the warehouse pair; B5 the manufacturing pair;
 * B6 the execution trio; B7 the sales order; W2-B2 the MPS forecast row). */
export const FORM_REGISTRY: readonly FormRegistryEntry[] = [
  {
    // B3: the canonical PO table — the hub_po_purchase_orders form migrated
    // (the legacy collection stays as read-only history like hub_po_suppliers).
    collection: 'pur_orders',
    bizName: '采购单',
    glyph: '采',
    intentTerms: [
      { term: '采购单', weight: 3 },
      { term: '采购', weight: 2 },
      { term: '进货', weight: 2 },
      { term: '订一批', weight: 2 },
      { term: '买', weight: 1 },
      { term: '谈好', weight: 1 },
    ],
    antiTerms: ['卖给'],
    required: [
      { name: 'supplier', label: '供应商', widget: 'relation' },
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'amount', label: '金额', rule: '数量×单价' },
      { name: 'currency', label: '币种', rule: '默认 CNY' },
      { name: 'need_date', label: '需求日期', rule: '用户说了填，没说留空' },
      { name: 'doc_status', label: '审批状态', rule: '默认 draft；要下单走审批时用审批技能提交（submit），审批通过才生效可收货' },
      { name: 'receiving_status', label: '收货进度', rule: '默认 none（未收货）' },
      { name: 'invoice_status', label: '发票进度', rule: '默认 no_invoice（未开票）' },
      { name: 'supplier_id', label: '供应商', rule: '按名称 nb_list 查 srm_suppliers 解析 id；只有合格/优选供方可下单（未准入会被卡口拒绝，如实转达）' },
    ],
    system: [{ name: 'code', label: '订单号', rule: '按 PO-YYYY-NNNN 递增生成' }],
    examples: ['向宏发食品采购 500kg 面粉，单价 3.2'],
  },
  {
    // B3: purchase requisition — the approval-first entry of the P2P chain.
    collection: 'pur_requests',
    bizName: '请购单',
    glyph: '请',
    intentTerms: [
      { term: '请购', weight: 3 },
      { term: '采购申请', weight: 3 },
      { term: '申请采购', weight: 3 },
      { term: '申购', weight: 2 },
    ],
    required: [
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'requester', label: '申请人', rule: '当前用户' },
      { name: 'department', label: '部门', rule: '用户说了填，没说留空' },
      { name: 'need_date', label: '需求日期', rule: '用户说了填，没说留空' },
      { name: 'total_est', label: '预估总额', rule: '数量×单价（用户给了单价时）' },
      { name: 'doc_status', label: '审批状态', rule: '默认 draft；送审走审批技能（submit），通过后转询价下单' },
    ],
    system: [{ name: 'code', label: '申请单号', rule: '按 PR-YYYY-NNNN 递增生成' }],
    examples: ['帮我提个请购，下月生产要 1 吨面粉'],
  },
  {
    // B3: PO-sourced receipt registration — the gate (PO must be approved)
    // and the IQC quarantine ride the posting engine, not the conversation.
    collection: 'wms_receipts',
    bizName: '收货单',
    glyph: '收',
    intentTerms: [
      { term: '收货登记', weight: 3 },
      { term: '收货单', weight: 3 },
      { term: '采购收货', weight: 3 },
      { term: '收货', weight: 2 },
    ],
    required: [
      { name: 'po', label: '采购订单号', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'receipt_type', label: '类型', rule: '默认 purchase（采购收货）' },
      { name: 'iqc_status', label: 'IQC 状态', rule: '默认 pending（PO 来源收货一律先上待检区，检验放行后才转合格库存）' },
      { name: 'status', label: '状态', rule: '默认 pending（登记后由仓库过账上架）' },
      { name: 'po_id', label: '采购订单', rule: '按单号 nb_list 查 pur_orders 解析 id；未生效（非已生效）订单会被卡口拒绝，如实转达；品名/供应商/批次从订单明细（pur_order_lines）回读' },
    ],
    system: [{ name: 'receipt_no', label: '收货单号', rule: '按 RCV-YYYY-NNNN 递增生成' }],
    examples: ['PO-2026-0003 的货到了，收货 800 桶'],
  },
  {
    // B2: registrations land in the SRM admission pool (potential) — the
    // single supplier source hub_po_suppliers used to be is now the read-only
    // 采购联系人 history.
    collection: 'srm_suppliers',
    bizName: '供应商登记',
    glyph: '供',
    intentTerms: [
      { term: '供应商', weight: 3 },
      { term: '登记供应商', weight: 3 },
      { term: '建档', weight: 2 },
      { term: '准入', weight: 2 },
      { term: '新单位', weight: 1 },
      { term: '入驻', weight: 1 },
    ],
    required: [
      { name: 'name', label: '供应商名称', widget: 'text' },
      { name: 'contact', label: '联系人', widget: 'text' },
    ],
    derived: [
      { name: 'lifecycle_status', label: '生命周期状态', rule: '默认 potential（潜在，进入准入审核）' },
      { name: 'source', label: '来源', rule: '默认 internal（内部代录）' },
      { name: 'phone', label: '联系电话', rule: '可选：用户提供了联系电话就填，没说留空' },
    ],
    system: [{ name: 'code', label: '编号', rule: '按 SUP-YYYY-NNNN 递增生成' }],
    examples: ['给供应商三味食品登个档', '新单位新味源走一下准入登记'],
  },
  {
    // B8: the quality-domain inspection registration — lands a pending IQC
    // document the engine's AQL verb (--inspect) judges; the conversation
    // reads the sampling suggestion card, the verdict stays engine-side.
    collection: 'qm_inspections',
    bizName: '质检登记',
    glyph: '质',
    intentTerms: [
      { term: '质检', weight: 3 },
      { term: '检验', weight: 2 },
      { term: '不合格', weight: 2 },
      { term: '抽检', weight: 2 },
      { term: '有问题', weight: 1 },
    ],
    required: [
      { name: 'ref', label: '收货单号', widget: 'text' },
      { name: 'lotQty', label: '批量', widget: 'number' },
      { name: 'sampleQty', label: '抽检数', widget: 'number' },
      { name: 'defects', label: '不合格数', widget: 'number' },
    ],
    derived: [
      { name: 'insp_type', label: '检验类型', rule: '默认 IQC（来料检验；对话登记只走来料场景）' },
      { name: 'ref_type', label: '来源类型', rule: '默认 receipt' },
      { name: 'result', label: '判定结果', rule: '默认 pending（AQL 判定由质量引擎回写：批量×AQL2.5 查表 → n/Ac/Re → d≤Ac 接收、d≥Re 拒收；对话给出建议卡但落库留 pending）' },
      { name: 'status', label: '单据状态', rule: '默认 pending（待检）' },
      { name: 'inspector', label: '检验员', rule: '当前用户' },
      { name: 'inspected_at', label: '检验日期', rule: '今天' },
      { name: 'product_id', label: '物料', rule: '按收货单号 nb_list 查 wms_receipts 回读 product_id/supplier_id/lot_no（找不到该收货单就如实转达）' },
    ],
    system: [{ name: 'code', label: '质检单号', rule: '按 QI-YYYY-NNNN 递增生成' }],
    examples: ['收货单 RCV-W8-QC-01 批量 200 抽检 32 件 2 个次要不合格', '宏发这批货抽检有问题，3 个不合格'],
  },
  {
    collection: 'hub_wms_inbound',
    bizName: '入库单',
    glyph: '入',
    intentTerms: [
      // B3: 收货 moved to the wms_receipts PO-sourced registration; the generic
      // inbound form keeps 入库/到货/进了.
      { term: '入库', weight: 3 },
      { term: '到货', weight: 2 },
      { term: '进了', weight: 1 },
    ],
    required: [
      { name: 'source', label: '来源单据', widget: 'text' },
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'inbound_date', label: '入库日期', rule: '今天' },
      { name: 'status', label: '状态', rule: '默认 待上架' },
    ],
    system: [{ name: 'inbound_number', label: '单号', rule: '按 IN-YYYY-NNNN 递增生成' }],
    examples: ['今天到货 200 箱冷链箱要入库'],
  },
  {
    collection: 'hub_wms_outbound',
    bizName: '出库单',
    glyph: '出',
    intentTerms: [
      { term: '出库', weight: 3 },
      { term: '发货', weight: 2 },
      { term: '送货', weight: 2 },
      { term: '卖给', weight: 2 },
      { term: '出一批', weight: 1 },
      { term: '一批', weight: 1 },
    ],
    required: [
      { name: 'customer', label: '客户', widget: 'relation' },
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'outbound_date', label: '出库日期', rule: '今天' },
      { name: 'status', label: '状态', rule: '默认 待发运' },
    ],
    system: [{ name: 'outbound_number', label: '单号', rule: '按 OUT-YYYY-NNNN 递增生成' }],
    examples: ['给客户鲜丰发 100 箱黄豆酱油'],
  },
  {
    collection: 'hub_fin_payments',
    bizName: '回款记录',
    glyph: '款',
    intentTerms: [
      { term: '回款', weight: 3 },
      { term: '到账', weight: 2 },
      { term: '打款', weight: 2 },
      { term: '收了钱', weight: 1 },
    ],
    required: [
      { name: 'customer', label: '客户', widget: 'relation' },
      { name: 'amount', label: '金额', widget: 'number' },
    ],
    derived: [
      { name: 'received_date', label: '到账日期', rule: '今天' },
      { name: 'reconcile_status', label: '核销状态', rule: '默认 未核销' },
    ],
    system: [{ name: 'payment_number', label: '单号', rule: '按 PAY-YYYY-NNNN 递增生成' }],
    examples: ['宏发这笔回款 16000 到账了'],
  },
  {
    // B4: the warehouse transfer application — lands as a draft the posting
    // engine's --post-transfer leg consumes (hold 待检 stock refuses there).
    collection: 'wms_transfers',
    bizName: '移库申请',
    glyph: '移',
    intentTerms: [
      { term: '移库', weight: 3 },
      { term: '挪库', weight: 3 },
      { term: '调拨', weight: 2 },
      { term: '挪到', weight: 2 },
      { term: '移到', weight: 2 },
    ],
    required: [
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
      { name: 'from_bin', label: '源库位', widget: 'text' },
      { name: 'to_bin', label: '目标库位', widget: 'text' },
    ],
    derived: [
      { name: 'status', label: '状态', rule: '默认 draft（登记后由仓库过账执行，± 流水由引擎落账）' },
      { name: 'transfer_mode', label: '移库模式', rule: '默认 one_step；跨仓远距离可 two_step（走中转到位）' },
      { name: 'reason', label: '原因', rule: '用户说了填，没说留空' },
      { name: 'product_id', label: '物料', rule: '按品名 nb_list 查 hub_inv_products 解析 id；批次优先取源库位在架批次（nb_list 查库存），解析不到就留空由仓库定批' },
    ],
    system: [{ name: 'transfer_no', label: '移库单号', rule: '按 TRF-YYYY-NNNN 递增生成' }],
    examples: ['把常温区 A01-02 的酱油挪 60 桶到 A01-05'],
  },
  {
    // B4: the reservation registration — the two-phase hard allocation's
    // mobile entry; ATP over-allocation refuses at the engine.
    collection: 'wms_reservations',
    bizName: '预留登记',
    glyph: '留',
    intentTerms: [
      { term: '预留', weight: 3 },
      { term: '占一批', weight: 3 },
      { term: '锁库存', weight: 2 },
      { term: '留给', weight: 2 },
    ],
    required: [
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
      { name: 'ref_id', label: '用途单据', widget: 'text' },
    ],
    derived: [
      { name: 'status', label: '状态', rule: '默认 reserved（可用量随之扣减；发货/领料时消耗，不用了释放）' },
      { name: 'ref_type', label: '关联类型', rule: '按用途单据判断：销售订单 SO / 生产工单 MO / 发货单 SHIPMENT' },
      { name: 'product_id', label: '物料', rule: '按品名 nb_list 查 hub_inv_products 解析 id；可用量不足会被引擎拒绝，如实转达' },
    ],
    system: [{ name: 'code', label: '预留单号', rule: '按 RSV-YYYY-NNNN 递增生成' }],
    examples: ['给生产工单 MO-2026-0005 预留 100 桶酱油'],
  },
  {
    // B5: the BOM head registration — versions and the retirement switch ride
    // the platform page; the conversation keeps the simplified head.
    collection: 'mfg_boms',
    bizName: 'BOM 登记',
    glyph: '配',
    intentTerms: [
      { term: 'BOM', weight: 3 },
      { term: '配方', weight: 3 },
      { term: '物料清单', weight: 3 },
      { term: '建配方', weight: 2 },
    ],
    antiTerms: ['查配方', '配料表'],
    required: [
      { name: 'product', label: '成品品名', widget: 'text' },
    ],
    derived: [
      { name: 'version', label: '版本', rule: '默认 1；用户说了版本号就填' },
      { name: 'bom_status', label: '状态', rule: '默认 draft（登记后由工艺在平台审核激活为 active；旧版退役不删除）' },
      { name: 'is_default', label: '默认版本', rule: '首个配方默认是；同成品已有默认时新版本默认否' },
      { name: 'remark', label: '备注', rule: '用户说了填' },
      { name: 'product_id', label: '成品物料', rule: '按品名 nb_list 查 hub_inv_products 解析 id' },
    ],
    system: [{ name: 'code', label: 'BOM 编号', rule: '按 BOM-NNNN 递增生成' }],
    examples: ['给海苔芝士米果建个新配方'],
  },
  {
    // B5: the manufacturing order — approval rides the B1 engine, release and
    // scheduling ride mfg-schedule (approved ≠ released).
    collection: 'mfg_orders',
    bizName: '生产订单',
    glyph: '产',
    intentTerms: [
      { term: '生产单', weight: 3 },
      { term: '生产订单', weight: 3 },
      { term: '下产单', weight: 3 },
      { term: '排产单', weight: 2 },
      { term: '开工单', weight: 2 },
      { term: '生产一批', weight: 2 },
    ],
    antiTerms: ['排产结果', '排产预览'],
    required: [
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'need_date', label: '需求日期', rule: '用户说了填，没说留空' },
      { name: 'doc_status', label: '审批状态', rule: '默认 draft；送审走审批技能（submit），审批通过后由计划员下达（released）才可排产领料' },
      { name: 'reservation_state', label: '齐套状态', rule: '默认 none（未齐套；齐套由系统在下达后计算）' },
      { name: 'bom_id', label: 'BOM', rule: '按品名 nb_list 查 mfg_boms（状态 active 的默认版本）解析 id——非生效 BOM 会被卡口拒绝，如实转达' },
      { name: 'std_cost', label: '标准单位成本', rule: '从 BOM 备注或用户口述取，没说填 0' },
      { name: 'estimated_cost', label: '预估总额', rule: '数量×标准单位成本；超 10 万审批自动加签总经理' },
    ],
    system: [{ name: 'code', label: '订单号', rule: '按 MO-YYYY-NNNN 递增生成' }],
    examples: ['下个产单，海苔芝士米果 12000 件，10 月 20 号要'],
  },
  {
    // B6: the material-issue registration — one row per component; the
    // posting engine consumes it after the MO kits (assigned) and moves the
    // reserved stock onto the shop-floor WIP bin.
    collection: 'mfg_material_issues',
    bizName: '领料登记',
    glyph: '领',
    intentTerms: [
      { term: '领料', weight: 3 },
      { term: '领料登记', weight: 3 },
      { term: '领一批料', weight: 3 },
      { term: '领', weight: 2 },
      { term: '去领', weight: 1 },
    ],
    antiTerms: ['退料'],
    required: [
      { name: 'mo', label: '生产订单号', widget: 'text' },
      { name: 'product', label: '组件品名', widget: 'text' },
      { name: 'quantity', label: '领料数量', widget: 'number' },
    ],
    derived: [
      { name: 'issue_date', label: '领料日期', rule: '今天' },
      { name: 'status', label: '状态', rule: '默认 draft（登记后由仓库过账执行——齐套不足或未下达会被引擎拒绝，如实转达）' },
      { name: 'mo_id', label: '生产订单', rule: '按订单号 nb_list 查 mfg_orders 解析 id；未下达（非已下达/执行中）或未齐套的会被引擎拒绝，如实转达' },
      { name: 'product_id', label: '组件物料', rule: '按品名 nb_list 查 hub_inv_products 解析 id；批次留空由仓库按齐套预留定批' },
    ],
    system: [{ name: 'code', label: '领料单号', rule: '按 MI-YYYY-NNNN 递增生成' }],
    examples: ['MO-2026-0001 领糯米粉 759 公斤', '给 MO-2026-0005 领一批包装袋'],
  },
  {
    // B6: the job-report registration — qty/duration drive the operation's
    // progress (first report starts it, reaching the MO quantity finishes).
    collection: 'mfg_job_reports',
    bizName: '报工登记',
    glyph: '工',
    intentTerms: [
      { term: '报工', weight: 3 },
      { term: '报工登记', weight: 3 },
      { term: '完工报工', weight: 2 },
      { term: '工序完工', weight: 2 },
      { term: '干完了', weight: 1 },
    ],
    antiTerms: ['排产'],
    required: [
      { name: 'mo', label: '生产订单号', widget: 'text' },
      { name: 'quantity', label: '合格数量', widget: 'number' },
    ],
    derived: [
      { name: 'report_date', label: '报工日期', rule: '今天' },
      { name: 'op_seq', label: '工序号', rule: '用户说了工序号就填（如 3 号线/第 2 道工序）；说了工序名就 nb_list 查 mfg_order_operations 按工序名对号；没说用 ask_field 问' },
      { name: 'qty_scrap', label: '不合格数量', rule: '用户说了填，没说填 0' },
      { name: 'duration_min', label: '工时(分)', rule: '用户说了填，没说留空由车间补录' },
      { name: 'operator', label: '报工人', rule: '当前用户' },
      { name: 'qc_status', label: 'IPQC 状态', rule: '默认 not_required（需要工序检验时填 pending，检验结果由质量域回写）' },
      { name: 'status', label: '状态', rule: '默认 draft（登记后由引擎过账推进工序进度——报工累计超订单量会被拒绝，如实转达）' },
      { name: 'mo_id', label: '生产订单', rule: '按订单号 nb_list 查 mfg_orders 解析 id；未领料开工（执行中）的会被引擎拒绝，如实转达' },
    ],
    system: [{ name: 'code', label: '报工单号', rule: '按 JR-YYYY-NNNN 递增生成' }],
    examples: ['MO-2026-0001 第 3 道调味包装工序完工 500 件', '3 号线杀菌工序完工 500 件，工时 2 小时'],
  },
  {
    // B6: the completion registration — the finished goods quaratine on the
    // 待检区 until OQC releases; the MO settles its dual cost columns there.
    collection: 'mfg_completions',
    bizName: '完工登记',
    glyph: '完',
    intentTerms: [
      { term: '完工登记', weight: 3 },
      { term: '完工入库', weight: 3 },
      { term: '生产完工', weight: 3 },
      { term: '入产成品', weight: 2 },
      { term: '整批完工', weight: 2 },
    ],
    antiTerms: ['排产'],
    required: [
      { name: 'mo', label: '生产订单号', widget: 'text' },
      { name: 'quantity', label: '完工数量', widget: 'number' },
    ],
    derived: [
      { name: 'lot_no', label: '成品批次', rule: '留空由引擎按完工日期自动建批（按保质期推四日期）' },
      { name: 'oqc_status', label: 'OQC 状态', rule: '过账后默认 pending（成品先上待检区，OQC 放行才转合格库存）' },
      { name: 'status', label: '状态', rule: '默认 draft（登记后由引擎过账——工序未报齐或完工数超报工合格数会被拒绝，如实转达）' },
      { name: 'mo_id', label: '生产订单', rule: '按订单号 nb_list 查 mfg_orders 解析 id；未领料报工（执行中）的会被引擎拒绝，如实转达' },
    ],
    system: [{ name: 'code', label: '完工单号', rule: '按 MC-YYYY-NNNN 递增生成' }],
    examples: ['MO-2026-0001 整批完工 12000 件入库', 'MO-2026-0005 完工 800 箱进待检'],
  },  {
    // B7: the sales order — the OTC chain's entry. draft until submitted;
    // approved drives MRP demand + the finished-goods reservation.
    collection: 'so_orders',
    bizName: '销售订单',
    glyph: '销',
    intentTerms: [
      { term: '销售订单', weight: 3 },
      { term: '销售单', weight: 3 },
      { term: '卖出', weight: 2 },
      { term: '卖给', weight: 2 },
      { term: '接单', weight: 2 },
      { term: '签了单', weight: 1 },
    ],
    antiTerms: ['采购', '进货'],
    required: [
      { name: 'customer', label: '客户', widget: 'relation' },
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'amount', label: '金额', rule: '数量×单价' },
      { name: 'need_date', label: '交货日期', rule: '用户说了填，没说留空' },
      { name: 'doc_status', label: '审批状态', rule: '默认 draft；「提交审批」走审批技能 submit，审批通过才生效——生效后才驱动 MRP 需求与成品预留（金额超 10 万自动加签总经理）' },
      { name: 'shipping_status', label: '发货进度', rule: '默认 none（未发货）' },
      { name: 'customer_id', label: '客户', rule: '按名称 nb_list 查 crm_customers 解析 id（合作中/潜在客户均可登记）' },
    ],
    system: [{ name: 'code', label: '订单号', rule: '按 SO-YYYY-NNNN 递增生成' }],
    examples: ['鲜美达下了销售单：米果 20000 袋，单价 9.8', '给百胜签单，酱油 50 箱'],
  },

  {
    // W2-B2: the MPS forecast row — the planner's monthly demand input. The
    // merge outputs (planned_qty / so_open_qty / driver) stay engine-written
    // (recalcPlan at seed/refresh and the approval lock-in).
    collection: 'mps_plan_items',
    bizName: '预测登记',
    glyph: '预',
    intentTerms: [
      { term: '预测登记', weight: 3 },
      { term: '报预测', weight: 3 },
      { term: '预测', weight: 2 },
      { term: '预测量', weight: 2 },
    ],
    antiTerms: ['查预测', '预测结果', '排产结果'],
    required: [
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '预测数量', widget: 'number' },
    ],
    derived: [
      { name: 'period', label: '时段', rule: '用户说了月份用该月（YYYY-MM），没说默认下个月' },
      { name: 'forecast_qty', label: '预测数量', rule: '即预测数量 quantity 原值' },
      { name: 'plan_id', label: '主生产计划', rule: 'nb_list 查 mps_plans 取覆盖该时段的最新一期（draft/approved 均可），没有覆盖的计划头时如实告知先在平台建计划' },
    ],
    system: [],
    examples: ['下个月酸奶礼盒预测 5000 盒', '报一下 11 月米果预测 2 万袋'],
  },

]

/** Synonym rewrites the scorer normalizes before matching (冷链 vocabulary). */
const SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ['制冷', '冷链'],
  ['保温箱', '冷链箱'],
  ['冰袋', '冷链'],
]

/**
 * The generic register verbs (weight 1 on every entry — the 02 §3.1 泛动作词):
 * a sentence carrying only these scores every table equally, which the fork
 * policy reads as "wants to register but said too little" and answers with
 * the whole-registry ask_choice.
 */
const GENERIC_REGISTER_TERMS: readonly string[] = ['登记', '记一下', '录一笔', '开单']

/** The intent-match verdict the conversation state machine consumes. */
export type IntentMatch =
  | { readonly kind: 'unique'; readonly entry: FormRegistryEntry }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly FormRegistryEntry[] }
  | { readonly kind: 'none' }

/** A question-shaped sentence is an analytics ask unless a strong hit lands. */
const QUESTIONISH = /(多少|怎么|什么|哪里|吗|？|\?|几)/

/** A unique hit needs at least this score (a full form-noun hit). */
const UNIQUE_MIN_SCORE = 3
/** A unique hit must lead the runner-up by at least this margin. */
const UNIQUE_LEAD = 2
/** Each anti-term hit subtracts this from the entry's score. */
const ANTI_PENALTY = 2

/**
 * Score one entry against the normalized input: the sum of its intent-term
 * weights (a term counts once) minus the anti-term penalties (floor 0).
 */
function scoreOf(entry: FormRegistryEntry, input: string): number {
  let score = 0
  for (const { term, weight } of entry.intentTerms) {
    if (input.includes(term)) score += weight
  }
  for (const term of GENERIC_REGISTER_TERMS) {
    if (input.includes(term)) {
      score += 1
      break
    }
  }
  if (entry.antiTerms !== undefined) {
    for (const term of entry.antiTerms) {
      if (input.includes(term)) score -= ANTI_PENALTY
    }
  }
  return Math.max(score, 0)
}

/**
 * Match one user sentence onto the registry (the 02 §3.3 policy): a unique
 * high-confidence hit short-circuits into the slot-filling flow; an
 * ambiguous or low-confidence hit carries the top candidates for an
 * ask_choice fork (fewer than two scoring candidates with sub-threshold
 * scores reads as "wants to register but said too little" and lists the
 * whole registry); zero everywhere is a non-registration intent.
 * @param input - the user's free-form sentence.
 * @returns the match verdict.
 */
export function matchIntent(input: string): IntentMatch {
  let normalized = input
  for (const [from, to] of SYNONYMS) normalized = normalized.replaceAll(from, to)
  const ranked = FORM_REGISTRY
    .map(entry => ({ entry, score: scoreOf(entry, normalized) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
  const [top, runnerUp] = ranked
  if (top === undefined) return { kind: 'none' }
  const lead = runnerUp === undefined ? Number.POSITIVE_INFINITY : top.score - runnerUp.score
  if (top.score >= UNIQUE_MIN_SCORE && lead >= UNIQUE_LEAD) {
    return { kind: 'unique', entry: top.entry }
  }
  // A question-shaped sentence below the strong-hit bar is an analytics ask,
  // not a registration: the none verdict hands it to the read-only branch.
  if (QUESTIONISH.test(input)) return { kind: 'none' }
  // A declarative sentence with one strong verb and a clear lead (采购 500kg
  // 面粉…) reads as intent without a fork.
  if (top.score >= 2 && lead >= UNIQUE_LEAD) {
    return { kind: 'unique', entry: top.entry }
  }
  // A sentence that never rose above the generic-verb weight said too little
  // to rank anything: the fork lists the whole registry (02 §3.3.4).
  const candidates = top.score <= 1
    ? [...FORM_REGISTRY]
    : ranked.slice(0, 3).map(row => row.entry)
  return { kind: 'ambiguous', candidates }
}

/**
 * The welcome capabilities line projected from the registry (the fill
 * assistant's greeting card copy).
 * @returns the one-line capability sentence.
 */
export function registryCapabilityLine(): string {
  return `说一句话就能登记：${FORM_REGISTRY.map(entry => entry.bizName).join('、')}`
}
