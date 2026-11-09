// Tests des champs de la feuille de publication (R6a, `ProjectFormFields`), seuls, sans l'écran :
// les lignes « Catégorie », « Seconde » et « Outils » (leur nom lu dit leur valeur, l'erreur décrit
// la ligne, et chacune ouvre la seconde feuille en disant d'où), le lien de démo (« Lien valide »
// lu avec ce qui n'est pas vérifié), la description de la photo choisie et la phrase d'audience.
// La feuille entière (envoi, abandon, seconde feuille) est testée par `ProjectFormScreen.test.tsx`.
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useState } from 'react'
import { request } from '../api/client'
import { emptyProjectForm, type ProjectForm, type ProjectFormErrors } from '../projects/form'
import { categoryList } from '../testing/categories'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import type { PhotoTile } from '../ui/PhotoTiles'
import { type CategoriesOpener, ProjectFormFields, useProjectFieldRefs } from './ProjectFormFields'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// R6b : les noms des catégories viennent de l'API (GET /v1/categories), simulée ici en français.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
beforeEach(() => {
  jest
    .mocked(request)
    .mockImplementation(async (path) =>
      String(path).startsWith('/v1/categories')
        ? { ok: true, data: categoryList('fr') }
        : { ok: false, error: 'notFound' },
    )
})

const TEXT = {
  chooseCategory: fr.t(($) => $.project.form.chooseCategory),
  demoUrl: fr.t(($) => $.project.form.demoUrl),
  demoValid: fr.t(($) => $.project.form.demoValid),
  demoNotChecked: fr.t(($) => $.project.form.demoNotChecked),
  audienceMembers: fr.t(($) => $.project.form.audienceMembers),
  audienceMembersEdit: fr.t(($) => $.project.form.audienceMembersEdit),
  audiencePrivateNew: fr.t(($) => $.project.form.audiencePrivateNew),
  addTool: fr.t(($) => $.project.form.addToolButton),
  photoDescription: (number: number) => fr.t(($) => $.project.form.photoDescription, { number }),
}

const tile = (key: string): PhotoTile => ({
  key,
  state: 'ready',
  image: { source: { uri: `file:///${key}.jpg` }, label: key },
})

/** Les champs, avec un formulaire gardé comme dans l'écran ; chaque ouverture de la seconde feuille est notée. */
function Fields({
  start = emptyProjectForm,
  errors = {},
  projectId,
  opened = jest.fn(),
  tiles = [],
}: {
  start?: ProjectForm
  errors?: ProjectFormErrors
  projectId?: string
  opened?: jest.Mock
  tiles?: PhotoTile[]
}) {
  const [form, setForm] = useState(start)
  const [selected, setSelected] = useState<string | null>(null)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const fieldRefs = useProjectFieldRefs()
  return (
    <ProjectFormFields
      form={form}
      change={(key) => (value) => setForm((previous) => ({ ...previous, [key]: value }))}
      errors={errors}
      projectId={projectId}
      tiles={tiles}
      photos={{ onAdd: jest.fn(), onDropFiles: jest.fn(), onMove: jest.fn(), onRemove: jest.fn() }}
      descriptions={{
        selectedKey: selected,
        onSelect: setSelected,
        textOf: (key) => texts[key] ?? '',
        onChange: (key, text) => setTexts((previous) => ({ ...previous, [key]: text })),
        onLeave: jest.fn(),
      }}
      onOpenCategories={(from: CategoriesOpener) => opened(from)}
      fieldRefs={fieldRefs}
    />
  )
}

const row = (name: RegExp) => screen.getByRole('button', { name })

