// Tests de la fabrication des étiquettes d'outils (« Claude Code » → « claude-code »).
import { describe, expect, it } from 'vitest'
import { toolSlug } from './slug'

describe('toolSlug', () => {
  it('gives the same tag whatever the case, accents or punctuation', () => {
    expect(toolSlug('Claude Code')).toBe('claude-code')
    expect(toolSlug('claude-code')).toBe('claude-code')
    expect(toolSlug('  CLAUDE   code ')).toBe('claude-code')
    expect(toolSlug('Éclair 2.0')).toBe('eclair-2-0')
  })

  it('keeps letters of other alphabets', () => {
    expect(toolSlug('Клод')).toBe('клод')
    expect(toolSlug('通义千问')).toBe('通义千问')
  })

  it('still gives a tag to a name made only of symbols', () => {
    expect(toolSlug('🤖')).toBe('u1f916')
  })
})
