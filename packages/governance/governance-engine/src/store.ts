/**
 * SQLite storage for the governance engine: lineage edges, quality rules,
 * and alert events. One file, three tables, straightforward STRICT schema;
 * the schema owns its database (application id + version, fresh-or-reject).
 * @module @deepseek-ai/dsh-governance-engine/store
 */

import { mkdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { dirname } from 'node:path'
import type { AlertEvent, AlertLevel, LineageEdge, QualityRule } from '@deepseek-ai/dsh-governance'
import type { GovernanceSource } from '@deepseek-ai/dsh-governance'

/** Schema version; pre-release builds reject any other on-disk version. */
const SCHEMA_VERSION = 1

/** Application id reserved for the governance engine ("DSHG"). */
const APPLICATION_ID = 1146308615

/** JSON-scalar guard for stored rows. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

/** Parse a stored events row into an AlertEvent. */
function eventOf(row: Record<string, unknown>): AlertEvent {
  return {
    id: Number(row.id),
    at: text(row.at),
    kind: text(row.kind),
    level: text(row.level) as AlertLevel,
    title: text(row.title),
    ...(row.detail === null ? {} : { detail: text(row.detail) }),
  }
}

/** Parse a stored rules row into a QualityRule. */
function ruleOf(row: Record<string, unknown>): QualityRule {
  return {
    id: text(row.id),
    name: text(row.name),
    kind: text(row.kind) as QualityRule['kind'],
    table: text(row.table),
    ...(row.column === null ? {} : { column: text(row.column) }),
    ...(row.threshold === null ? {} : { threshold: Number(row.threshold) }),
    ...(row.sql === null ? {} : { sql: text(row.sql) }),
    enabled: Number(row.enabled) === 1,
  }
}

/**
 * Open (and if needed initialize) the governance store.
 * @param path - database file path; the parent directory is created.
 * @returns the opened database handle.
 */
export async function openStore(path: string): Promise<DatabaseSync> {
  if (path !== ':memory:') await mkdir(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = FULL')
  const version = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  const onDisk = version?.user_version ?? 0
  if (onDisk !== 0 && onDisk !== SCHEMA_VERSION) {
    db.close()
    throw new Error(`governance store at "${path}" has schema version ${onDisk}, incompatible with this build (${SCHEMA_VERSION})`)
  }
  if (onDisk === 0) {
    db.exec(`
      CREATE TABLE lineage_edges (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        transform TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        UNIQUE (source, target, transform)
      ) STRICT;
      CREATE TABLE quality_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        "table" TEXT NOT NULL,
        "column" TEXT,
        threshold REAL,
        sql TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE TABLE alert_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        kind TEXT NOT NULL,
        level TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT
      ) STRICT;
      CREATE INDEX idx_events_at ON alert_events (at DESC);
    `)
    db.exec(`PRAGMA application_id = ${String(APPLICATION_ID)}`)
    db.exec(`PRAGMA user_version = ${String(SCHEMA_VERSION)}`)
  }
  return db
}

/** All recorded lineage edges, ordered by source then target. */
export function readEdges(db: DatabaseSync): LineageEdge[] {
  return (db.prepare('SELECT source, target, transform, recorded_at FROM lineage_edges ORDER BY source, target').all() as Record<string, unknown>[])
    .map(row => ({ source: text(row.source), target: text(row.target), transform: text(row.transform), recordedAt: text(row.recorded_at) }))
}

/**
 * Upsert lineage edges keyed by (source, target, transform).
 * @param db - the store handle.
 * @param edges - the edges to record.
 */
export function writeEdges(db: DatabaseSync, edges: readonly LineageEdge[]): void {
  const upsert = db.prepare('INSERT INTO lineage_edges (source, target, transform, recorded_at) VALUES (?, ?, ?, ?) ON CONFLICT (source, target, transform) DO UPDATE SET recorded_at = excluded.recorded_at')
  for (const edge of edges) upsert.run(edge.source, edge.target, edge.transform, edge.recordedAt)
}

/** All quality rules in id order. */
export function readRules(db: DatabaseSync): QualityRule[] {
  return (db.prepare('SELECT * FROM quality_rules ORDER BY id').all() as Record<string, unknown>[]).map(ruleOf)
}

/**
 * Insert or replace one quality rule.
 * @param db - the store handle.
 * @param rule - the rule as it should be stored.
 */
export function writeRule(db: DatabaseSync, rule: QualityRule): void {
  db.prepare('INSERT INTO quality_rules (id, name, kind, "table", "column", threshold, sql, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, "table" = excluded."table", "column" = excluded."column", threshold = excluded.threshold, sql = excluded.sql, enabled = excluded.enabled')
    .run(rule.id, rule.name, rule.kind, rule.table, rule.column ?? null, rule.threshold ?? null, rule.sql ?? null, rule.enabled ? 1 : 0)
}

/**
 * Delete one quality rule.
 * @param db - the store handle.
 * @param id - the rule id.
 */
export function removeRule(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM quality_rules WHERE id = ?').run(id)
}

/** All alert events, newest first. */
export function readEvents(db: DatabaseSync, limit = 200): AlertEvent[] {
  return (db.prepare('SELECT * FROM alert_events ORDER BY at DESC, id DESC LIMIT ?').all(limit) as Record<string, unknown>[]).map(eventOf)
}

/**
 * Append one alert event.
 * @param db - the store handle.
 * @param event - the event fields (id and at are generated).
 * @returns the stored event with its id and timestamp.
 */
export function writeEvent(db: DatabaseSync, event: Omit<AlertEvent, 'id'>): AlertEvent {
  const at = event.at
  const result = db.prepare('INSERT INTO alert_events (at, kind, level, title, detail) VALUES (?, ?, ?, ?, ?)').run(at, event.kind, event.level, event.title, event.detail ?? null)
  return { ...event, id: Number(result.lastInsertRowid) }
}

/** The source ordering the inventory search presents. */
export const SOURCE_ORDER: readonly GovernanceSource[] = ['lakehouse', 'business', 'kb', 'graph', 'ontology', 'legacy']
