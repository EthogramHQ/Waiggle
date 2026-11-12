// Tests des retours réglés dans la logique de la feuille « Nouvelle mise à jour » (R7b) : une case
// cochée dans « Retours réglés » est une modification (fermer la feuille demande avant de la
// perdre), et les cases cochées partent avec la mise à jour en `settledFeedbackIds`, acceptées par
// le contrat de l'API.
import { NewProjectUpdate } from '@ruche/contracts'
import { emptyLine, isDirty, toPayload, type UpdateFormValues } from './form'

const INES = 'cccccccc-cccc-4ccc-8ccc-000000000001'
const MALIK = 'cccccccc-cccc-4ccc-8ccc-000000000003'

const opened = (): UpdateFormValues => ({
  title: '',
  version: '',
  lines: [emptyLine()],
  beforeAfter: false,
})
const written = (settledIds?: string[]): UpdateFormValues => ({
  ...opened(),
  lines: [{ ...emptyLine('fixed'), text: 'Le score ne repart plus à zéro au niveau 3' }],
  ...(settledIds ? { settledIds } : null),
})

describe('settled feedback in the update form', () => {
  it('counts a checked feedback as a change', () => {
    const initial = opened()

    expect(isDirty(initial, { ...initial, settledIds: [INES] }, [])).toBe(true)
    // Témoin : sans case cochée, la feuille ouverte n'a pas changé.
    expect(isDirty(initial, { ...initial, settledIds: [] }, [])).toBe(false)
  })

  it('is not changed when the same feedback are checked in another order', () => {
    const initial = { ...opened(), settledIds: [INES, MALIK] }

    expect(isDirty(initial, { ...initial, settledIds: [MALIK, INES] }, [])).toBe(false)
  })

  it('sends the checked feedback as settledFeedbackIds, once each', () => {
    const result = toPayload(written([INES, MALIK, INES]), [])
    if (!result.ok) throw new Error(`toPayload refused the form: ${result.error}`)

    expect(result.payload.settledFeedbackIds).toEqual([INES, MALIK])
    expect(NewProjectUpdate.safeParse(result.payload).success).toBe(true)
  })

  it('sends no settledFeedbackIds when nothing is checked', () => {
    const result = toPayload(written([]), [])
    if (!result.ok) throw new Error(`toPayload refused the form: ${result.error}`)

    expect('settledFeedbackIds' in result.payload).toBe(false)
  })
})
