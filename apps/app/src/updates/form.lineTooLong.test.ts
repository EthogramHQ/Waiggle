// Test de la relecture de design R7a, C1 : une ligne de plus de 120 caractères est refusée par
// `toPayload` avant l'envoi (l'API répondrait 400, et la feuille dirait « Réessaie », ce qui ne
// réglerait rien). Le refus nomme la ligne fautive, pour que la feuille la marque et lui rende le
// focus.
import { UPDATE_LINE_MAX } from '@ruche/contracts'
import { emptyLine, toPayload, type UpdateFormValues } from './form'

const withLines = (...texts: string[]): UpdateFormValues => ({
  title: '',
  version: '',
  lines: texts.map((text) => ({ ...emptyLine('new'), text })),
  beforeAfter: false,
})

describe('toPayload, a line over the limit', () => {
  it('refuses a line of 121 characters and names it', () => {
    const values = withLines('Une ligne correcte', 'é'.repeat(UPDATE_LINE_MAX + 1))

    expect(toPayload(values, [])).toEqual({
      ok: false,
      error: 'lineTooLong',
      lineId: values.lines[1]?.id,
    })
  })

  it('accepts a line of exactly 120 characters (témoin)', () => {
    const result = toPayload(withLines('é'.repeat(UPDATE_LINE_MAX)), [])

    expect(result.ok).toBe(true)
  })

  it('counts the text without the blanks around it, as the contract does', () => {
    const result = toPayload(withLines(`  ${'a'.repeat(UPDATE_LINE_MAX)}  `), [])

    expect(result.ok).toBe(true)
  })

  it('names the first of two lines that are too long', () => {
    const values = withLines('a'.repeat(130), 'b'.repeat(140))

    expect(toPayload(values, [])).toMatchObject({
      error: 'lineTooLong',
      lineId: values.lines[0]?.id,
    })
  })
})
