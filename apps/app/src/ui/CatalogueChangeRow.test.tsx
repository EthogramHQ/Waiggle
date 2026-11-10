// Tests d'une ligne de « Changements récents » (tranche R6b, en bas des pages « Outils » et
// « Catégories » de la Modération) : qui a fait quoi au catalogue, en une phrase
// (`moderation.catalogue.change.<action>`). Un administrateur dont le compte a été supprimé devient
// « Un ancien administrateur » ; un projet qui n'est plus visible des membres (privé, retiré,
// supprimé : `project` vaut null) n'est jamais nommé, la phrase dit « un projet » (relecture du plan
// sec-A1, jur-T2).
//
// L'interface attendue de `src/ui/CatalogueChangeRow.tsx` (fixée au lancement de R6b) : CatalogueChangeRow({ change: CatalogueChange }).
import type { CatalogueChange } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { admitChange, changeOf, mergeChange, recategorizeChange } from '../testing/catalogue'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { CatalogueChangeRow } from './CatalogueChangeRow'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const show = (change: CatalogueChange) =>
  renderWithProviders(<CatalogueChangeRow change={change} />)

const FORMER = fr.t(($) => $.moderation.catalogue.formerAdmin)
/** Le titre du projet rangé dans la ligne `recategorizeChange`. */
const hidden = 'Le carnet des hérissons'

describe('CatalogueChangeRow', () => {
  // Une ligne par action, un rendu par test.
  it.each<[string, CatalogueChange, string]>([
    [
      'tool_admit',
      admitChange,
      fr.t(($) => $.moderation.catalogue.change.tool_admit, {
        admin: 'Nora Benali',
        tool: 'Lovable',
      }),
    ],
    [
      'tool_create',
      changeOf({ action: 'tool_create', tool: { slug: 'zapier', name: 'Zapier' } }),
      fr.t(($) => $.moderation.catalogue.change.tool_create, {
        admin: 'Nora Benali',
        tool: 'Zapier',
      }),
    ],
    [
      'tool_edit',
      changeOf({ action: 'tool_edit', tool: { slug: 'zapier', name: 'Zapier' } }),
      fr.t(($) => $.moderation.catalogue.change.tool_edit, {
        admin: 'Nora Benali',
        tool: 'Zapier',
      }),
    ],
    [
      'tool_merge',
      mergeChange,
      fr.t(($) => $.moderation.catalogue.change.tool_merge, {
        admin: 'Nora Benali',
        merged: 'Make (le site)',
        tool: 'Make',
      }),
    ],
    [
      'tool_dismiss',
      changeOf({ action: 'tool_dismiss', tool: { slug: 'truc-bidule', name: 'Truc bidule' } }),
      fr.t(($) => $.moderation.catalogue.change.tool_dismiss, {
        admin: 'Nora Benali',
        tool: 'Truc bidule',
      }),
    ],
    [
      'category_create',
      changeOf({ action: 'category_create', category: { code: 'gardening', name: 'Jardinage' } }),
      fr.t(($) => $.moderation.catalogue.change.category_create, {
        admin: 'Nora Benali',
        category: 'Jardinage',
      }),
    ],
    [
      'project_recategorize',
      recategorizeChange,
      fr.t(($) => $.moderation.catalogue.change.project_recategorize, {
        admin: 'Nora Benali',
        project: 'Le carnet des hérissons',
        category: 'Animaux',
      }),
    ],
  ])('writes the sentence of %s', async (_action, change, sentence) => {
    await show(change)

    expect(screen.getByText(containing(sentence))).toBeTruthy()
  })

  it('names an administrator whose account was deleted « Un ancien administrateur »', async () => {
    await show({ ...admitChange, admin: null })

    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.moderation.catalogue.change.tool_admit, { admin: FORMER, tool: 'Lovable' }),
        ),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(containing('Nora Benali'))).toBeNull()
  })

  it('never names a project that is no longer visible, and says « un projet » instead', async () => {
    await show({ ...recategorizeChange, project: null })

    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.moderation.catalogue.change.project_recategorize_hidden, {
            admin: 'Nora Benali',
            category: 'Animaux',
          }),
        ),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(containing(hidden))).toBeNull()
  })

  it('names a visible project in its sentence (witness)', async () => {
    await show(recategorizeChange)

    expect(screen.getByText(containing(hidden))).toBeTruthy()
  })
})
