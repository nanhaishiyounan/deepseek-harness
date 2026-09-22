/**
 * The model-facing `kg_edit` tool: natural-language graph editing with a
 * mandatory diff preview, episode bookkeeping, and rollback — the four-step
 * contract「NL 指令 → diff 预览 → 确认落库 → episode 留痕」the plan promises.
 * `propose` turns the instruction into a validated KGCL change-op set and
 * renders the diff (nothing lands); `apply` executes one proposal as one
 * episode (`source: 'ai-edit'`, content = the instruction verbatim, diff in
 * metadata) with edge-record retirement (never deletes) and contradiction
 * resolution; `rollback` reverses one episode as a rollback episode;
 * `episodes` lists the ledger. Every write is an episode —「这条边来自哪次
 * 修改」is answerable from kg_mention alone.
 * @module @deepseek-ai/dsh-tool-kb/kg-edit
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { buildChangeDiff, formatChangeDiff } from '@deepseek-ai/dsh-kb-graph'
import type { KgEdge, KgGraphChangeOp, KgNodeTypeId } from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'
import { completeViaLlm } from './llm-complete.ts'
import type { ToolLlmOptions } from './llm-complete.ts'

/** The provenance system every ai-edit edge asserts (rides the seven-column anchor). */
export const AI_EDIT_SOURCE_SYSTEM = 'ai-edit'

/** One pending proposal between `propose` and `apply`. */
interface Proposal {
  readonly id: string
  readonly instruction: string
  readonly ops: readonly KgGraphChangeOp[]
  readonly diffText: string
  readonly createdAt: string
}

/** The tool's parsed arguments after schema validation. */
export interface KgEditArgs {
  readonly action: 'propose' | 'apply' | 'rollback' | 'episodes'
  readonly instruction?: string
  readonly proposal_id?: string
  readonly episode_uuid?: string
  readonly reason?: string
  readonly tenant?: string
}

/** Slice one JSON object out of a model answer. */
function sliceJsonObject(text: string): string | undefined {
  const start = text.indexOf('[') === -1 ? text.indexOf('{') : Math.min(...[text.indexOf('{'), text.indexOf('[')].filter(i => i !== -1))
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (start === -1 || end <= start) return undefined
  return text.slice(start, end + 1)
}

/** One raw op as the planning prompt asks for it. */
interface RawOp {
  readonly op?: unknown
  readonly relation?: unknown
  readonly src?: unknown
  readonly dst?: unknown
  readonly srcType?: unknown
  readonly dstType?: unknown
  readonly target?: unknown
  readonly targetType?: unknown
  readonly props?: unknown
  readonly fact?: unknown
}

/**
 * Parse and validate the model's planned ops against the closed op set and
 * the registry's relation/type closed sets.
 * @param answer - the raw model output.
 * @param options - the registry's closed sets (`relationIds`, `typeIds`).
 * @returns the valid ops plus per-op rejection reasons.
 */
