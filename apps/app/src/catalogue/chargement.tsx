// La section « Chargement » du catalogue (tranche R1, refaite en R16 « Les squelettes ») : le logo
// animé du lancement (LoadingLogo), en boucle puis arrêté à chacune de ses phases ; puis, de jour et
// de nuit, les pièces des pages qui chargent :
// - les pièces de base de ui/Skeleton.tsx : `Shape`, `SkeletonSurface` (la carte vide et sa lueur,
//   `SkeletonGlow`, qui passe 150 ms plus tard d'une colonne à la suivante) ;
// - `Loading` dans ses trois moments : avant 160 ms (sa place posée, rien de visible), montré, lent
//   (« Revenir » sous le squelette, comme `LoadingScreen` au bout de 4 s) ;
// - `Reveal`, le fondu du squelette vers le contenu, et `DelayedShapes`, des formes hors d'un
//   `Loading` qui attendent avec lui ;
// - les pièces vides des listes, de la page d'un projet, d'Explorer et de la vitrine, et les formes
//   de page entière (`SkeletonPage`).
// Sous « Réduire les animations », la lueur s'arrête : la feuille de la page (theme/document.ts) la
// coupe d'après le réglage du système, si bien qu'on la voit immobile en activant ce réglage (les
// captures de R16 le font, voir scripts/shots.mjs, « chargement »). Les cartes de projet vides sont
// dans « Le fil » (fil.tsx), celles d'un membre dans « La mosaïque d'un membre » (mosaique-membre.tsx).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée) sont
// écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { DelayedShapes } from '../ui/DelayedShapes'
import { HiveColumnTitleSkeleton, HiveHeaderSkeleton } from '../ui/HiveHeaderSkeleton'
import { ListGroup, ListRow, ListRowSkeleton, TextLineShape } from '../ui/ListGroup'
import { LoadingLogo, restMoment } from '../ui/LoadingLogo'
import { ProjectCoverSkeleton } from '../ui/ProjectCover'
import {
  ActionsShapes,
  CommentsShapes,
  DescriptionShapes,
  PromptShapes,
  RecipeShapes,
} from '../ui/ProjectPageShapes'
import { Reveal } from '../ui/Reveal'
import { ShowcaseCardSkeleton } from '../ui/ShowcaseCard'
import {
  Loading,
  Shape,
  SkeletonCard,
  SkeletonList,
  SkeletonPage,
  SkeletonRows,
  SkeletonSurface,
} from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { TagSkeleton } from '../ui/Tag'
import { TesterCardSkeleton } from '../ui/TesterCard'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Chargement',
  intro:
    'Au lancement de l’appli sur téléphone, l’abeille écrit le « w », se pose, puis repart (4,6 s en boucle). Dans les pages, des squelettes à la forme de chaque page annoncent le contenu qui arrive ; une lueur miel les traverse, immobile sous « Réduire les animations ».',
  loop: 'Le logo animé (LoadingLogo), en boucle : 114 et 240 points de large',
  phases: 'Arrêté à chaque phase (prop moment)',
  moments: [
    { at: 0.03, label: '3 % : l’élan, en fondu' },
    { at: 0.25, label: '25 % : elle écrit le « w »' },
    { at: 0.45, label: '45 % : elle grandit et se redresse' },
    { at: restMoment, label: '66 % : posée, le logo' },
    { at: 0.8, label: '80 % : elle repart, la queue s’efface' },
    { at: 0.92, label: '92 % : tout s’estompe' },
  ],
  calm: 'Avec « Réduire les animations » : posé, immobile',
  day: 'jour',
  night: 'nuit',
  shapes:
    'Les formes (Shape) : un bloc, une ligne, un rond, une pastille, d’un brun miel transparent',
  surfaces:
    'La carte vide (SkeletonSurface) : coins de carte, de tuile et de groupe ; la lueur (SkeletonGlow) passe 150 ms plus tard d’une colonne à la suivante',
  before:
    'Loading avant 160 ms : sa place est posée, invisible et cachée aux lecteurs d’écran, puis il se montre en fondu. « Rejouer » le remonte',
  replay: 'Rejouer',
  shown: 'Loading montré (shown) : un seul « Chargement… » lu pour toutes ses pièces',
  slow: 'Lent : au bout de 4 s, « Revenir » sous le squelette, sans rien déplacer (LoadingScreen)',
  reveal:
    'Reveal : le squelette fond vers le contenu (180 ms, gardé sous « Réduire les animations ») ; arrivé avant 160 ms, le contenu s’affiche d’un coup',
  arrive: 'Faire arriver le contenu',
  again: 'Recommencer',
  arrived: 'Le contenu arrivé, dans la même vue que le squelette (le focus et la saisie restent).',
  delayed:
    'DelayedShapes : des formes posées hors d’un Loading (l’en-tête d’un membre au nom connu) qui attendent 160 ms avec lui, sans rien dire aux lecteurs d’écran',
  rows: 'Des lignes vides (SkeletonRows, 5 lignes de ListRowSkeleton), comme StateMessage kind="loading"',
  rowKinds:
    'Les lignes vides d’une liste (ListRowSkeleton) : rond, tuile, rien en tête ; vignette, pastille, ligne courte au bout',
  lines:
    'Une ligne de texte vide à la hauteur d’une ligne écrite (TextLineShape) : title2, body, caption ; elle grandit avec la taille du texte (téléphone : fontScale ; web : em)',
  pendingGroup:
    'ListGroup pending : le titre lu tout de suite, les lignes vides sous « Chargement… », puis les vraies lignes et le pied sous le même titre',
  pendingTitle: 'Par e‑mail',
  pendingArrive: 'Faire arriver les lignes',
  pendingAgain: 'Recommencer le groupe',
  pendingRow: 'Commentaires sur tes projets',
  pendingFooter: 'Les e‑mails de sécurité partent toujours.',
  hiveHeader:
    'Le haut vide d’une ruche (HiveHeaderSkeleton) : l’alvéole à la taille de la vraie, le nom, le nombre ; puis les titres vides des colonnes (HiveColumnTitleSkeleton : members, testers)',
  cover: 'La galerie vide d’un projet (ProjectCoverSkeleton) : band (téléphone), medium (tablette)',
  projectParts:
    'Le bas vide de la page d’un projet (ProjectPageShapes) : les actions, la description, le prompt, la recette, les commentaires',
  showcase:
    'Les cartes vides de la vitrine (ShowcaseCardSkeleton) : en bande (carousel), puis en part égale de la rangée (fill)',
  testers: 'Les cartes vides d’« Ils cherchent des testeurs » (TesterCardSkeleton)',
  tags: 'Les étiquettes vides d’« Outils populaires » (TagSkeleton), dans leur zone de 44 points',
  pages:
    'Les formes de page entière (SkeletonPage, celles de LoadingScreen shape) : project, member, list, form',
  older: 'Les formes d’avant, gardées (SkeletonCard, SkeletonList de deux cartes)',
}

