// Tests de la fabrication des étiquettes d'outils (« Claude Code » → « claude-code »).
import { describe, expect, it } from 'vitest'
import { TOOL_SLUG_MAX, toolSlug } from './slug'

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

  it('cuts a long tag at a dash, never inside a word, and never ends it with a dash', () => {
    // sec-A1 : au plus TOOL_SLUG_MAX caractères. Ici 30 mots de 4 lettres (149 caractères) : on
    // garde les 24 premiers mots entiers (119 caractères), sans le tiret qui les suivait.
    const words = Array.from({ length: 30 }, (_, i) => `w${String(i).padStart(3, '0')}`)
    expect(toolSlug(words.join(' '))).toBe(words.slice(0, 24).join('-'))
    // Les symboles : 40 emoji donnent 17 numéros entiers (17 × 7 - 1 = 118 caractères).
    const robots = toolSlug(String.fromCodePoint(0x1f916).repeat(40))
    expect(robots).toBe(Array.from({ length: 17 }, () => 'u1f916').join('-'))
    // Un seul mot trop long, sans tiret où couper : coupé net à la borne.
    expect(toolSlug('a'.repeat(TOOL_SLUG_MAX + 5))).toBe('a'.repeat(TOOL_SLUG_MAX))
  })
})
