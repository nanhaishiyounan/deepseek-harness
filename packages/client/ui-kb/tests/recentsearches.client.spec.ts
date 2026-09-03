// @vitest-environment jsdom
// The recent-search log: recency ordering, deduplication, the five-entry cap,
// clearing, and the corrupted-entry fallback.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { noteRecentSearch, recentSearches, clearRecentSearches, RECENT_SEARCH_LIMIT } from '../src/client/recentSearches.ts'

afterEach(() => {
  clearRecentSearches()
})

describe('recent searches', () => {
  it('records queries newest first and deduplicates re-runs', () => {
    noteRecentSearch('山梨酸 酱油')
    noteRecentSearch('车间虫控')
    expect(recentSearches()).toEqual(['车间虫控', '山梨酸 酱油'])
    noteRecentSearch('山梨酸 酱油')
    expect(recentSearches()).toEqual(['山梨酸 酱油', '车间虫控'])
  })

  it('caps the log at the limit and trims blank queries', () => {
    for (let index = 0; index < RECENT_SEARCH_LIMIT + 2; index += 1) {
      noteRecentSearch(`query-${index}`)
    }
    expect(recentSearches()).toHaveLength(RECENT_SEARCH_LIMIT)
    expect(recentSearches()[0]).toBe(`query-${RECENT_SEARCH_LIMIT + 1}`)
    noteRecentSearch('   ')
    expect(recentSearches()[0]).toBe(`query-${RECENT_SEARCH_LIMIT + 1}`)
  })

  it('clears every entry', () => {
    noteRecentSearch('蚝油')
    clearRecentSearches()
    expect(recentSearches()).toEqual([])
  })

  it('reads a corrupted persisted entry as empty', () => {
    localStorage.setItem('dsh-kb-recent-searches', '{not json')
    expect(recentSearches()).toEqual([])
    noteRecentSearch('酱油')
    expect(recentSearches()).toEqual(['酱油'])
  })

  it('reads a non-array persisted entry as empty', () => {
    localStorage.setItem('dsh-kb-recent-searches', '42')
    expect(recentSearches()).toEqual([])
  })

  it('serves the in-memory log when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      expect(recentSearches()).toEqual([])
      noteRecentSearch('蚝油')
      expect(recentSearches()).toEqual(['蚝油'])
      clearRecentSearches()
      expect(recentSearches()).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
