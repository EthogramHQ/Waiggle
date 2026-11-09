// La feuille « Catégorie et outils » d'un projet privé (relecture juridique jur-J2 de R6b) : sous la
// catégorie « Autre », l'aide « Les administrateurs pourront ranger ton projet… » est fausse pour un
// projet privé, que personne d'autre ne voit et que l'administration ne range jamais (404). La
// feuille la tait donc ; un projet public (ou réservé aux abonnés) la garde.
import type { ProjectVisibility, ToolList } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { request } from '../api/client'
import { categoryList } from '../testing/categories'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProjectCategorySheet } from './ProjectCategorySheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const HINT = fr.t(($) => $.project.form.otherCategoryHint)
const TOOLS: ToolList = { tools: [], others: [] }

beforeEach(() => {
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) =>
      path.startsWith('/v1/categories')
        ? { ok: true, data: categoryList('fr') }
        : path.startsWith('/v1/tools')
          ? { ok: true, data: TOOLS }
          : { ok: false, error: 'internal' }) as typeof request)
})

/** La feuille ouverte sur la catégorie « Autre » déjà choisie, ses catégories lues. */
const openWithOther = async (visibility: ProjectVisibility) => {
  await renderWithProviders(
    <ProjectCategorySheet
      open
      primary="other"
      secondary={null}
      tools={[]}
      visibility={visibility}
      onChange={() => {}}
      onClose={() => {}}
    />,
  )
  await screen.findAllByRole('checkbox')
}

describe('ProjectCategorySheet, a private project under « Autre »', () => {
  it('says nothing about the administrators sorting a private project', async () => {
    await openWithOther('private')

    // Témoin : le test suivant, même feuille et même « Autre », sur un projet public.
    expect(screen.queryByText(containing(HINT))).toBeNull()
  })

  it('keeps the hint for a project the members can see (witness)', async () => {
    await openWithOther('public')

    expect(screen.getByText(containing(HINT))).toBeTruthy()
  })
})
