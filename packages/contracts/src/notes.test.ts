// Tests du contrat des notes d'un projet (tranche 4b).
import { describe, expect, it } from 'vitest'
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