const en: typeof fr = {
  title: 'Loading',
  intro:
    'When the app starts on a phone, the bee writes the “w”, lands, then flies off again (a 4.6 s loop). In pages, skeletons in the shape of each page show the content on its way; a honey glow crosses them, still with “Reduce motion”.',
  loop: 'The animated logo (LoadingLogo), looping: 114 and 240 points wide',
  phases: 'Stopped at each phase (moment prop)',
  moments: [
    { at: 0.03, label: '3%: the run-up, fading in' },
    { at: 0.25, label: '25%: writing the “w”' },
    { at: 0.45, label: '45%: growing and straightening up' },
    { at: restMoment, label: '66%: landed, the logo' },
    { at: 0.8, label: '80%: flying off, the tail fading' },
    { at: 0.92, label: '92%: everything fades out' },
  ],
  calm: 'With “Reduce motion”: landed, still',
  day: 'day',
  night: 'night',
  shapes: 'The shapes (Shape): a block, a line, a round, a pill, in a see-through honey brown',
  surfaces:
    'The empty card (SkeletonSurface): card, tile and group corners; the glow (SkeletonGlow) passes 150 ms later from one column to the next',
  before:
    'Loading before 160 ms: its place is set, invisible and hidden from screen readers, then it fades in. “Replay” mounts it again',
  replay: 'Replay',
  shown: 'Loading shown: a single “Loading…” read for all its pieces',
  slow: 'Slow: after 4 s, “Go back” under the skeleton, moving nothing (LoadingScreen)',
  reveal:
    'Reveal: the skeleton fades into the content (180 ms, kept with “Reduce motion”); arrived before 160 ms, the content shows at once',
  arrive: 'Make the content arrive',
  again: 'Start again',
  arrived: 'The content arrived, in the same view as the skeleton (focus and typing stay).',
  delayed:
    'DelayedShapes: shapes outside a Loading (a member’s header with a known name) that wait 160 ms with it, saying nothing to screen readers',
  rows: 'Empty rows (SkeletonRows, 5 ListRowSkeleton rows), as StateMessage kind="loading"',
  rowKinds:
    'The empty rows of a list (ListRowSkeleton): round, tile, nothing at the start; thumbnail, pill, short line at the end',
  lines:
    'An empty text line as tall as a written one (TextLineShape): title2, body, caption; it grows with the text size (phone: fontScale; web: em)',
  pendingGroup:
    'ListGroup pending: the title read at once, the empty rows under “Loading…”, then the real rows and the footer under the same title',
  pendingTitle: 'By email',
  pendingArrive: 'Make the rows arrive',
  pendingAgain: 'Start the group again',
  pendingRow: 'Comments on your projects',
  pendingFooter: 'Security emails are always sent.',
  hiveHeader:
    'A hive’s empty top (HiveHeaderSkeleton): the badge at the real one’s size, the name, the count; then the empty column titles (HiveColumnTitleSkeleton: members, testers)',
  cover: 'A project’s empty gallery (ProjectCoverSkeleton): band (phone), medium (tablet)',
  projectParts:
    'The empty bottom of a project page (ProjectPageShapes): the actions, the description, the prompt, the recipe, the comments',
  showcase:
    'The showcase’s empty cards (ShowcaseCardSkeleton): in a band (carousel), then an equal share of the row (fill)',
  testers: 'The empty cards of “Looking for testers” (TesterCardSkeleton)',
  tags: 'The empty tags of “Popular tools” (TagSkeleton), in their 44-point zone',
  pages:
    'The whole-page shapes (SkeletonPage, those of LoadingScreen shape): project, member, list, form',
  older: 'The shapes from before, kept (SkeletonCard, SkeletonList of two cards)',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

/** Les largeurs des exemples posés côte à côte : une carte étroite, celle d'un téléphone. */
const NARROW = 300
/** Les hauteurs des cartes vides de l'exemple des coins. */
const SURFACE_HEIGHT = 96
/** Le rond et la pastille de l'exemple des formes (la photo d'un auteur, un bouton « Tester »). */
const ROUND = 40
const PILL = { height: 36, width: 96 } as const
const BLOCK = 90
const LINE = 14

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface variant="grouped" padding="lg" gap="md">
      <Text variant="headline" tone="secondary">
        {title}
      </Text>
      {children}
    </Surface>
  )
}

