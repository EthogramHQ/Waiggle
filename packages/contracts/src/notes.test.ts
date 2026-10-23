// Tests du contrat des notes d'un projet (tranche 4b).
import { describe, expect, it } from 'vitest'
import { FeedItem } from './feed'
import { NewProjectNote, PROJECT_NOTE_MAX } from './notes'

describe('NewProjectNote', () => {
  it('accepts a short note over several lines, trimmed', () => {
    expect(NewProjectNote.parse({ body: '  v2 : mode hors ligne.\nEt plus rapide.  ' })).toEqual({
      body: 'v2 : mode hors ligne.\nEt plus rapide.',
    })
  })

  it('refuses an empty note, even made of spaces', () => {
    expect(NewProjectNote.safeParse({ body: '' }).success).toBe(false)
    expect(NewProjectNote.safeParse({ body: '   \n  ' }).success).toBe(false)
  })

  it('refuses a note longer than 1 000 characters', () => {
    expect(NewProjectNote.safeParse({ body: 'a'.repeat(PROJECT_NOTE_MAX) }).success).toBe(true)
    expect(NewProjectNote.safeParse({ body: 'a'.repeat(PROJECT_NOTE_MAX + 1) }).success).toBe(false)
  })

  it('refuses invisible and control characters', () => {
    for (const body of ['note​', 'note\u0007', 'note‮']) {
      expect(NewProjectNote.safeParse({ body }).success).toBe(false)
    }
  })
})

describe('FeedItem, a note', () => {
  it('describes the note of a followed project, with the project it belongs to', () => {
    const item = {
      kind: 'note',
      at: '2026-10-19T09:00:00.000Z',
      note: {
        id: '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f7',
        body: 'v2 : mode hors ligne.',
        createdAt: '2026-10-19T09:00:00.000Z',
        removal: null,
      },
      project: {
        id: '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6',
        author: { id: 'lea-id', name: 'Léa', avatarUrl: null },
        title: 'Mon agent de recettes',
        pitch: 'Un menu avec ce qu’il y a au frigo.',
        status: 'testable',
        visibility: 'public',
        tools: [],
        cover: null,
        portraitCover: null,
        createdAt: '2026-10-18T08:30:00.000Z',
        updatedAt: '2026-10-18T08:30:00.000Z',
      },
    }
    expect(FeedItem.parse(item)).toEqual(item)
  })
})
