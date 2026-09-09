/**
 * The order lifecycle state machine: the closed status set, the legal
 * transition table, and the opaque-row status guard. `delivered` is terminal;
 * `failed` retries through a fresh `generating`.
 * @module @deepseek-ai/dsh-expert-orders/state-machine
 */

import { OrdersError } from './types.ts'
import type { OrderStatus } from './types.ts'

/** The closed order status set, in lifecycle order. */
export const ORDER_STATUSES = ['pending', 'generating', 'delivered', 'failed'] as const

/** Legal transitions: pending/failed enter `generating`; `generating` settles to delivered or failed. */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ['generating'],
  generating: ['delivered', 'failed'],
  delivered: [],
  failed: ['generating'],
}

/**
 * Whether one status may move directly to another.
 * @param from - the current status.
 * @param to - the intended status.
 * @returns true when the transition table admits the move.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * Narrow an opaque stored status to the closed set.
 * @param value - the status cell as read from the orders row.
 * @returns the validated status.
 * @throws {OrdersError} `ORDERS_STATUS_INVALID` when the value is foreign to the set.
 */
export function assertOrderStatus(value: unknown): OrderStatus {
  const status = ORDER_STATUSES.find(entry => entry === value)
  if (status === undefined) {
    throw new OrdersError(`order status "${String(value)}" is outside the closed set ${ORDER_STATUSES.join('/')}`, 'ORDERS_STATUS_INVALID')
  }
  return status
}
