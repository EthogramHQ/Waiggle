// Tests ajoutés à ceux de ProjectFormFields.test.tsx après les relectures de R6a (correcteur C3) :
// - sec-A2 : « Lien valide » suit le schéma du contrat (`DemoUrl`), longueur comprise. Une adresse
//   au-delà de DEMO_URL_MAX_LENGTH était cochée « valide », puis refusée par l'API (400) ;
// - les outils de la ligne « Outils » se lient selon la langue de l'appli (`Intl.ListFormat`), au
//   lieu d'une virgule écrite en dur.
import { DEMO_URL_MAX_LENGTH, DemoUrl } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { emptyProjectForm, type ProjectForm } from '../projects/form'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProjectFormFields, useProjectFieldRefs } from './ProjectFormFields'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TEXT = {
  demoUrl: fr.t(($) => $.project.form.demoUrl),
  demoValid: fr.t(($) => $.project.form.demoValid),
}

/** Les champs seuls, le formulaire gardé comme dans l'écran. */
function Fields({ start = emptyProjectForm }: { start?: ProjectForm }) {
  const [form, setForm] = useState(start)
  const fieldRefs = useProjectFieldRefs()
  return (
    <ProjectFormFields
      form={form}
      change={(key) => (value) => setForm((previous) => ({ ...previous, [key]: value }))}
      errors={{}}
      tiles={[]}
      photos={{ onAdd: jest.fn(), onDropFiles: jest.fn(), onMove: jest.fn(), onRemove: jest.fn() }}
      descriptions={{
        selectedKey: null,
        onSelect: jest.fn(),
        textOf: () => '',
        onChange: jest.fn(),
        onLeave: jest.fn(),
      }}
      onOpenCategories={jest.fn()}
      fieldRefs={fieldRefs}
    />
  )
}

describe('ProjectFormFields, the demo link against the contract (sec-A2)', () => {
  it('does not say « Lien valide » for an address longer than the contract allows', async () => {
    await renderWithProviders(<Fields />)
    const base = 'https://ciel-du-soir.fr/'
    const tooLong = `${base}${'a'.repeat(DEMO_URL_MAX_LENGTH - base.length + 1)}`
    // L'API la refuserait : c'est bien la longueur seule qui la rend invalide.
    expect(DemoUrl.safeParse(tooLong).success).toBe(false)
    expect(DemoUrl.safeParse(tooLong.slice(0, DEMO_URL_MAX_LENGTH)).success).toBe(true)

    await fireEvent.changeText(screen.getByLabelText(TEXT.demoUrl), tooLong)
    expect(screen.queryByText(containing(TEXT.demoValid))).toBeNull()

    // Témoin : la même adresse à la limite exacte est « valide ».
    await fireEvent.changeText(
      screen.getByLabelText(TEXT.demoUrl),
      tooLong.slice(0, DEMO_URL_MAX_LENGTH),
    )
    expect(screen.getByText(containing(TEXT.demoValid))).toBeTruthy()
  })
})

describe('ProjectFormFields, the tools in the language of the app', () => {
  afterEach(() => jest.restoreAllMocks())

  it('joins the tools of the « Outils » row with Intl.ListFormat, in the app language', async () => {
    const seen: { locale: unknown; options: unknown }[] = []
    // Un faux `Intl.ListFormat`, qui lie par « + » : la ligne doit passer par lui. Appelé par
    // `new`, il rend l'objet de la fausse fonction.
    jest.spyOn(Intl, 'ListFormat').mockImplementation(((locale: unknown, options: unknown) => {
      seen.push({ locale, options })
      return { format: (list: Iterable<string>) => [...list].join(' + ') }
    }) as never)
    await renderWithProviders(<Fields start={{ ...emptyProjectForm, tools: ['Claude', 'Expo'] }} />)

    expect(screen.getByRole('button', { name: /^Outils/ }).props.accessibilityLabel).toBe(
      'Outils, Claude + Expo',
    )
    expect(seen.at(-1)?.locale).toMatch(/^fr/)
  })
})
