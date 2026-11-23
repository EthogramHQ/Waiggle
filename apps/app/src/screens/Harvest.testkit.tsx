// Outils communs aux tests de « Ma récolte » (R19, docs/scenarios/refonte.md, « R19 — La
// gamification ») : la page (`HarvestScreen`), le classement de la semaine (`RankingsScreen`) et la
// feuille « Décorer mon rayon ». On y trouve le faux serveur de l'API, le faux routeur d'Expo
// Router, les textes cherchés à l'écran et l'affichage des écrans.
//
// Pourquoi un faux serveur branché sur `api/client` plutôt que des hooks simulés : la forme des hooks
// de `gamification/api.ts` (`useHarvest`, `useGameSettings`, `useDecorate`, `useRankings`) n'est pas
// fixée par le plan ; le test lit seulement ce que l'écran demande à l'API et ce qu'il montre (comme
// `Hives.testkit.tsx` et `TestersCorner.testkit.tsx`). Les vrais hooks tournent, avec React Query.
//
// Chaque fichier de test pose ses `jest.mock` lui-même (Jest les remonte en tête de fichier) et les
// branche ici par des fonctions lues à l'appel (`require('./Harvest.testkit')`) : ce fichier
// n'importe aucun écran.
//
// Ce que ces tests supposent du code (plan R19, « Appli », « API » ; à corriger si le code en décide
// autrement, en le disant) :
// - les lectures : GET /v1/me/harvest (`Harvest`), GET /v1/rankings?scope=close et
//   ?scope=hive&hive=<id> (`Ranking`), GET /v1/hives (`MyHives`, les ruches du choix de portée) ;
// - les écritures, sans corps de réponse (204) : PATCH /v1/me/game (`GameSettingsUpdate`, ici le
//   défi perso) et PUT /v1/me/game/decoration (`DecorationChoice`) ;
// - les refus arrivent par le client comme partout (`{ ok: false, error }`, la clé du message) :
//   `rankingsOff` (403 `rankings_off`), `honeyShort` (409 `honey_short`) ;
// - les adresses : « Ma récolte » `/harvest`, le classement `/harvest/rankings` (paramètre `hive`),
//   la page d'un membre `/members/<id>`, les réglages de l'apparence `/settings/appearance` (le
//   groupe « Classements » y est, sous Apparence).
import {
  DECORATIONS,
  type Decoration,
  type DecorationChoice,
  type Harvest,
  Harvest as HarvestSchema,
  type MyHives,
  PERSONAL_CHALLENGES,
  type PersonalChallengeCode,
  type Ranking,
  Ranking as RankingSchema,
} from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import type { ApiResult } from '../api/errors'
import { leaHarvest } from '../testing/harvest'
import { myHives } from '../testing/hives'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'

// --- Les textes cherchés à l'écran ---

export const T = {
  harvestTitle: fr.t(($) => $.game.harvest.title),
  harvestLoadError: fr.t(($) => $.game.harvest.loadError),
  weekTitle: fr.t(($) => $.game.harvest.week.title),
  foraged: fr.t(($) => $.game.harvest.week.foraged),
  weekHelp: fr.t(($) => $.game.harvest.week.help),
  challengeTitle: fr.t(($) => $.game.harvest.challenge.title),
  chooseTitle: fr.t(($) => $.game.harvest.challenge.chooseTitle),
  confirm: fr.t(($) => $.game.harvest.challenge.confirm),
  skip: fr.t(($) => $.game.harvest.challenge.skip),
  none: fr.t(($) => $.game.harvest.challenge.none),
  chooseAgain: fr.t(($) => $.game.harvest.challenge.chooseAgain),
  done: fr.t(($) => $.game.harvest.challenge.done),
  challengeError: fr.t(($) => $.game.harvest.challenge.error),
  hivesTitle: fr.t(($) => $.game.harvest.hives),
  rankingsTitle: fr.t(($) => $.game.harvest.rankings.title),
  rankingsOpen: fr.t(($) => $.game.harvest.rankings.open),
  rankingsOff: fr.t(($) => $.game.harvest.rankings.off),
  rankingsChange: fr.t(($) => $.game.harvest.rankings.change),
  honeyTitle: fr.t(($) => $.game.harvest.honey.title),
  honeyHelp: fr.t(($) => $.game.harvest.honey.help),
  offer: fr.t(($) => $.game.harvest.honey.offer),
  offerHint: fr.t(($) => $.game.harvest.honey.offerHint),
  decorate: fr.t(($) => $.game.harvest.honey.decorate),
  decorateHint: fr.t(($) => $.game.harvest.honey.decorateHint),
  sealsMore: fr.t(($) => $.game.harvest.seals.more),
  newcomer: fr.t(($) => $.game.newcomer),
  isNew: fr.t(($) => $.game.new),
  rankingsPage: fr.t(($) => $.game.rankings.title),
  scope: fr.t(($) => $.game.rankings.scope),
  close: fr.t(($) => $.game.rankings.close),
  footnote: fr.t(($) => $.game.rankings.footnote),
  empty: fr.t(($) => $.game.rankings.empty),
  rankingsLoadError: fr.t(($) => $.game.rankings.loadError),
  decorationTitle: fr.t(($) => $.game.decoration.title),
  apply: fr.t(($) => $.game.decoration.apply),
  decorated: fr.t(($) => $.game.decoration.done),
  decorationError: fr.t(($) => $.game.decoration.error),
  shortHow: fr.t(($) => $.game.short.how),
  sheetClose: fr.t(($) => $.common.close),
}