/**
 * Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine) : l'exemple de
 * nuit se voit sur du noir même dans un catalogue de jour.
 */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}

/** Une pièce posée à une largeur donnée (une colonne de téléphone). */
function Sized({ width, children }: { width: number; children: ReactNode }) {
  return <View style={{ width, maxWidth: '100%' }}>{children}</View>
}

export function LoadingCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Block title={l.loop}>
        <Stack direction="row" gap="xl" wrap align="center">
          <LoadingLogo />
          <LoadingLogo width={240} />
        </Stack>
      </Block>
      <Block title={l.phases}>
        <Stack direction="row" gap="xl" wrap align="end">
          {/* paddingX : à 3 %, l'abeille arrive de la gauche, hors du cadre du logo ; cette marge
              la garde dans la carte (et garde les phases alignées entre elles). */}
          {l.moments.map((moment) => (
            <Stack key={moment.at} gap="sm" align="center" paddingX="xl">
              <LoadingLogo width={160} moment={moment.at} />
              <Text variant="micro" tone="muted">
                {moment.label}
              </Text>
            </Stack>
          ))}
        </Stack>
      </Block>
      <Block title={l.calm}>
        <LoadingLogo moment={restMoment} />
      </Block>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue (ce ThemeProvider-là ne touche pas à la page).
        <ThemeProvider key={scheme} appearance={scheme}>
          <Pieces l={l} scheme={scheme} />
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Toutes les pièces d'un thème, l'une sous l'autre. */
function Pieces({ l, scheme }: { l: Labels; scheme: (typeof schemes)[number] }) {
  const { t } = useTranslation()
  const of = (caption: string) => `${caption} — ${l[scheme]}`
  return (
    <Stack gap="md">
      <Example caption={of(l.shapes)}>
        <Loading shown>
          <Row gap="lg" wrap>
            <Shape height={BLOCK} width={120} />
            <Sized width={160}>
              <Shape height={LINE} width="100%" />
            </Sized>
            <Shape height={ROUND} width={ROUND} round />
            <Shape height={PILL.height} width={PILL.width} round />
          </Row>
        </Loading>
      </Example>
      <Example caption={of(l.surfaces)}>
        <Loading shown>
          <Row gap="md" wrap>
            {(['sheet', 'tile', 'group'] as const).map((radius, column) => (
              <Sized key={radius} width={200}>
                <SkeletonSurface radius={radius} column={column} height={SURFACE_HEIGHT} />
              </Sized>
            ))}
          </Row>
        </Loading>
      </Example>
      <Example caption={of(l.before)}>
        <Replay l={l}>
          {(key) => (
            <Sized key={key} width={NARROW}>
              <Loading>
                <SkeletonRows count={2} />
              </Loading>
            </Sized>
          )}
        </Replay>
      </Example>
      <Example caption={of(l.shown)}>
        <Sized width={NARROW}>
          <Loading shown>
            <SkeletonRows count={3} />
          </Loading>
        </Sized>
      </Example>
      <Example caption={of(l.slow)}>
        <Stack gap="xl" align="stretch">
          <Loading shown>
            <SkeletonPage shape="list" />
          </Loading>
          <Stack align="start">
            <Button label={t(($) => $.states.back)} onPress={noop} variant="secondary" />
          </Stack>
        </Stack>
      </Example>
      <Example caption={of(l.reveal)}>
        <RevealDemo l={l} />
      </Example>
      <Example caption={of(l.delayed)}>
        <Replay l={l}>
          {(key) => (
            <Sized key={key} width={NARROW}>
              <DelayedShapes>
                <Stack gap="sm">
                  <TextLineShape variant="callout" width="40%" />
                  <TextLineShape variant="body" width="90%" />
                  <TextLineShape variant="body" width="60%" />
                </Stack>
              </DelayedShapes>
            </Sized>
          )}
        </Replay>
      </Example>
      <Example caption={of(l.rows)}>
        <Loading shown>
          <SkeletonRows />
        </Loading>
      </Example>
      <Example caption={of(l.rowKinds)}>
        <Loading shown>
          <ListGroup>
            <ListRowSkeleton leading="round" trailing="square" />
            <ListRowSkeleton leading="square" trailing="pill" />
            <ListRowSkeleton leading="none" trailing="line" />
            <ListRowSkeleton leading="round" trailing="none" />
          </ListGroup>
        </Loading>
      </Example>
      <Example caption={of(l.pendingGroup)}>
        <PendingGroupDemo l={l} />
      </Example>
      <Example caption={of(l.hiveHeader)}>
        <Loading shown>
          <Stack gap="lg">
            <HiveHeaderSkeleton />
            <Sized width={NARROW}>
              <Stack gap="md">
                <HiveColumnTitleSkeleton column="members" />
                <HiveColumnTitleSkeleton column="testers" />
              </Stack>
            </Sized>
          </Stack>
        </Loading>
      </Example>
      <Example caption={of(l.lines)}>
        <Loading shown>
          <Sized width={NARROW}>
            <TextLineShape variant="title2" width="70%" />
            <TextLineShape variant="body" width="90%" />
            <TextLineShape variant="caption" width="45%" />
          </Sized>
        </Loading>
      </Example>
      <Example caption={of(l.cover)}>
        <Loading shown>
          <Stack gap="md">
            <ProjectCoverSkeleton shape="band" />
            <ProjectCoverSkeleton shape="medium" />
          </Stack>
        </Loading>
      </Example>
      <Example caption={of(l.projectParts)}>
        <Loading shown>
          <Stack gap="xl">
            <ActionsShapes wide={false} />
            <ActionsShapes wide />
            <DescriptionShapes />
            <PromptShapes />
            <RecipeShapes />
            <CommentsShapes />
          </Stack>
        </Loading>
      </Example>
      <Example caption={of(l.showcase)}>
        <Loading shown>
          <Stack gap="lg">
            <Row gap="md" wrap align="start">
              {[0, 1, 2].map((column) => (
                <ShowcaseCardSkeleton key={column} column={column} />
              ))}
            </Row>
            <Row gap="md" align="start">
              {[0, 1].map((column) => (
                <ShowcaseCardSkeleton key={column} size="fill" column={column} />
              ))}
            </Row>
          </Stack>
        </Loading>
      </Example>
      <Example caption={of(l.testers)}>
        <Loading shown>
          <Row gap="md" wrap align="start">
            {[0, 1, 2].map((column) => (
              <TesterCardSkeleton key={column} column={column} />
            ))}
          </Row>
        </Loading>
      </Example>
      <Example caption={of(l.tags)}>
        <Loading shown>
          <Row gap="sm" wrap>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <TagSkeleton key={index} index={index} />
            ))}
          </Row>
        </Loading>
      </Example>
      <Example caption={of(l.pages)}>
        <Stack gap="xxl">
          {(['project', 'member', 'list', 'form'] as const).map((shape) => (
            <Loading key={shape} shown>
              <SkeletonPage shape={shape} />
            </Loading>
          ))}
        </Stack>
      </Example>
      <Example caption={of(l.older)}>
        <Row gap="xl" wrap align="start">
          <Sized width={NARROW}>
            <SkeletonCard />
          </Sized>
          <Sized width={NARROW}>
            <SkeletonList count={2} />
          </Sized>
        </Row>
      </Example>
    </Stack>
  )
}

