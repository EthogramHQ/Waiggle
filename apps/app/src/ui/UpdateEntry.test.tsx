// Tests d'une mise à jour affichée en entier (R7a, scénarios « Les mises à jour sur la page projet »,
// « La frise », « Supprimer une mise à jour ») : son titre (sinon sa version, sinon « Mise à
// jour »), sa version en Geist Mono, sa date, ses lignes avec leurs pastilles, ses photos (l'avant /
// après, ou une galerie), la corbeille de l'auteur, « Signaler » pour un autre membre, et le bandeau
// d'une mise à jour retirée par la modération, que seul l'auteur voit encore.
//
// L'interface attendue de `src/ui/UpdateEntry.tsx` (plan R7a, « Appli », et relecture du plan,
// interface A3) :
// `UpdateEntry({ update: ProjectUpdate; toSource; onDelete?; deleting?; onReport?; headingLevel?;
// current?; compact? })`.
// Choix faits avec ces tests (R7a) :
// - `toSource: (url: string | null | undefined) => ImageSource | null` : la fonction que rend
//   `useMediaSources()` (api/media.ts), donnée par l'écran ; un composant de `src/ui` ne parle
//   jamais à l'API, il ne peut donc pas la lire lui-même ;
// - `headingLevel?: 2 | 3` : le niveau du titre (2 dans la frise, 3 dans la section « Les mises à
//   jour », elle-même un titre de niveau 2) ;
// - `onReport?: () => void` : présent pour un autre membre, « Signaler cette mise à jour » (un
//   bouton, ou une action du menu « … » : les deux sont acceptés ici).
import type { ProjectUpdate } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { removalAfterReport } from '../testing/moderation'
import { photo } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr, missingSentences, removalSentences } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import type { ImageSource } from './image'
import { UpdateEntry } from './UpdateEntry'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les photos de l'API, servies telles quelles (comme sur le web, où le cookie suit seul). */
const toSource = (url: string | null | undefined): ImageSource | null => (url ? { uri: url } : null)

const TITLE = 'Le décompte de la fusée'
const familyName = fr.t(($) => $.update.family.fixed)
const deleteLabel = (title: string) => fr.t(($) => $.project.updates.delete, { title })
const reportLabel = fr.t(($) => $.report.update)
const compare = fr.t(($) => $.project.updates.compare)
const photosLabel = fr.t(($) => $.project.updates.photosLabel)

/** Les titres de la page (rôle `header` sur téléphone ; `heading` est son nom sur le web). */
const headings = () => [...screen.queryAllByRole('header'), ...screen.queryAllByRole('heading')]
const headingNamed = (name: string) =>
  headings().filter(
    (node) =>
      node.props.accessibilityLabel === name ||
      node.props['aria-label'] === name ||
      [node.props.children].flat().join('') === name,
  )

/** Le curseur de l'avant / après, s'il y en a un. */
const sliders = () => [
  ...screen.queryAllByRole('adjustable', { name: compare }),
  ...screen.queryAllByRole('slider', { name: compare }),
]

/** « Signaler cette mise à jour » : un bouton, ou l'action du menu « … » qu'on ouvre d'abord. */
const reportAction = async () => {
  const direct = screen.queryByRole('button', { name: reportLabel })
  if (direct) return direct
  await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.actionMenu.label) }))
  return screen.getByRole('menuitem', { name: reportLabel })
}

const renderEntry = (props: Partial<Parameters<typeof UpdateEntry>[0]> = {}) =>
  renderWithProviders(<UpdateEntry update={rocketUpdate} toSource={toSource} {...props} />)

