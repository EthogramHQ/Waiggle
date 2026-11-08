// Tests ajoutés par l'interface (R6a, U3b) au champ d'un prompt : un texte reçu de l'écran (un
// brouillon rouvert) qui contient encore des caractères invisibles est nettoyé dès son arrivée, et
// dit comme un collage. Le champ ne montre jamais un autre texte que celui qui sera publié.
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PromptField } from './PromptField'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Les caractères invisibles s'écrivent par leur numéro : écrits tels quels, on ne les verrait pas.
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)

const LABEL = fr.t(($) => $.project.prompts.starting)
const labels = {
  counter: (count: number, max: number) => ({
    shown: fr.t(($) => $.project.form.promptCounter, { count, max }),
    spoken: fr.t(($) => $.project.form.promptCounterSpoken, { count, max }),
  }),
  invisibleRemoved: (count: number) => fr.t(($) => $.project.form.invisibleRemoved, { count }),
  keyFound: (masked: string) => fr.t(($) => $.project.form.keyFound, { masked }),
  keyWarning: fr.t(($) => $.project.form.keyWarning),
  keyRevoke: fr.t(($) => $.project.form.keyRevoke),
  removeKey: fr.t(($) => $.project.form.removeKey),
  removeKeyNamed: (masked: string) => fr.t(($) => $.project.form.removeKeyNamed, { masked }),
}

function Field({ initial, onChange }: { initial: string; onChange: (text: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <PromptField
      label={LABEL}
      value={value}
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
      max={4000}
      hint={fr.t(($) => $.project.form.promptHint)}
      labels={labels}
      removedPlaceholder={fr.t(($) => $.project.form.keyRemoved)}
    />
  )
}

describe('PromptField, a text received from the screen', () => {
  it('cleans invisible characters it receives and says how many', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field initial={`Bon${ZERO_WIDTH_SPACE}jour`} onChange={onChange} />)

    expect(onChange).toHaveBeenLastCalledWith('Bonjour')
    expect(screen.getByLabelText(LABEL).props.value).toBe('Bonjour')
    expect(screen.getByText(labels.invisibleRemoved(1))).toBeTruthy()
  })

  it('leaves a clean text untouched, and hides the line once the field is emptied', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field initial="Bonjour" onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()

    await fireEvent.changeText(screen.getByLabelText(LABEL), `Salut${ZERO_WIDTH_SPACE}`)
    expect(screen.getByText(labels.invisibleRemoved(1))).toBeTruthy() // témoin

    await fireEvent.changeText(screen.getByLabelText(LABEL), '')
    expect(screen.queryByText(labels.invisibleRemoved(1))).toBeNull()
  })
})