export const challengeLabel = (code: PersonalChallengeCode) =>
  fr.t(($) => $.game.challenges.personal[code])
export const progressText = (progress: number, target: number) =>
  fr.t(($) => $.game.harvest.challenge.progress, { progress, target })
export const sealsHeading = (count: number) => fr.t(($) => $.game.harvest.seals.mine, { count })
export const honeyAmount = (amount: number) => fr.t(($) => $.game.honey, { amount })
export const pollenAmount = (amount: number) => fr.t(($) => $.game.harvest.week.total, { amount })
export const balanceText = (amount: number) => fr.t(($) => $.game.decoration.balance, { amount })
export const buyText = (amount: number) => fr.t(($) => $.game.decoration.buy, { amount })

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Une expression qui commence par ce texte (un nom lu qui ajoute une précision après). */
export const startingWith = (text: string) => new RegExp(`^${escapeRegExp(text)}`)

// --- Le faux serveur ---

type Sent = { method: string; path: string; body: unknown }
type Answer = ApiResult<unknown> | Promise<ApiResult<unknown>>

/** Une réponse tenue par le test : `resolve` la donne quand il le veut (double tape, « en cours »). */
export const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const targetOf = (code: PersonalChallengeCode) =>
  PERSONAL_CHALLENGES.find((challenge) => challenge.code === code)?.target ?? 1

const priceOf = (choice: Decoration, harvest: Harvest) =>
  (harvest.ownedDecorations.tints.includes(choice.tint) ? 0 : DECORATIONS.tint[choice.tint]) +
  (harvest.ownedDecorations.patterns.includes(choice.pattern)
    ? 0
    : DECORATIONS.pattern[choice.pattern])

/**
 * Le faux serveur : il répond comme l'API d'après un état que chaque test change (la récolte, les
 * classements, les ruches), et garde chaque demande. `answer` impose une réponse, qui passe avant
 * les réponses ordinaires. Les écritures changent l'état : la relecture qui suit les voit.
 */
export const mockServer = {
  sent: [] as Sent[],
  harvest: leaHarvest as Harvest,
  harvestError: null as string | null,
  hives: myHives as MyHives,
  /** Les classements, par `close` ou par identifiant de ruche. */
  rankings: new Map<string, Ranking>(),
  rankingsError: null as string | null,
  overrides: [] as { method: string; path: RegExp; answer: (sent: Sent) => Answer }[],
  reset() {
    this.sent = []
    this.harvest = leaHarvest
    this.harvestError = null
    this.hives = myHives
    this.rankings = new Map()
    this.rankingsError = null
    this.overrides = []
  },
  /** Impose la réponse d'une demande (`path` : le début du chemin, sans la requête). */
  answer(method: string, path: string, answer: (sent: Sent) => Answer) {
    this.overrides.unshift({ method, path: new RegExp(`^${escapeRegExp(path)}(\\?|$)`), answer })
  },
  async respond(path: string, init: RequestInit): Promise<ApiResult<unknown>> {
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : (init.body ?? null)
    const sent = { method, path, body }
    this.sent.push(sent)
    const override = this.overrides.find((one) => one.method === method && one.path.test(path))
    if (override) return override.answer(sent)
    const url = new URL(path, 'https://api.test')
    if (method === 'GET' && url.pathname === '/v1/me/harvest') {
      if (this.harvestError) return { ok: false, error: this.harvestError as never }
      // Une donnée d'exemple hors contrat ferait échouer le test pour une autre raison : on le dit.
      return { ok: true, data: HarvestSchema.parse(this.harvest) }
    }
    if (method === 'GET' && url.pathname === '/v1/rankings') {
      if (this.rankingsError) return { ok: false, error: this.rankingsError as never }
      const scope = url.searchParams.get('scope')
      const key = scope === 'hive' ? (url.searchParams.get('hive') ?? '') : 'close'
      const ranking = this.rankings.get(key)
      return ranking
        ? { ok: true, data: RankingSchema.parse(ranking) }
        : { ok: false, error: 'notFound' as never }
    }
    if (method === 'GET' && url.pathname === '/v1/hives') return { ok: true, data: this.hives }
    if (method === 'PATCH' && url.pathname === '/v1/me/game') {
      const patch = body as { personalChallenge?: PersonalChallengeCode | 'none' }
      const current = this.harvest.personalChallenge
      if (patch.personalChallenge && 'offered' in current) {
        this.harvest = {
          ...this.harvest,
          personalChallenge:
            patch.personalChallenge === 'none'
              ? { state: 'none', offered: current.offered }
              : {
                  state: 'active',
                  code: patch.personalChallenge,
                  progress: 0,
                  target: targetOf(patch.personalChallenge),
                },
        }
      }
      return { ok: true, data: null }
    }
    if (method === 'PUT' && url.pathname === '/v1/me/game/decoration') {
      const choice = body as DecorationChoice
      const price = priceOf(choice, this.harvest)
      const owned = this.harvest.ownedDecorations
      this.harvest = {
        ...this.harvest,
        honey: this.harvest.honey - price,
        decoration: choice,
        ownedDecorations: {
          tints: owned.tints.includes(choice.tint) ? owned.tints : [...owned.tints, choice.tint],
          patterns: owned.patterns.includes(choice.pattern)
            ? owned.patterns
            : [...owned.patterns, choice.pattern],
        },
      }
      return { ok: true, data: null }
    }
    return { ok: false, error: 'notFound' as never }
  },
}