/**
 * Un exemple qui se remonte à la demande : « Rejouer » change la clé de son contenu, qui repart de
 * zéro (un `Loading` neuf attend de nouveau ses 160 ms). Rien ne bouge sans ce geste.
 */
function Replay({ l, children }: { l: Labels; children: (key: number) => ReactNode }) {
  const [round, setRound] = useState(0)
  return (
    <Stack gap="md" align="start">
      <Button
        label={l.replay}
        variant="secondary"
        size="small"
        onPress={() => setRound((was) => was + 1)}
      />
      {children(round)}
    </Stack>
  )
}

/**
 * Un groupe dont les lignes chargent (`ListGroup pending`), à la main : « Faire arriver le contenu »
 * passe `loading` à faux, les lignes vides fondent vers la vraie ligne et le pied ; le titre ne
 * bouge pas. « Recommencer » remonte l'exemple. Même compteur que `RevealDemo`.
 */
function PendingGroupDemo({ l }: { l: Labels }) {
  const [step, setStep] = useState(0)
  const loading = step % 2 === 0
  const round = Math.floor(step / 2)
  return (
    <Stack gap="md" align="start">
      <Button
        label={loading ? l.pendingArrive : l.pendingAgain}
        variant="secondary"
        size="small"
        onPress={() => setStep((was) => was + 1)}
      />
      <Sized key={round} width={NARROW}>
        <ListGroup
          title={l.pendingTitle}
          footer={l.pendingFooter}
          pending={{
            loading,
            rows: [
              <ListRowSkeleton key="a" leading="none" />,
              <ListRowSkeleton key="b" leading="none" />,
            ],
          }}
        >
          <ListRow label={l.pendingRow} onPress={() => {}} />
        </ListGroup>
      </Sized>
    </Stack>
  )
}

/**
 * Le fondu de `Reveal`, à la main : « Faire arriver le contenu » passe `loading` à faux, et le
 * squelette fond vers le contenu ; « Recommencer » remonte l'exemple, squelette compris.
 */
function RevealDemo({ l }: { l: Labels }) {
  // Une seule valeur qui avance à chaque toucher : paire, le squelette attend ; impaire, le contenu
  // est arrivé. Sa moitié est le tour, la clé de l'exemple. Le geste ne lit ainsi aucun état
  // capturé au rendu (`setStep((was) => was + 1)`), même si le bouton garde une ancienne fonction.
  const [step, setStep] = useState(0)
  const loading = step % 2 === 0
  const round = Math.floor(step / 2)
  return (
    <Stack gap="md" align="start">
      <Button
        label={loading ? l.arrive : l.again}
        variant="secondary"
        size="small"
        onPress={() => setStep((was) => was + 1)}
      />
      <Sized key={round} width={NARROW}>
        <Reveal
          loading={loading}
          skeleton={
            <Loading>
              <SkeletonRows count={2} />
            </Loading>
          }
        >
          <Surface variant="plain" padding="lg">
            <Text>{l.arrived}</Text>
          </Surface>
        </Reveal>
      </Sized>
    </Stack>
  )
}
