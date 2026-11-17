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
import { readableWidth } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Dimensions, Text as NativeText, Platform, StyleSheet } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LegalDocument } from './LegalDocument'
import { type ScreenScroll, ScreenScrollContext, type ScrollEvent } from './scrollLight'

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

  // Relecture de design de R11 : la dernière partie, trop courte, n'atteint jamais le haut de
  // l'écran ; le saut s'arrête au bas de la page, plus haut que la position demandée. Ce défilement
  // est encore celui du saut : la partie touchée reste marquée, jusqu'à ce que la page bouge d'elle-même.
  it('keeps the chosen part current when the jump stops at the bottom of the page', async () => {
    // Jest ne place rien à l'écran : tous les textes natifs partagent un prototype (celui du texte
    // témoin, les titres en sont), et l'on y prête un `measureInWindow` qui répond la position de
    // chaque titre dans la fenêtre, d'après le défilement simulé.
    const windowHeight = 1000
    const bottom = 600 // la fin de la page : contenu de 1 600, fenêtre de 1 000
    const tops: Record<string, number> = {
      [sections[0]?.title ?? '']: 700,
      [sections[1]?.title ?? '']: 1100,
      [sections[2]?.title ?? '']: 1400,
    }
    let scrolled = 0
    const listeners = new Set<(event: ScrollEvent) => void>()
    const jumpTo = jest.fn()
    const scroll: ScreenScroll = {
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      lightHeld: { current: false },
      coveredTop: { current: 0 },
      toTop: jest.fn(),
      jumpTo,
    }
    const emit = async (y: number) => {
      scrolled = y
      const event = {
        nativeEvent: {
          contentOffset: { x: 0, y },
          contentSize: { width: 1000, height: bottom + windowHeight },
          layoutMeasurement: { width: 1000, height: windowHeight },
        },
      } as unknown as ScrollEvent
      await act(async () => {
        for (const listener of listeners) listener(event)
        // La mesure attend l'image suivante.
        await new Promise((done) => setTimeout(done, 50))
      })
    }
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 1440,
      height: windowHeight,
      scale: 1,
      fontScale: 1,
    })
    const probe = createRef<NativeText>()
    await renderWithProviders(
      <ScreenScrollContext.Provider value={scroll}>
        <NativeText ref={probe} />
        <LegalDocument
          version="2026-11-16"
          summary={summary}
          sections={sections}
          wide
          onLinkPress={onLinkPress}
        />
      </ScreenScrollContext.Provider>,
    )
    const proto = Object.getPrototypeOf(probe.current) as { measureInWindow?: unknown }
    const had = Object.hasOwn(proto, 'measureInWindow')
    const previous = proto.measureInWindow
    proto.measureInWindow = function (this: unknown, done: (x: number, y: number) => void) {
      done(0, (tops[labelOf(this) ?? ''] ?? 0) - scrolled)
    }
    try {
      const last = sections[2]?.title ?? ''
      await fireEvent.press(screen.getByRole('link', { name: last }))
      // Le saut est demandé plus bas que la fin de la page ; il s'arrête au bas.
      expect(jumpTo.mock.calls.at(-1)?.[0]).toBeGreaterThan(bottom)
      await emit(bottom)

      expect(isCurrent(screen.getByRole('link', { name: last }))).toBe(true)

      // Témoin : la page remonte d'elle-même ; le sommaire suit de nouveau la lecture.
      await emit(0)
      expect(isCurrent(screen.getByRole('link', { name: sections[0]?.title ?? '' }))).toBe(true)
      expect(isCurrent(screen.getByRole('link', { name: last }))).toBe(false)
    } finally {
      if (had) proto.measureInWindow = previous
      else delete proto.measureInWindow
      jest.restoreAllMocks()
    }
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

// R15 (« Ce qui reste étroit ») : le texte d'une page légale reste à `readableWidth` au plus, mais
// son bloc est centré dans la page au lieu d'être calé à gauche ; sur ordinateur, le bloc est le
// sommaire et le texte côte à côte. Centré : `alignSelf: 'center'`, ou des marges automatiques ;
// borné : une largeur maximale, sans quoi « centré » ne déplace rien.
describe('LegalDocument, centred in the page (R15)', () => {
  type Node = { props: Record<string, unknown>; parent: Node | null }
  const styleOf = (node: Node) =>
    (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
  const isCentred = (node: Node) => {
    const style = styleOf(node)
    return (
      style.alignSelf === 'center' ||
      style.marginHorizontal === 'auto' ||
      (style.marginLeft === 'auto' && style.marginRight === 'auto')
    )
  }
  /** Le premier cadre au-dessus du titre « En bref » qui borne sa largeur. */
  const boundedAbove = (node: Node): Node | null => {
    for (let current: Node | null = node.parent; current; current = current.parent) {
      if (typeof styleOf(current).maxWidth === 'number') return current
    }
    return null
  }

  it('centres the column of text at the readable width, on a phone or a tablet', async () => {
    await show({ wide: false })

    const column = boundedAbove(screen.getByText(summaryTitle) as unknown as Node)
    expect(column).not.toBeNull()
    if (!column) return
    expect(styleOf(column).maxWidth).toBe(readableWidth) // témoin : la largeur ne change pas
    expect(isCentred(column)).toBe(true)
  })

  it('centres the contents and the text together on a computer', async () => {
    await show({ wide: true })

    // Le bloc : le cadre qui porte la navigation « Sommaire » et le texte.
    const nav = screen.getByLabelText(contents) as unknown as Node
    const block = nav.parent
    expect(block).not.toBeNull()
    if (!block) return
    expect(typeof styleOf(block).maxWidth).toBe('number')
    expect(isCentred(block)).toBe(true)
  })
})