/** Les demandes envoyées à ce chemin (sans la requête), avec cette méthode. */
export const sentTo = (method: string, path: string) =>
  mockServer.sent.filter(
    (one) => one.method === method && new URL(one.path, 'https://api.test').pathname === path,
  )

/** Le faux `api/client` : `request` vérifie la réponse par le schéma, comme le vrai. */
export const mockClient = {
  request: async (
    path: string,
    init: RequestInit | undefined,
    schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  ) => {
    const result = await mockServer.respond(path, init ?? {})
    if (!result.ok) return result
    const parsed = schema.safeParse(result.data)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
  },
  requestWithoutBody: async (path: string, init: RequestInit | undefined) => {
    const result = await mockServer.respond(path, init ?? {})
    return result.ok ? { ok: true, data: null } : result
  },
  apiFetch: jest.fn(),
}

// --- La navigation ---

/** Le faux routeur et les paramètres d'adresse (`hive` du classement), lus à l'appel. */
export const mockNav = {
  pathname: '/harvest',
  params: {} as Record<string, string>,
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    setParams: jest.fn(),
    canGoBack: () => true,
  },
}

/** Ce que les tests passent à `jest.mock('expo-router', …)`. */
export const mockExpoRouter = () => {
  const { useEffect } = require('react') as typeof import('react')
  return {
    usePathname: () => mockNav.pathname,
    useRouter: () => mockNav.router,
    useLocalSearchParams: () => mockNav.params,
    useGlobalSearchParams: () => mockNav.params,
    useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }),
    useSegments: () => [],
    useIsFocused: () => true,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      useEffect(() => effect(), [effect])
    },
  }
}

/** Les adresses ouvertes par le routeur (push, navigate, replace), dans l'ordre. */
export const visitedPaths = () =>
  [mockNav.router.push, mockNav.router.navigate, mockNav.router.replace].flatMap((mock) =>
    mock.mock.calls.map(([href]) => pathOf(href)),
  )

/**
 * Où mène un lien ou un bouton de ce nom : l'adresse du lien, ou celle que le routeur reçoit quand
 * on touche le bouton (l'écran choisit la forme).
 */
export const destinationOf = async (name: string | RegExp) => {
  const link = screen.queryByRole('link', { name })
  if (link) return pathOf(link.props.href)
  for (const mock of Object.values(mockNav.router)) {
    if (typeof mock === 'function' && 'mockClear' in mock) (mock as jest.Mock).mockClear()
  }
  await fireEvent.press(screen.getByRole('button', { name }))
  return visitedPaths().at(-1) ?? null
}

/** Remet tout à zéro avant chaque test : le serveur, le routeur, la session de Léa. */
export const resetHarvestMocks = () => {
  mockServer.reset()
  mockNav.pathname = '/harvest'
  mockNav.params = {}
  for (const mock of Object.values(mockNav.router)) {
    if (typeof mock === 'function' && 'mockReset' in mock) (mock as jest.Mock).mockReset()
  }
  mockSession({ user: { id: 'u1', name: 'Léa', emailVerified: true } })
}

/** Affiche un écran avec les toasts (le succès d'une décoration s'y annonce peut-être). */
export const renderHarvest = (ui: ReactElement) =>
  renderWithProviders(<ToastProvider>{ui}</ToastProvider>)

// --- Les gestes ---

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const textOf = (node: Host | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/** Échap relâchée (web) ou retour d'Android : la couche du Modal qui porte le titre `title`. */
export const pressEscape = async (title: string) => {
  const layers = hostsOf(screen.root as unknown as Host).filter(
    (node) => typeof node.props.onRequestClose === 'function' && textOf(node).includes(title),
  )
  const layer = layers.at(-1) as (Host & { props: { onRequestClose: () => void } }) | undefined
  if (!layer) throw new Error(`no layer around ${title}`)
  await act(() => layer.props.onRequestClose())
}

/** Les titres de rubrique (rôle `header`), dans l'ordre de lecture. */
export const headings = () =>
  screen
    .getAllByRole('header')
    .map((node) => String(node.props.accessibilityLabel ?? textOf(node as unknown as Host)))