export function parsePlannedOps(
  answer: string,
  options: { readonly relationIds: readonly string[]; readonly typeIds: readonly string[] },
): { ops: KgGraphChangeOp[]; rejected: string[] } {
  const sliced = sliceJsonObject(answer)
  const rejected: string[] = []
  if (sliced === undefined) return { ops: [], rejected: ['answer contains no JSON array/object'] }
  let parsed: unknown
  try {
    parsed = JSON.parse(sliced)
  } catch (error: unknown) {
    // JSON.parse only throws SyntaxError.
    /* v8 ignore next -- JSON.parse never throws a non-Error value. */
    return { ops: [], rejected: [`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`] }
  }
  const raws = Array.isArray(parsed) ? parsed : [parsed]
  const ops: KgGraphChangeOp[] = []
  for (const entry of raws) {
    if (typeof entry !== 'object' || entry === null) {
      rejected.push('an entry is not an object')
      continue
    }
    const raw = entry as RawOp
    const op = raw.op
    if (op === 'add_edge') {
      const relation = typeof raw.relation === 'string' ? raw.relation : undefined
      const srcName = typeof raw.src === 'string' && raw.src.trim().length > 0 ? raw.src.trim() : undefined
      const dstName = typeof raw.dst === 'string' && raw.dst.trim().length > 0 ? raw.dst.trim() : undefined
      const srcType = typeof raw.srcType === 'string' ? raw.srcType : undefined
      const dstType = typeof raw.dstType === 'string' ? raw.dstType : undefined
      if (relation === undefined || srcName === undefined || dstName === undefined) {
        rejected.push('add_edge misses relation/src/dst')
        continue
      }
      if (!options.relationIds.includes(relation)) {
        rejected.push(`add_edge relation "${relation}" is not registered`)
        continue
      }
      if (srcType !== undefined && !options.typeIds.includes(srcType)) {
        rejected.push(`add_edge srcType "${srcType}" is not registered`)
        continue
      }
      if (dstType !== undefined && !options.typeIds.includes(dstType)) {
        rejected.push(`add_edge dstType "${dstType}" is not registered`)
        continue
      }
      ops.push({
        op: 'add_edge',
        relation: kgRelationId(relation),
        src: { id: '', name: srcName, ...(srcType === undefined ? {} : { type: srcType }) },
        dst: { id: '', name: dstName, ...(dstType === undefined ? {} : { type: dstType }) },
        ...(typeof raw.fact === 'string' ? { fact: raw.fact } : {}),
      })
      continue
    }
    if (op === 'remove_edge') {
      const relation = typeof raw.relation === 'string' ? raw.relation : undefined
      const srcName = typeof raw.src === 'string' && raw.src.trim().length > 0 ? raw.src.trim() : undefined
      const dstName = typeof raw.dst === 'string' && raw.dst.trim().length > 0 ? raw.dst.trim() : undefined
      const srcType = typeof raw.srcType === 'string' ? raw.srcType : undefined
      const dstType = typeof raw.dstType === 'string' ? raw.dstType : undefined
      if (relation === undefined || srcName === undefined || dstName === undefined) {
        rejected.push('remove_edge misses relation/src/dst')
        continue
      }
      if (!options.relationIds.includes(relation)) {
        rejected.push(`remove_edge relation "${relation}" is not registered`)
        continue
      }
      if (srcType !== undefined && !options.typeIds.includes(srcType)) {
        rejected.push(`remove_edge srcType "${srcType}" is not registered`)
        continue
      }
      if (dstType !== undefined && !options.typeIds.includes(dstType)) {
        rejected.push(`remove_edge dstType "${dstType}" is not registered`)
        continue
      }
      ops.push({
        op: 'remove_edge',
        relation: kgRelationId(relation),
        src: { id: '', name: srcName, ...(srcType === undefined ? {} : { type: srcType }) },
        dst: { id: '', name: dstName, ...(dstType === undefined ? {} : { type: dstType }) },
      })
      continue
    }
    if (op === 'set_node_props') {
      const targetName = typeof raw.target === 'string' && raw.target.trim().length > 0 ? raw.target.trim() : undefined
      const props = raw.props
      if (targetName === undefined || typeof props !== 'object' || props === null || Array.isArray(props)) {
        rejected.push('set_node_props misses target or props object')
        continue
      }
      ops.push({
        op: 'set_node_props',
        target: { id: '', name: targetName },
        props: props as Record<string, unknown>,
      })
      continue
    }
    rejected.push(`unknown op "${String(op)}"`)
  }
  return { ops, rejected }
}

/**
 * Resolve one entity name to an existing node hit (or a typed placeholder
 * for creation). A plan-declared type narrows the search first — same-name
 * entities across types (「酱油」 the product vs「酱油」 the category) resolve
 * to the planned type — then an untyped probe, then creation.
 */
