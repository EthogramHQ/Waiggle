// Tests des règles du formulaire de profil (fonctions pures : pas d'écran, pas de réseau).
import { parseTools, toProfileUpdate } from './form'

describe('parseTools', () => {
  it('splits the text on commas and drops empty entries', () => {
    expect(parseTools('Claude,  Midjourney , ,')).toEqual(['Claude', 'Midjourney'])
  })

  it('gives an empty list for an empty text', () => {
    expect(parseTools('   ')).toEqual([])
  })
})

describe('toProfileUpdate', () => {
  const valid = { name: ' Léa ', bio: 'Je bricole.', tools: 'Claude, claude, Cursor' }

  it('prepares the changes to send, trimmed and without duplicate tools', () => {
    expect(toProfileUpdate(valid)).toEqual({
      ok: true,
      changes: { name: 'Léa', bio: 'Je bricole.', favoriteTools: ['Claude', 'Cursor'] },
    })
  })

  it('asks for a name', () => {
    expect(toProfileUpdate({ ...valid, name: '  ' })).toEqual({
      ok: false,
      errors: { name: 'nameRequired' },
    })
  })

  it('refuses a name longer than 80 characters', () => {
    expect(toProfileUpdate({ ...valid, name: 'a'.repeat(81) })).toEqual({
      ok: false,
      errors: { name: 'nameTooLong' },
    })
  })

  it('refuses a bio longer than 280 characters', () => {
    expect(toProfileUpdate({ ...valid, bio: 'a'.repeat(281) })).toEqual({
      ok: false,
      errors: { bio: 'bioTooLong' },
    })
  })

  it('refuses more than 10 tools', () => {
    const tools = Array.from({ length: 11 }, (_, i) => `Outil ${i}`).join(',')
    expect(toProfileUpdate({ ...valid, tools })).toEqual({
      ok: false,
      errors: { tools: 'tooManyTools' },
    })
  })

  it('refuses a tool name longer than 40 characters', () => {
    expect(toProfileUpdate({ ...valid, tools: `Claude, ${'a'.repeat(41)}` })).toEqual({
      ok: false,
      errors: { tools: 'toolTooLong' },
    })
  })

  it('refuses invisible characters that could fake another name', () => {
    expect(toProfileUpdate({ ...valid, name: 'Léa\u202Enimda' })).toEqual({
      ok: false,
      errors: { name: 'invalidCharacters' },
    })
  })
})

describe('toProfileUpdate, the handle (slice 6a)', () => {
  const valid = { name: 'Léa', bio: '', tools: '', handle: 'lea' }

  it('leaves out a handle that did not change, even typed again with « @ » and capitals', () => {
    const unchanged = { ok: true, changes: { name: 'Léa', bio: '', favoriteTools: [] } }
    expect(toProfileUpdate(valid, 'lea')).toEqual(unchanged)
    expect(toProfileUpdate({ ...valid, handle: ' @Lea ' }, 'lea')).toEqual(unchanged)
  })

  it('sends a new handle, cleaned up', () => {
    expect(toProfileUpdate({ ...valid, handle: '@Lea_M' }, 'lea')).toMatchObject({
      ok: true,
      changes: { handle: 'lea_m' },
    })
  })

  it('names the problem of a handle by its kind', () => {
    const errorOf = (handle: string) => toProfileUpdate({ ...valid, handle }, 'lea')
    expect(errorOf('le')).toEqual({ ok: false, errors: { handle: 'handleTooShort' } })
    expect(errorOf('l'.repeat(21))).toEqual({ ok: false, errors: { handle: 'handleTooLong' } })
    expect(errorOf('1lea')).toEqual({ ok: false, errors: { handle: 'handleInvalid' } })
    expect(errorOf('admin')).toEqual({ ok: false, errors: { handle: 'handleReserved' } })
  })

  it('does not check a handle left as it was, so an old one never blocks the rest', () => {
    expect(toProfileUpdate({ ...valid, handle: 'admin' }, 'admin')).toMatchObject({ ok: true })
  })
})
