// @vitest-environment jsdom
/**
 * The rich narrative's fullscreen image viewer (R2): ImageViewer.Multi hands
 * its layer to the shell portal host through `getContainer={portalContainer}`
 * — the same mount point that keeps every antd-mobile layer inside the 430px
 * bezel on desktop. The real slide engine needs layout jsdom lacks, so the
 * probe replaces only ImageViewer.Multi and captures the prop contract.
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { portalContainer, setPortalHost } from '../src/client/portal.ts'
import { RichContent } from '../src/client/messages/RichContent.tsx'

const probe = vi.hoisted(() => ({ captured: [] as Array<{ getContainer?: unknown }> }))

vi.mock('antd-mobile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd-mobile')>()
  const MultiProbe = (props: { getContainer?: unknown }): null => {
    probe.captured.push(props)
    return null
  }
  return { ...actual, ImageViewer: { ...actual.ImageViewer, Multi: MultiProbe } }
})

describe('RichContent image viewer portal', () => {
  afterEach(() => {
    setPortalHost(null)
    probe.captured.length = 0
    cleanup()
    vi.unstubAllGlobals()
  })

  it('mounts the viewer through the shell portal host container', async () => {
    const host = document.createElement('div')
    setPortalHost(host)
    render(<RichContent text="示意图：\n\n![流程图](https://example.com/flow.png)" />)
    const image = await waitFor(() => {
      const el = document.querySelector('img[src="https://example.com/flow.png"]') as HTMLImageElement | null
      expect(el).not.toBeNull()
      return el as HTMLImageElement
    })
    fireEvent.click(image)
    await waitFor(() => { expect(probe.captured.length).toBeGreaterThan(0) })
    expect(probe.captured[0]?.getContainer).toBe(portalContainer)
    const resolve = probe.captured[0]?.getContainer as () => HTMLElement
    expect(resolve()).toBe(host)
  })
})
