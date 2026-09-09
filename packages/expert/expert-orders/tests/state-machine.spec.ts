/**
 * The order state machine's closed status set and transition table: the four
 * statuses, the legal transitions (pending→generating, generating→delivered
 * or failed, failed→generating as the retry path), the refused ones
 * (delivered is terminal; skipping states is illegal), and the narrow status
 * guard for opaque NocoBase rows.
 */

import { describe, expect, it } from 'vitest'
import { assertOrderStatus, canTransition, ORDER_STATUSES } from '../src/state-machine.ts'
import { OrdersError } from '../src/types.ts'

describe('order status set', () => {
  it('is exactly the four documented statuses', () => {
    expect([...ORDER_STATUSES]).toEqual(['pending', 'generating', 'delivered', 'failed'])
  })

  it('narrows a valid status and rejects anything else loudly', () => {
    expect(assertOrderStatus('pending')).toBe('pending')
    expect(assertOrderStatus('delivered')).toBe('delivered')
    expect(() => assertOrderStatus('approved')).toThrow(OrdersError)
    expect(() => assertOrderStatus('')).toThrow(OrdersError)
    expect(() => assertOrderStatus(42)).toThrow(OrdersError)
  })
})

describe('canTransition', () => {
  it('allows the documented legal transitions', () => {
    expect(canTransition('pending', 'generating')).toBe(true)
    expect(canTransition('generating', 'delivered')).toBe(true)
    expect(canTransition('generating', 'failed')).toBe(true)
    expect(canTransition('failed', 'generating')).toBe(true)
  })

  it('refuses terminal, skipped, and reversed transitions', () => {
    // delivered is terminal
    expect(canTransition('delivered', 'generating')).toBe(false)
    expect(canTransition('delivered', 'failed')).toBe(false)
    // no state skipping
    expect(canTransition('pending', 'delivered')).toBe(false)
    expect(canTransition('pending', 'failed')).toBe(false)
    // no reversal out of generating
    expect(canTransition('generating', 'pending')).toBe(false)
    expect(canTransition('failed', 'pending')).toBe(false)
    expect(canTransition('failed', 'delivered')).toBe(false)
    // no self transitions
    expect(canTransition('pending', 'pending')).toBe(false)
    expect(canTransition('failed', 'failed')).toBe(false)
  })
})
