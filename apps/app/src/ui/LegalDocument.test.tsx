// Tests du corps d'une page légale (tranche R11, « La conformité ») : la date de la version, « En
// bref » en puces, puis « Le texte complet, qui fait foi », une partie par titre ; sur ordinateur, à
// côté, le « Sommaire » des parties. Le composant est commun aux quatre pages (Règles,
// Confidentialité, Mentions légales, Accessibilité) : il reçoit des textes déjà traduits.
//
// L'API attendue de `ui/LegalDocument` (plan de R11, « API des modules partagés », revue par la
// relecture de l'interface, U2) :
//   { version: string; summary: { icon: IconName; text: string }[];
//     sections: { id: string; title: string; body: string }[]; wide: boolean;
//     onLinkPress: (url: string) => void }
// - `version` est la date de la version telle que le contrat l'écrit (`AAAA-MM-JJ`, comme
//   `RULES_VERSION`) : le composant l'écrit lui-même « Version du 16 nov. 2026 », à l'heure de Paris ;
// - le titre de la page (niveau 1) est posé par l'écran, avant le composant ; ici, « En bref » et
//   « Le texte complet » sont des titres de niveau 2, et chaque partie un titre de niveau 3 ;
// - le corps d'une partie est du Markdown (ui/Markdown) : ses liens passent par `onLinkPress` ;
// - `wide` (ordinateur) montre la navigation « Sommaire », une entrée par partie.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LegalDocument } from './LegalDocument'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// La règle de react-native-web qui choisit la balise d'un élément (<h2>, <h3>…) d'après son rôle et
// son niveau (aria-level) : appliquée aux propriétés d'un titre, elle dit ce que lira le navigateur.
const webTagOf = jest.requireActual<(props: object) => string | undefined>(
  'react-native-web/dist/cjs/modules/AccessibilityUtil/propsToAccessibilityComponent',
)

const summary = [
  { icon: 'eye-slash' as const, text: 'Respecte les autres membres.' },
  { icon: 'flag' as const, text: 'Un contenu te gêne ? Signale-le.' },
  { icon: 'flag' as const, text: 'Ce que tu publies reste à toi.' },
]

const sections = [
  { id: 'purpose', title: 'À quoi sert l’appli', body: 'Des proches montrent leurs projets.' },
  {
    id: 'recourse',
    title: 'Si la réponse ne vient pas',
    body: 'Tu peux saisir le [Défenseur des droits](https://www.defenseurdesdroits.fr).',
  },
  { id: 'changes', title: 'Les changements des règles', body: '- Une date.\n- Une lecture.' },
]

const onLinkPress = jest.fn()
beforeEach(() => onLinkPress.mockReset())

const show = (props: { wide?: boolean; version?: string } = {}) =>
  renderWithProviders(
    <LegalDocument
      version={props.version ?? '2026-11-16'}
      summary={summary}
      sections={sections}
      wide={props.wide ?? false}
      onLinkPress={onLinkPress}
    />,
  )

const summaryTitle = fr.t(($) => $.legal.summaryTitle)
const fullTextTitle = fr.t(($) => $.legal.fullTextTitle)
const contents = fr.t(($) => $.legal.contents)

/** Vrai si cet élément est marqué comme l'entrée courante d'une navigation. */
const isCurrent = (element: ReturnType<typeof screen.getByRole>): boolean => {
  const { props } = element
  return Boolean(props['aria-current'] ?? props.accessibilityState?.selected)
}