async function resolveEndpoint(
  graph: Context['kbGraph'],
  tenant: string,
  name: string,
  claimedType: string | undefined,
  typeIds: readonly string[],
): Promise<{ id: string; name: string; type: KgNodeTypeId; created: boolean }> {
  if (claimedType !== undefined && typeIds.includes(claimedType)) {
    const [typed] = await graph.searchNodes(tenant, name, kgNodeTypeId(claimedType), 1)
    if (typed !== undefined) return { id: typed.id, name: typed.name, type: typed.type, created: false }
  }
  const [hit] = await graph.searchNodes(tenant, name, undefined, 1)
  if (hit !== undefined) return { id: hit.id, name: hit.name, type: hit.type, created: false }
  if (claimedType === undefined || !typeIds.includes(claimedType)) {
    throw new Error(`kg_edit: 实体「${name}」在图中不存在，且计划未提供合法的新建类型`)
  }
  return { id: `ai-edit:${name}`, name, type: kgNodeTypeId(claimedType), created: true }
}

/**
 * Register the `kg_edit` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param tenant - the deployment-side tenant binding.
 * @param timeoutMs - cooperative tool-call budget.
 * @param llmOptions - the provider/model natural-language planning streams with.
 */
export function applyKgEditTool(ctx: Context, tenant: string, timeoutMs: number, llmOptions: ToolLlmOptions): void {
  ctx.systemPrompt.section({
    name: 'tool:kg_edit',
    order: 113,
    text: 'Use kg_edit to change the knowledge graph from one natural-language instruction (e.g. 「把张红喜的供应商关系改成中粮」). Always call action=propose first, show the returned diff to the user, and only call action=apply after the user confirms. action=rollback reverses one episode by uuid; action=episodes lists recent episodes. Never invent relation or entity-type ids — kg_schema lists them.',
  })

  /** Pending proposals (propose → apply handoff), keyed by id. */
  const proposals = new Map<string, Proposal>()

  ctx.tools.register(defineTool({
    name: 'kg_edit',
    description: 'Edit the knowledge graph from one natural-language instruction. Two-phase and safe: action=propose returns a diff preview (nothing lands); action=apply executes a confirmed proposal and records an episode; action=rollback reverses an episode; action=episodes lists the change ledger.',
    parameters: {
      action: { type: 'string', required: true, description: 'propose | apply | rollback | episodes' },
      instruction: { type: 'string', description: 'The natural-language edit instruction (action=propose).' },
      proposal_id: { type: 'string', description: 'The proposal id action=apply executes.' },
      episode_uuid: { type: 'string', description: 'The episode uuid action=rollback reverses.' },
      reason: { type: 'string', description: 'Optional reason recorded on rollback.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          proposal_id: { type: 'string' },
          diff: { type: 'string' },
          episode_uuid: { type: 'string' },
          applied: { type: 'number' },
          rejected: { type: 'array', items: { type: 'string' } },
          episodes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                uuid: { type: 'string', required: true },
                source: { type: 'string', required: true },
                name: { type: 'string', required: true },
                mentions: { type: 'number', required: true },
                created_at: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.diff !== undefined && value.diff.length > 0 ? value.diff : value.status }],
      presentationMeta: (_args, value) => {
        return { status: value.status, applied: value.applied ?? 0 }
      },
    },
    timeoutMs,
    isConcurrencySafe: () => false,
    async execute(args: KgEditArgs) {
      if (args.tenant !== undefined) {
        throw new Error('kg_edit: the tenant is bound by the deployment; a tenant argument is not accepted')
      }
      const graph = ctx.get('kbGraph')
      if (graph === undefined) {
        throw new Error('kg_edit: no knowledge-graph service is composed; add the dsh-kb-graph seam and a store provider')
      }
      if (args.action === 'episodes') {
        const rows = await graph.listEpisodes(tenant, 20)
        return {
          status: `最近 ${String(rows.length)} 条 episode`,
          episodes: rows.map(row => ({
            uuid: row.uuid,
            source: row.source,
            name: row.name,
            mentions: row.mentionCount,
            created_at: row.createdAt,
          })),
        }
      }
      if (args.action === 'propose') {
        const instruction = (args.instruction ?? '').trim()
        if (instruction.length === 0) throw new Error('kg_edit propose: instruction is required')
        const relationIds = graph.listRelations().map(relation => String(relation.id))
        const typeIds = graph.listNodeTypes().map(type => String(type.id))
        const answer = await completeViaLlm(ctx, llmOptions, [
          '你是知识图谱编辑规划器。把用户的自然语言改图指令翻译成变更操作数组。只输出 JSON 数组，不要输出其他文字。',
          '操作闭集：',
          '{"op":"add_edge","relation":"<关系id>","src":"<实体名>","dst":"<实体名>","srcType":"<src 的注册类型id（同名多类型实体优先按它解析；不存在则按它新建）>","dstType":"<同 dst>","fact":"<可选的事实句>"}',
          '{"op":"remove_edge","relation":"<关系id>","src":"<实体名>","srcType":"<src 的注册类型id（可选，用于消歧）>","dst":"<实体名>","dstType":"<同 dst（可选）>"}',
          '{"op":"set_node_props","target":"<实体名>","props":{}}',
          `关系 id 闭集：${relationIds.join(', ')}`,
          `实体类型 id 闭集（仅新建实体需要）：${typeIds.join(', ')}`,
          '规则：「把 A 的 X 关系改成 B」= 一次 remove_edge（A 的旧 X 指向）+ 一次 add_edge（A X→ B）；只在指令明确时新增或移除，不要顺手改别的。',
        ].join('\n'), instruction)
        const { ops, rejected } = parsePlannedOps(answer, { relationIds, typeIds })
        if (ops.length === 0) {
          return { status: '规划失败：模型未产出合法操作', rejected }
        }
        const diff = buildChangeDiff(ops)
        const id = `prop-${randomUUID().slice(0, 8)}`
        proposals.set(id, { id, instruction, ops, diffText: formatChangeDiff(diff), createdAt: new Date().toISOString() })
        return {
          status: `已生成变更预览（${String(ops.length)} 个操作）。向用户展示 diff，确认后用 action=apply + proposal_id 执行。`,
          proposal_id: id,
          diff: formatChangeDiff(diff),
          ...(rejected.length === 0 ? {} : { rejected }),
        }
      }
      if (args.action === 'apply') {
        const proposalId = args.proposal_id ?? ''
        const proposal = proposals.get(proposalId)
        if (proposal === undefined) throw new Error(`kg_edit apply: unknown proposal_id "${proposalId}" (propose first; proposals are process-scoped)`)
        proposals.delete(proposalId)
        const typeIds = graph.listNodeTypes().map(type => String(type.id))
        const now = new Date().toISOString()
        const episodeUuid = `ai-edit:${now}`
        const addedEdgeIds: string[] = []
        const retiredEdgeIds: string[] = []
        const applied: number[] = []
        const rejected: string[] = []
        for (const op of proposal.ops) {
          if (op.op === 'add_edge') {
            const dstFirst = await resolveEndpoint(graph, tenant, op.dst.name, op.dst.type, typeIds)
            // A missing source type falls back to the relation's legal domain
            // for the resolved range — a new entity lands on the type the
            // direction constraint itself names (never an invented one).
            const addRelation = graph.relation(op.relation)
            const legalPair = addRelation?.constraints.find(
              pair => String(pair.range) === String(dstFirst.type),
            ) ?? addRelation?.constraints[0]
            const inferredDomain = legalPair === undefined ? undefined : String(legalPair.domain)
            let src = await resolveEndpoint(graph, tenant, op.src.name, op.src.type ?? inferredDomain, typeIds)
            let dst = dstFirst
            // SHACL-style precheck: the direction pair must be registry-legal.
            // A violation first retries the relation's legal pairs against
            // EXISTING nodes (the plan's type labels are advisory; the graph
            // owns the truth) before the op rejects.
            let violations = graph.validateEdge(op.relation, src.type, dst.type)
            if (violations.length > 0) {
              const relationEntry = graph.relation(op.relation)
              // The relation id survived the propose-time closed-set check against this same registry.
              /* v8 ignore next -- an op relation is always registered when apply runs. */
              for (const pair of relationEntry?.constraints ?? []) {
                const [retryDst] = await graph.searchNodes(tenant, op.dst.name, pair.range, 1)
                if (retryDst === undefined) continue
                const [retrySrc] = await graph.searchNodes(tenant, op.src.name, pair.domain, 1)
                // A to-be-created source keeps its inferred (constraint-named)
                // type when no existing node carries it.
                const srcCandidate = retrySrc === undefined && src.created && String(src.type) === String(pair.domain)
                  ? src
                  : retrySrc === undefined ? undefined : { id: retrySrc.id, name: retrySrc.name, type: retrySrc.type, created: false }
                if (srcCandidate === undefined) continue
                // Both retry endpoints come from typed searches over this very constraint pair, so the pair always validates.
                /* v8 ignore next -- a retried pair is legal by construction. */
                if (graph.validateEdge(op.relation, srcCandidate.type, retryDst.type).length === 0) {
                  src = srcCandidate
                  dst = { id: retryDst.id, name: retryDst.name, type: retryDst.type, created: false }
                  violations = []
                  break
                }
              }
            }
            if (violations.length > 0) {
              rejected.push(`add_edge ${op.src.name} —[${String(op.relation)}]→ ${op.dst.name}: ${violations.map(v => v.message).join('; ')}`)
              continue
            }
            if (src.created) {
              await graph.upsertNode({
                id: src.id, tenantId: tenant, type: src.type, naturalKey: src.name, name: src.name,
                createdAt: now, updatedAt: now,
                summary: `ai-edit 新建实体（episode ${episodeUuid}）`,
              })
            }
            if (dst.created) {
              await graph.upsertNode({
                id: dst.id, tenantId: tenant, type: dst.type, naturalKey: dst.name, name: dst.name,
                createdAt: now, updatedAt: now,
                summary: `ai-edit 新建实体（episode ${episodeUuid}）`,
              })
            }
            // Contradiction resolution: a live ai-edit edge on the same
            // (src, dst, relation) retires first — the new fact supersedes.
            for (const existing of await graph.liveEdgesBetween(tenant, src.id, dst.id, op.relation)) {
              if (existing.provenance.sourceSystem === AI_EDIT_SOURCE_SYSTEM) {
                retiredEdgeIds.push(existing.id)
              }
            }
            if (retiredEdgeIds.length > 0) await graph.expireEdges(retiredEdgeIds, now)
            const edgeId = `${AI_EDIT_SOURCE_SYSTEM}:${now}:${src.id}:${String(op.relation)}:${dst.id}`
            const edge: KgEdge = {
              id: edgeId,
              tenantId: tenant,
              srcId: src.id,
              dstId: dst.id,
              relation: op.relation,
              ...(op.fact === undefined ? {} : { fact: op.fact }),
              confidence: 0.9,
              provenance: { sourceSystem: 'ai-edit', sourceId: episodeUuid, extractedAt: now },
              validFrom: now,
            }
            await graph.upsertEdges([edge])
            addedEdgeIds.push(edgeId)
            applied.push(1)
            continue
          }
          if (op.op === 'remove_edge') {
            // Name-keyed candidate sweep: same-name entities live under
            // several ids (doc entity vs business row); retire every live
            // edge of the relation between ANY candidate pair.
            const srcCandidates = await graph.searchNodes(tenant, op.src.name, undefined, 5)
            const dstCandidates = await graph.searchNodes(tenant, op.dst.name, undefined, 5)
            const ids: string[] = []
            for (const srcHit of srcCandidates) {
              for (const dstHit of dstCandidates) {
                for (const edge of await graph.liveEdgesBetween(tenant, srcHit.id, dstHit.id, op.relation)) {
                  ids.push(edge.id)
                }
              }
            }
            if (ids.length === 0) {
              rejected.push(`remove_edge: ${op.src.name} —[${String(op.relation)}]→ ${op.dst.name} 无在效边`)
              continue
            }
            const unique = [...new Set(ids)]
            await graph.expireEdges(unique, now)
            retiredEdgeIds.push(...unique)
            applied.push(1)
            continue
          }
          rejected.push(`op ${op.op} 未在 apply 实现`)
        }
        await graph.putEpisode({
          uuid: episodeUuid,
          tenantId: tenant,
          source: 'ai-edit',
          name: proposal.instruction.slice(0, 60),
          content: proposal.instruction,
          validAt: now,
          createdAt: now,
          metadata: {
            diff: proposal.diffText,
            ops: proposal.ops,
            addedEdgeIds,
            retiredEdgeIds,
            rejected,
          },
        })
        const touched = [...new Set([...addedEdgeIds, ...retiredEdgeIds])]
        if (touched.length > 0) await graph.linkMentions(episodeUuid, touched)
        return {
          status: `已应用 ${String(applied.length)} 个操作并落 episode ${episodeUuid}`,
          episode_uuid: episodeUuid,
          applied: applied.length,
          diff: proposal.diffText,
          ...(rejected.length === 0 ? {} : { rejected }),
        }
      }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- the wire schema admits any action string.
      if (args.action === 'rollback') {
        const episodeUuid = args.episode_uuid ?? ''
        const episodes = await graph.listEpisodes(tenant, 100)
        const target = episodes.find(row => row.uuid === episodeUuid)
        if (target === undefined) throw new Error(`kg_edit rollback: episode "${episodeUuid}" not found (action=episodes lists uuids)`)
        if (target.source === 'rollback') throw new Error('kg_edit rollback: a rollback episode cannot be rolled back')
        const edgeIds = await graph.edgeIdsOfEpisode(episodeUuid)
        const now = new Date().toISOString()
        const metadata = target.metadata as { addedEdgeIds?: string[]; retiredEdgeIds?: string[] } | undefined
        const added = new Set(metadata?.addedEdgeIds ?? [])
        const retired = new Set(metadata?.retiredEdgeIds ?? [])
        const toRetire: string[] = []
        const toRestore: string[] = []
        for (const edgeId of edgeIds) {
          if (added.has(edgeId)) toRetire.push(edgeId)
          else if (retired.has(edgeId)) toRestore.push(edgeId)
        }
        if (toRetire.length > 0) await graph.expireEdges(toRetire, now)
        if (toRestore.length > 0) await graph.restoreEdges(toRestore, now)
        const rollbackUuid = `rollback:${now}`
        await graph.putEpisode({
          uuid: rollbackUuid,
          tenantId: tenant,
          source: 'rollback',
          name: `回滚 ${target.name}`,
          content: args.reason === undefined ? `回滚 episode ${episodeUuid}（${target.name}）` : `回滚 episode ${episodeUuid}：${args.reason}`,
          validAt: now,
          createdAt: now,
          metadata: { rolledBack: episodeUuid, retired: toRetire, restored: toRestore },
        })
        if (edgeIds.length > 0) await graph.linkMentions(rollbackUuid, edgeIds)
        return {
          status: `已回滚 episode ${episodeUuid}（失效 ${String(toRetire.length)} 条边、恢复 ${String(toRestore.length)} 条边）`,
          episode_uuid: rollbackUuid,
          applied: toRetire.length + toRestore.length,
        }
      }
      // The wire schema admits any action string; the closed union above is exhausted at the type level.
      throw new Error(`kg_edit: unknown action "${String(args.action)}"`)
    },
    presentCall: args => ({
      card: 'generic' as const,
      title: 'kg_edit',
      kind: 'edit',
      rawInput: `${args.action} ${args.instruction ?? args.proposal_id ?? args.episode_uuid ?? ''}`.trim(),
    }),
    presentResult: (args: KgEditArgs, result: ToolResult) => {
      if (result.isError) return undefined
      const meta = result.meta as { status?: unknown; applied?: unknown } | undefined
      const status = typeof meta?.status === 'string' ? meta.status : 'done'
      return {
        card: 'generic' as const,
        title: 'kg_edit',
        content: [{ type: 'text', text: `${args.action} · ${status}` }],
      }
    },
  }))
}
