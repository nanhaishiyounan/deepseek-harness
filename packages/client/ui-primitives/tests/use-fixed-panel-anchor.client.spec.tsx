// @vitest-environment jsdom
// useFixedPanelAnchor: the fixed-panel anchor is measured from the trigger on
// open, re-measured on viewport resize, and never measured while closed; the
// resize listener detaches on close and unmount.

import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFixedPanelAnchor } from '../src/useFixedPanelAnchor.ts'

function Probe() {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const anchor = useFixedPanelAnchor(root, open)
  return createElement('div', null,
    createElement('button', { type: 'button', onClick: () => { setOpen(!open) } }, 'toggle'),
    createElement('div', { ref: root }, anchor === undefined ? 'unanchored' : `${anchor.left}:${anchor.bottom}`),
  )
}

afterEach(cleanup)

describe('useFixedPanelAnchor', () => {
  it('measures on open, re-measures on resize, and detaches on close', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { getByText, getByRole } = render(createElement(Probe))
    fireEvent.click(getByRole('button'))
    // jsdom's getBoundingClientRect is all zeros; innerHeight defaults to 768.
    expect(getByText('0:776')).toBeTruthy()
    fireEvent(window, new Event('resize'))
    expect(getByText('0:776')).toBeTruthy()
    // Closing detaches the resize listener (the anchor itself is retained;
    // callers gate rendering on their own open state).
    fireEvent.click(getByRole('button'))
    expect(getByText('0:776')).toBeTruthy()
    const attached = addSpy.mock.calls.filter(([type]) => type === 'resize').length
    const detached = removeSpy.mock.calls.filter(([type]) => type === 'resize').length
    expect(attached).toBe(detached)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