describe('LegalDocument (R11)', () => {
  it('reads En bref and Le texte complet as level-2 headings and each part as level 3', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await show()

      expect(webTagOf(screen.getByRole('header', { name: summaryTitle }).props)).toBe('h2')
      expect(webTagOf(screen.getByRole('header', { name: fullTextTitle }).props)).toBe('h2')
      for (const section of sections) {
        expect(webTagOf(screen.getByRole('header', { name: section.title }).props)).toBe('h3')
      }
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('lists the summary with one item per point', async () => {
    await show()

    // Témoin : le titre de la liste.
    expect(screen.getByRole('header', { name: summaryTitle })).toBeTruthy()
    // Chaque puce, une fois.
    for (const point of summary) expect(screen.getAllByText(point.text)).toHaveLength(1)
  })

  it('shows each part as Markdown, its links going through onLinkPress', async () => {
    await show()

    expect(screen.getByText('Des proches montrent leurs projets.')).toBeTruthy()
    // Une liste Markdown devient une liste, pas des tirets en texte.
    expect(screen.queryByText(/^- Une date/)).toBeNull()
    expect(screen.getByText(/Une date\./)).toBeTruthy()

    await fireEvent.press(screen.getByRole('link', { name: 'Défenseur des droits' }))

    expect(onLinkPress).toHaveBeenCalledWith('https://www.defenseurdesdroits.fr/')
  })

  it('dates the version 2026-11-01 on 1 November whatever the time zone', async () => {
    // New York : minuit UTC du 1er novembre y est encore le 31 octobre au soir. Changer
    // `process.env.TZ` ne fait rien dans un test Jest (son `process.env` est une copie) : on fait
    // croire à `Intl` et aux `toLocale…` que l'appareil est à New York, en leur donnant ce fuseau
    // quand l'appelant n'en choisit aucun. Une date écrite à l'heure de Paris (ui/parisTime.ts)
    // donne son fuseau elle-même, et ne change pas.
    const deviceZone = 'America/New_York'
    const RealDateTimeFormat = Intl.DateTimeFormat
    const withDeviceZone = (options?: Intl.DateTimeFormatOptions) => ({
      timeZone: deviceZone,
      ...options,
    })
    const formatSpy = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(
        (locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) =>
          new RealDateTimeFormat(locales, withDeviceZone(options)),
      )
    const realToLocaleDateString = Date.prototype.toLocaleDateString
    const realToLocaleString = Date.prototype.toLocaleString
    const dateSpy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
      this: Date,
      locales,
      options,
    ) {
      return realToLocaleDateString.call(this, locales, withDeviceZone(options))
    })
    const stringSpy = jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (
      this: Date,
      locales,
      options,
    ) {
      return realToLocaleString.call(this, locales, withDeviceZone(options))
    })
    try {
      // Témoin : une date écrite sans fuseau choisi tombe bien la veille.
      expect(
        new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' }).format(
          new Date('2026-11-01'),
        ),
      ).toMatch(/^31 oct/)

      await show({ version: '2026-11-01' })

      expect(screen.getByText(/^Version du 1(?:er)? nov\.? 2026$/)).toBeTruthy()
      expect(screen.queryByText(/31 oct/)).toBeNull()
    } finally {
      formatSpy.mockRestore()
      dateSpy.mockRestore()
      stringSpy.mockRestore()
    }
  })

  it('shows a navigation named Sommaire with one current item, only when wide', async () => {
    await show({ wide: true })

    const nav = screen.getByLabelText(contents)
    // Une entrée par partie, nommée par son titre.
    const entries = sections.map((section) => screen.getByRole('link', { name: section.title }))
    expect(entries).toHaveLength(sections.length)
    expect(nav).toBeTruthy()
    // Une seule est la partie en cours : la première, à l'arrivée.
    expect(entries.filter(isCurrent)).toHaveLength(1)
    expect(isCurrent(entries[0] as (typeof entries)[number])).toBe(true)
  })

  it('has no Sommaire on a phone, and still shows every part', async () => {
    await show({ wide: false })

    // Témoin : les parties sont là.
    for (const section of sections) {
      expect(screen.getByRole('header', { name: section.title })).toBeTruthy()
    }
    expect(screen.queryByLabelText(contents)).toBeNull()
    expect(screen.queryByRole('link', { name: sections[0]?.title ?? '' })).toBeNull()
  })
})
