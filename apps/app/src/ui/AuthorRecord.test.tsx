// Tests de la fiche de l'auteur (R9, planches `R9-Moderation-Desktop` et
// `R9-Moderation-Detail-Telephone`) : dans le détail d'un signalement, ce que la modération sait du
// membre visé. Son nom et son pseudo, « Compte récent » s'il a moins de 14 jours, sa date
// d'inscription, ses nombres de projets et de commentaires, ce qui a déjà été décidé pour lui
// (« 2 retraits, 1 suspension levée »), et « Suspendre » quand il peut l'être. Seuls les
// administrateurs la voient : c'est l'écran de la modération qui la monte, jamais une autre page.
//
// L'interface attendue (le `## Découpage` du plan de R9) :
// `{ name; handle; joinedAt; projectCount; commentCount; removals; suspensions; suspendedNow;
//    now?: Date; onSuspend: (() => void) | null }` ; `null` : pas de bouton « Suspendre ».
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { AuthorRecord } from './AuthorRecord'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** « Maintenant » pour toute la fiche : le 30 octobre 2026 à midi (heure de Paris, 11 h UTC). */
const now = new Date('2026-10-30T11:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

/** Une date d'inscription, tant de jours (et de millisecondes) avant `now`. */
const daysAgo = (days: number, plusMs = 0) => new Date(now.getTime() - days * DAY - plusMs)

/** Inès Haddad, inscrite le 2 septembre : 3 projets, 18 commentaires, 2 retraits, 1 suspension. */
const ines = {
  name: 'Inès Haddad',
  handle: 'ines_haddad',
  joinedAt: '2026-09-02T08:00:00.000Z',
  projectCount: 3,
  commentCount: 18,
  removals: 2,
  suspensions: 1,
  suspendedNow: false,
  now,
}

/** Tout le texte affiché de la fiche, en une chaîne : un nombre peut partager une ligne. */
const shownText = () =>
  screen
    .getAllByText(/./)
    .map((node) => [node.props.children].flat().join(''))
    .join(' · ')
    .replace(/\s+/g, ' ')

describe('AuthorRecord', () => {
  it('gives the name and the handle of the author', async () => {
    await renderWithProviders(<AuthorRecord {...ines} onSuspend={null} />)

    expect(screen.getByText(containing('Inès Haddad'))).toBeTruthy()
    expect(screen.getByText(containing('@ines_haddad'))).toBeTruthy()
  })

  it('gives the date the member joined', async () => {
    await renderWithProviders(<AuthorRecord {...ines} onSuspend={null} />)

    // « Inscription le 2 sept. » : le jour et le mois à Paris, sans l'année de « maintenant ».
    expect(shownText()).toMatch(/Inscription le 2 sept/)
  })

  it('counts the projects and the comments of the member', async () => {
    await renderWithProviders(<AuthorRecord {...ines} onSuspend={null} />)

    const text = shownText()
    expect(text).toMatch(containing(fr.t(($) => $.moderation.authorCard.projects, { count: 3 })))
    expect(text).toMatch(containing(fr.t(($) => $.moderation.authorCard.comments, { count: 18 })))
  })

  it('says « no project » and « no comment » rather than a zero', async () => {
    await renderWithProviders(
      <AuthorRecord {...ines} projectCount={0} commentCount={0} onSuspend={null} />,
    )

    const text = shownText()
    expect(text).toMatch(containing(fr.t(($) => $.moderation.authorCard.noProject)))
    expect(text).toMatch(containing(fr.t(($) => $.moderation.authorCard.noComment)))
    expect(text).not.toMatch(/\b0 (projet|commentaire)/)
  })

  it('uses the singular for one project and one comment', async () => {
    await renderWithProviders(
      <AuthorRecord {...ines} projectCount={1} commentCount={1} onSuspend={null} />,
    )

    const text = shownText()
    expect(text).toMatch(/\b1 projet\b(?!s)/)
    expect(text).toMatch(/\b1 commentaire\b(?!s)/)
  })

  it('recalls what the moderation already decided for the member', async () => {
    await renderWithProviders(<AuthorRecord {...ines} onSuspend={null} />)

    // « Déjà décidé : 2 retraits, 1 suspension levée » (planche du détail sur téléphone).
    const text = shownText()
    expect(text).toMatch(/2 retraits/)
    expect(text).toMatch(/1 suspension/)
  })

  it('writes no zero in what was decided for a member without any decision', async () => {
    await renderWithProviders(
      <AuthorRecord {...ines} removals={0} suspensions={0} onSuspend={null} />,
    )

    // Témoin : la fiche est là.
    expect(screen.getByText(containing('Inès Haddad'))).toBeTruthy()
    expect(shownText()).not.toMatch(/\b0 (retrait|suspension)/)
  })

  describe('« Compte récent », for an account of less than 14 days', () => {
    const recent = fr.t(($) => $.moderation.authorCard.recent)

    it('says it for an account of 13 days', async () => {
      await renderWithProviders(
        <AuthorRecord {...ines} joinedAt={daysAgo(13).toISOString()} onSuspend={null} />,
      )

      expect(screen.getByText(containing(recent))).toBeTruthy()
    })

    it('says it until the very last moment of the 14th day', async () => {
      await renderWithProviders(
        <AuthorRecord {...ines} joinedAt={daysAgo(14, -60_000).toISOString()} onSuspend={null} />,
      )

      expect(screen.getByText(containing(recent))).toBeTruthy()
    })

    it('no longer says it once the account is 14 days old', async () => {
      await renderWithProviders(
        <AuthorRecord {...ines} joinedAt={daysAgo(14).toISOString()} onSuspend={null} />,
      )

      // Témoin : la date d'inscription est bien là.
      expect(shownText()).toMatch(/Inscription le /)
      expect(screen.queryByText(containing(recent))).toBeNull()
    })

    it('does not say it for an account of two months', async () => {
      await renderWithProviders(<AuthorRecord {...ines} onSuspend={null} />)

      expect(screen.getByText(containing('Inès Haddad'))).toBeTruthy()
      expect(screen.queryByText(containing(recent))).toBeNull()
    })
  })

  describe('« Suspendre »', () => {
    it('offers to suspend the account when it is given what to do', async () => {
      const onSuspend = jest.fn()
      await renderWithProviders(<AuthorRecord {...ines} onSuspend={onSuspend} />)

      await fireEvent.press(screen.getByRole('button', { name: /^Suspendre/ }))

      expect(onSuspend).toHaveBeenCalledTimes(1)
    })

    it('offers no suspension when it is given nothing to do (null)', async () => {
      // Un administrateur, l'administrateur lui-même, ou un membre déjà suspendu (`canSuspend`).
      await renderWithProviders(<AuthorRecord {...ines} onSuspend={null} />)

      expect(screen.getByText(containing('Inès Haddad'))).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^Suspendre/ })).toBeNull()
    })

    it('says when the member is suspended right now', async () => {
      await renderWithProviders(<AuthorRecord {...ines} suspendedNow onSuspend={null} />)

      // La majuscule dépend de la place du texte dans la ligne : on ne la juge pas.
      const suspendedNow = containing(fr.t(($) => $.moderation.record.suspendedNow)).source
      expect(shownText()).toMatch(new RegExp(suspendedNow, 'i'))
    })
  })
})