describe('ProjectFormFields, the category, second and tools rows', () => {
  it('says in the name of the category row what to do while there is none', async () => {
    await renderWithProviders(<Fields />)

    expect(row(/^Catégorie/).props.accessibilityLabel).toBe(`Catégorie, ${TEXT.chooseCategory}`)
    expect(row(/^Outils/).props.accessibilityLabel).toBe(`Outils, ${TEXT.addTool}`)
  })

  it('reads the values in the names, « Catégorie, Sciences et espace »', async () => {
    await renderWithProviders(
      <Fields
        start={{
          ...emptyProjectForm,
          primaryCategory: 'science',
          secondaryCategory: 'learning',
          tools: ['Claude', 'Expo'],
        }}
      />,
    )

    // Les noms arrivent avec la liste des catégories, lue une fois l'écran monté.
    await waitFor(() =>
      expect(row(/^Catégorie/).props.accessibilityLabel).toBe('Catégorie, Sciences et espace'),
    )
    expect(row(/^Seconde/).props.accessibilityLabel).toBe('Seconde, facultative, Apprendre')
    expect(row(/^Outils/).props.accessibilityLabel).toBe('Outils, Claude, Expo')
  })

  it('shows the missing category once, under the row, and describes the row with it', async () => {
    await renderWithProviders(<Fields errors={{ primaryCategory: 'chooseCategory' }} />)

    expect(screen.getAllByText(containing(TEXT.chooseCategory))).toHaveLength(1)
    expect(row(/^Catégorie/).props.accessibilityLabel).toBe('Catégorie')
    expect(String(row(/^Catégorie/).props.accessibilityHint)).toContain(TEXT.chooseCategory)
  })

  it('opens the second sheet from each row, saying which one', async () => {
    const opened = jest.fn()
    await renderWithProviders(<Fields opened={opened} />)

    await fireEvent.press(row(/^Catégorie/))
    await fireEvent.press(row(/^Seconde/))
    await fireEvent.press(row(/^Outils/))

    expect(opened.mock.calls).toEqual([['category'], ['secondary'], ['tools']])
  })
})

describe('ProjectFormFields, the demo link', () => {
  it('says « Lien valide » for an https address, then at once that the site is not checked', async () => {
    await renderWithProviders(<Fields />)

    await fireEvent.changeText(screen.getByLabelText(TEXT.demoUrl), 'http://ciel-du-soir.fr')
    expect(screen.queryByText(containing(TEXT.demoValid))).toBeNull()
    expect(screen.queryByText(containing(TEXT.demoNotChecked))).toBeNull()

    await fireEvent.changeText(screen.getByLabelText(TEXT.demoUrl), 'https://ciel-du-soir.fr')
    expect(screen.getByText(containing(TEXT.demoValid))).toBeTruthy()
    expect(screen.getByText(containing(TEXT.demoNotChecked))).toBeTruthy()
  })
})

describe('ProjectFormFields, the photo description', () => {
  it('shows the description field of the touched photo, numbered by its place', async () => {
    await renderWithProviders(<Fields tiles={[tile('a'), tile('b')]} />)
    expect(screen.queryByLabelText(TEXT.photoDescription(2))).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: /^Photo 2/ }))
    await fireEvent.changeText(screen.getByLabelText(TEXT.photoDescription(2)), 'Le plat du soir')

    // La tuile est lue avec sa description, en texte simple.
    expect(screen.getByRole('button', { name: 'Photo 2 : Le plat du soir' })).toBeTruthy()
  })
})

describe('ProjectFormFields, who can see it', () => {
  it('ends a new project with the members sentence, then the draft one once private', async () => {
    await renderWithProviders(<Fields />)
    expect(screen.getByText(containing(TEXT.audienceMembers))).toBeTruthy()

    await fireEvent.press(screen.getByRole('radio', { name: /^Privé/ }))

    expect(screen.getByText(containing(TEXT.audiencePrivateNew))).toBeTruthy()
    expect(screen.queryByText(containing(TEXT.audienceMembers))).toBeNull()
  })

  it('speaks in the present for a project being edited', async () => {
    await renderWithProviders(<Fields projectId="p1" />)

    expect(screen.getByText(containing(TEXT.audienceMembersEdit))).toBeTruthy()
  })
})