describe('UpdateEntry', () => {
  it('titles the update with its title, its version beside it', async () => {
    await renderEntry()

    expect(headingNamed(TITLE)).toHaveLength(1)
    expect(screen.getAllByText('v1.2')).toHaveLength(1)
  })

  // Scénario : « son titre (sinon sa version, sinon « Mise à jour ») ».
  // Relecture du plan, interface A3 : `it('does not repeat the version when it stands in for the
  // title')` → `getAllByText('v1.2')` de longueur 1.
  it('does not repeat the version when it stands in for the title', async () => {
    await renderEntry({ update: { ...rocketUpdate, title: null } })

    expect(headingNamed('v1.2')).toHaveLength(1)
    expect(screen.getAllByText('v1.2')).toHaveLength(1)
  })

  it('titles an update with neither title nor version « Mise à jour »', async () => {
    await renderEntry({ update: { ...rocketUpdate, title: null, version: null } })

    expect(headingNamed(fr.t(($) => $.project.updates.untitled))).toHaveLength(1)
  })

  // Relecture du plan, interface A3 : `it('titles an update as a level-3 heading in the project
  // section')`. Le niveau ne se lit que sur le web (`aria-level`, posé par `Text heading`).
  it('titles an update as a level-3 heading in the project section', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderEntry({ headingLevel: 3 })

      const [heading] = headingNamed(TITLE)
      expect(heading?.props['aria-level']).toBe(3)
    } finally {
      restore.restore()
    }
  })

  it('titles an update as a level-2 heading in the timeline', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderEntry({ headingLevel: 2 })

      const [heading] = headingNamed(TITLE)
      expect(heading?.props['aria-level']).toBe(2)
    } finally {
      restore.restore()
    }
  })

  it('shows each line of the update', async () => {
    await renderEntry()

    expect(screen.getByText('Un compte à rebours avant chaque question')).toBeTruthy()
    expect(screen.getByText('Le score ne repart plus à zéro au niveau 3')).toBeTruthy()
  })

  // Relecture du plan, interface B4 : `it('reads each line with its family')` →
  // `getByText('Réparé : Le score ne repart plus à zéro au niveau 3')` (ou le nom de l'élément de
  // liste). La pastille seule ne dit la famille que par sa couleur et son icône (WCAG 1.1.1).
  it('reads each line with its family', async () => {
    await renderEntry()

    const read = fr.t(($) => $.update.lineRead, {
      family: familyName,
      text: 'Le score ne repart plus à zéro au niveau 3',
    })
    // Le texte entier, espaces de la typographie française comprises : dans un texte caché à l'œil,
    // ou dans le nom lu de la ligne.
    // (`\s` reconnaît l'espace fine insécable de « Réparé : », qu'un nom lu garde telle quelle.)
    const whole = new RegExp(`^${containing(read).source.split(' ').join('\\s+')}$`)
    const found = [
      ...screen.queryAllByText(whole, { includeHiddenElements: true }),
      ...screen.queryAllByLabelText(whole),
    ]
    expect(found.length).toBeGreaterThan(0)
  })

  // Scénario « L'avant / après » : une mise à jour avec l'avant / après montre le curseur.
  it('shows a before / after as the comparison slider', async () => {
    await renderEntry()

    expect(sliders()).toHaveLength(1)
  })

  // Scénario : « les photos d'une mise à jour sans avant / après s'affichent dans un carrousel ».
  it('shows the photos of an update without a before / after in a gallery named after it', async () => {
    await renderEntry({ update: { ...rocketUpdate, beforeAfter: false } })

    expect(screen.getByLabelText(photosLabel)).toBeTruthy()
    expect(screen.queryByLabelText(fr.t(($) => $.gallery.label))).toBeNull()
    expect(sliders()).toHaveLength(0)
  })

  // Relecture du plan, interface A3 : `it('shows the third photo of an update with a before /
  // after')` (le plan perdait les photos 3 et 4).
  it('shows the third photo of an update with a before / after', async () => {
    const third = photo('77777777-7777-4777-8777-777777777777', 1600, 900, 'La fusée en vol')
    await renderEntry({ update: { ...rocketUpdate, photos: [...rocketUpdate.photos, third] } })

    expect(sliders()).toHaveLength(1)
    expect(screen.queryAllByLabelText(/La fusée en vol/).length).toBeGreaterThan(0)
  })

  it('shows no photo, slider or gallery for an update without photos', async () => {
    await renderEntry({ update: { ...rocketUpdate, photos: [], beforeAfter: false } })

    expect(headingNamed(TITLE)).toHaveLength(1) // témoin
    expect(sliders()).toHaveLength(0)
    expect(screen.queryByLabelText(photosLabel)).toBeNull()
  })

  // Relecture du plan, interface A3 : `it('names the trash button after its update')` →
  // « Supprimer la mise à jour « Le décompte de la fusée » ».
  it('names the trash button after its update, and deletes it once', async () => {
    const onDelete = jest.fn()
    await renderEntry({ onDelete })

    await fireEvent.press(screen.getByRole('button', { name: deleteLabel(TITLE) }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('names the trash button after the version when the update has no title', async () => {
    await renderEntry({ update: { ...rocketUpdate, title: null }, onDelete: () => {} })

    expect(screen.getByRole('button', { name: deleteLabel('v1.2') })).toBeTruthy()
  })

  it('has no trash button without onDelete', async () => {
    await renderEntry()

    expect(headingNamed(TITLE)).toHaveLength(1) // témoin
    expect(screen.queryByRole('button', { name: deleteLabel(TITLE) })).toBeNull()
  })

  // Scénario : « pendant la suppression, « Supprimer » reste occupé et une seconde tape n'envoie
  // rien » : la corbeille ne relance pas la suppression en cours.
  it('does not delete again while deleting', async () => {
    const onDelete = jest.fn()
    await renderEntry({ onDelete, deleting: true })

    expect(headingNamed(TITLE)).toHaveLength(1) // témoin : la mise à jour est là
    const trash = screen.queryByRole('button', { name: deleteLabel(TITLE) })
    if (trash) await fireEvent.press(trash)

    expect(onDelete).not.toHaveBeenCalled()
  })

  // Relecture du plan, interface A3 : `it('offers « Signaler » to another member and not to the
  // author')` (scénario « La modération »).
  it('offers « Signaler » to another member and not to the author', async () => {
    const onReport = jest.fn()
    const { rerender } = await renderEntry({ onReport })

    await fireEvent.press(await reportAction())
    expect(onReport).toHaveBeenCalledTimes(1)

    // L'auteur : la corbeille, jamais « Signaler ».
    await rerender(<UpdateEntry update={rocketUpdate} toSource={toSource} onDelete={() => {}} />)
    expect(screen.getByRole('button', { name: deleteLabel(TITLE) })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: reportLabel })).toBeNull()
    expect(screen.queryByText(reportLabel)).toBeNull()
  })

  // Une mise à jour retirée ne paraît plus que pour l'auteur, avec ce qu'il doit savoir (DSA, 17).
  it('tells its author why a removed update was removed', async () => {
    const removed: ProjectUpdate = { ...rocketUpdate, removal: removalAfterReport }
    await renderEntry({ update: removed, onDelete: () => {} })

    expect(missingSentences(removalSentences(removalAfterReport), screen)).toEqual([])
  })

  it('shows no removal banner on an update in place', async () => {
    await renderEntry()

    expect(headingNamed(TITLE)).toHaveLength(1) // témoin
    expect(missingSentences(removalSentences(removalAfterReport), screen).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(fr.t(($) => $.removal.onlyYou))).toHaveLength(0)
  })
})
