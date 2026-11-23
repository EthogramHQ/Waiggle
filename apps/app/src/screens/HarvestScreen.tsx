// La page « Ma récolte » (« /harvest », tranche R19, docs/scenarios/refonte.md, « R19 — La
// gamification » ; planches R19-Recolte et R19-Recolte-Desktop). Une page poussée, ouverte depuis
// le panneau du niveau de sa propre page : tout ce que le membre a récolté, dans l'ordre de la
// planche :
// - le panneau du niveau (niveau, titre, rayon, pollen avant le niveau suivant, semaines butinées),
//   sans le miel, que « Mon miel » dit plus bas ;
// - « Cette semaine » : le pollen de la semaine, une barre par famille de gestes, « Semaine
//   butinée » dès le premier geste qui compte ;
// - « Mon défi » : trois défis à choisir (toute la semaine), aucun (« Pas cette semaine », qui se
//   défait), en cours ou réussi ;
// - « Défis de mes ruches » (seulement avec une ruche de 3 membres au moins) ;
// - « Classement de la semaine » : le lien vers la page, ou la phrase du retrait et « Changer ce
//   choix » vers les réglages ;
// - « Mon miel » : le solde, d'où il vient, où l'offrir, et « Décorer mon rayon » (une feuille) ;
// - « Mes sceaux · N » : les sceaux gagnés, et une ligne sobre pour les autres (option a4).
//
// L'écran n'écrit aucun style : il assemble les composants de `src/ui` (HarvestPanel, FamilyBars,
// ChallengeChoice, ChallengeCard, SealTile…). Sur ordinateur, deux colonnes (le contenu à gauche ;
// le niveau, le miel et le classement à droite), posées rangée par rangée : l'ordre de lecture
// (lecteur d'écran, touche Tab) suit ainsi celui des yeux.
import {
  type Harvest,
  HONEY,
  MilestoneSealCode,
  type OTHER_CATEGORY,
  PERSONAL_CHALLENGES,
  type PersonalChallengeCode,
  type PersonalChallengeState,
  type PROJECT_CATEGORIES,
  SEALS,
  type SealCode,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { useGameSettings, useHarvest } from '../gamification/api'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { AmountFigure } from '../ui/AmountFigure'
import { Button } from '../ui/Button'
import { CardGrid } from '../ui/CardGrid'
import { ChallengeCard } from '../ui/ChallengeCard'
import { ChallengeChoice } from '../ui/ChallengeChoice'
import { Columns } from '../ui/Columns'
import { FamilyBars } from '../ui/FamilyBars'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { HarvestPanel } from '../ui/HarvestPanel'
import type { IconName } from '../ui/Icon'
import { LevelCell } from '../ui/LevelCell'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { shortDate } from '../ui/relativeDate'
import { Screen } from '../ui/Screen'
import { SealTile, sealTileGrid } from '../ui/SealTile'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { DecorateSheet } from './DecorateSheet'
import { LoadingScreen } from './states'

/** Les adresses où mène la page. */
const RANKINGS_HREF = '/harvest/rankings'
const RANKINGS_SETTING_HREF = '/settings/appearance'

/**
 * La garde de session commune (accounts/SessionGate.tsx) : en attente, des rangées vides à la
 * largeur de la page ; un visiteur lit « Réservé aux membres ». La récolte ne se lit qu'avec une
 * session : elle vit dans `HarvestPage`.
 */
export function HarvestScreen() {
  return (
    <SessionGate width="page" loading={<LoadingScreen shape="list" width="page" />}>
      {() => <HarvestPage />}
    </SessionGate>
  )
}

function HarvestPage() {
  const { t } = useTranslation()
  // Sans page d'avant (lien direct, page rechargée, avis de l'Activité), le Retour mène à sa page.
  const back = useGoBack('/me')
  const harvest = useHarvest()
  const [retrying, setRetrying] = useState(false)

  const onRetry = async () => {
    setRetrying(true)
    await harvest.refetch()
    setRetrying(false)
  }

  const data = harvest.data
  return (
    <Screen header={<TopNav />} onBack={back} width="page" title={t(($) => $.game.harvest.title)}>
      {data ? (
        <HarvestContent harvest={data} />
      ) : harvest.isError || retrying ? (
        // La récolte ne se lit pas : on dit pourquoi et on propose de réessayer (le Retour, en
        // haut, reste l'autre issue).
        <StateMessage
          kind="error"
          title={t(($) => $.game.harvest.loadError)}
          message={t(($) => $.errors[errorKey(harvest.error)])}
          actions={[
            { label: t(($) => $.common.retry), onPress: () => void onRetry(), loading: retrying },
          ]}
        />
      ) : (
        <StateMessage kind="loading" message={t(($) => $.common.loading)} />
      )}
    </Screen>
  )
}

/** Une rubrique de la page : son titre (niveau 2), ce qui l'accompagne à droite, puis son contenu. */
function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <Stack gap="md">
      <Row justify="between" align="center" gap="sm" wrap>
        <Text variant="heading" heading={2}>
          {title}
        </Text>
        {aside}
      </Row>
      {children}
    </Stack>
  )
}

function HarvestContent({ harvest }: { harvest: Harvest }) {
  const { columns } = useLayout()
  const [decorating, setDecorating] = useState(false)

  const panel = <LevelPanel harvest={harvest} />
  const week = <WeekSection harvest={harvest} />
  const challenge = <ChallengeSection challenge={harvest.personalChallenge} />
  const hives = harvest.hiveChallenges.length > 0 ? <HivesSection harvest={harvest} /> : null
  const rankings = <RankingsSection inRankings={harvest.settings.inRankings} />
  const honey = <HoneySection honey={harvest.honey} onDecorate={() => setDecorating(true)} />
  const seals = <SealsSection harvest={harvest} />

  return (
    <>
      {columns ? (
        // Ordinateur (planche R19-Recolte-Desktop) : la semaine | le niveau ; les défis côte à côte
        // | le miel et le classement ; les sceaux sur toute la colonne principale.
        <Columns
          sideWidth="panel"
          gap="xxl"
          rows={[
            { main: week, side: panel },
            {
              main: hives ? <Columns sideWidth="panel" main={challenge} side={hives} /> : challenge,
              side: (
                <Stack gap="xxl">
                  {honey}
                  {rankings}
                </Stack>
              ),
            },
            { main: seals, side: null },
          ]}
        />
      ) : (
        // Téléphone (planche R19-Recolte) : une colonne, dans l'ordre des rubriques.
        <Stack gap="xxl">
          {panel}
          {week}
          {challenge}
          {hives}
          {rankings}
          {honey}
          {seals}
        </Stack>
      )}
      {/* La feuille « Décorer mon rayon » : un aperçu, une teinte, un motif, le prix. */}
      <DecorateSheet open={decorating} onClose={() => setDecorating(false)} />
    </>
  )
}

/**
 * Le panneau du niveau, sans le miel (« Mon miel » le dit) ni lien (on est sur la page). Un niveau
 * pas encore vu (`levelSeen`, venu d'un avis de l'Activité) : la cire coule dans l'alvéole, la
 * pastille « Nouveau » s'affiche, puis le niveau est noté vu à la fin du mouvement.
 */
function LevelPanel({ harvest }: { harvest: Harvest }) {
  const { t } = useTranslation()
  const settings = useGameSettings()
  const isNew = harvest.levelSeen < harvest.level
  const title = harvest.title
    ? t(($) => $.game.titles[`${harvest.title?.family ?? 'forager'}_${harvest.title?.form ?? 'f'}`])
    : undefined
  return (
    <HarvestPanel
      level={harvest.level}
      {...(title === undefined ? null : { title })}
      cells={harvest.cells}
      toNext={harvest.toNext}
      weeks={{ count: harvest.weeks.count, hibernating: harvest.weeks.hibernating }}
      // Option a11 : un nouveau membre (aucune semaine butinée) lit d'où vient le pollen.
      newcomerHint={harvest.weeks.count === 0}
      isNew={isNew}
      tint={harvest.decoration.tint}
      pattern={harvest.decoration.pattern}
      levelCell={
        <LevelCell
          level={harvest.level}
          size="regular"
          {...(isNew
            ? {
                rise: { from: harvest.levelSeen },
                onRisen: () => settings.mutate({ levelSeen: harvest.level }),
              }
            : null)}
        />
      }
    />
  )
}

/** « Cette semaine » : le pollen gagné, une barre par famille de gestes, et ce qu'il fait. */
function WeekSection({ harvest }: { harvest: Harvest }) {
  const { t } = useTranslation()
  return (
    <Section
      title={t(($) => $.game.harvest.week.title)}
      aside={
        harvest.weeks.currentForaged ? (
          <StatusPill label={t(($) => $.game.harvest.week.foraged)} />
        ) : null
      }
    >
      <Surface variant="grouped" padding="lg" gap="md">
        <AmountFigure
          text={t(($) => $.game.harvest.week.total, { amount: harvest.week.total })}
          amount={harvest.week.total}
        />
        <FamilyBars byFamily={harvest.week.byFamily} />
        <Text variant="caption" tone="muted">
          {t(($) => $.game.harvest.week.help)}
        </Text>
      </Surface>
    </Section>
  )
}

/**
 * « Mon défi ». Trois défis à choisir toute la semaine ; un défi choisi ne change plus. « Pas cette
 * semaine » se défait par « Choisir un défi », qui rouvre les trois mêmes sans rien envoyer.
 *
 * Après un envoi, le focus suit ce qui remplace les boutons partis (relecture d'interface du plan,
 * UI-3) : le libellé de la carte du défi choisi, ou « Choisir un défi » après « Pas cette semaine ».
 * Web : le focus du clavier, sans défilement ; téléphone : le lecteur d'écran.
 */
function ChallengeSection({ challenge }: { challenge: PersonalChallengeState }) {
  const { t } = useTranslation()
  const settings = useGameSettings()
  const [value, setValue] = useState<PersonalChallengeCode | null>(null)
  // « Choisir un défi » touché : les trois défis reviennent, sans requête.
  const [reopened, setReopened] = useState(false)
  // Un envoi parti, jusqu'à ce que la récolte relue montre son effet (le choix reste « occupé »
  // entre la réponse et la relecture, sinon il redeviendrait touchable un instant).
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [focusTo, setFocusTo] = useState<'card' | 'again' | null>(null)
  const cardRef = useRef<Focusable>(null)
  const againRef = useRef<Focusable>(null)

  // La récolte relue a changé l'état du défi : l'envoi est fini, le choix se referme. Ajusté
  // pendant le rendu (la façon que conseille React pour un état qui suit une prop), pas dans un
  // effet : sinon une image passerait avec l'ancien état.
  const [seenState, setSeenState] = useState(challenge.state)
  if (seenState !== challenge.state) {
    setSeenState(challenge.state)
    setSending(false)
    setReopened(false)
  }

  // Le focus va à ce qui vient d'arriver, une fois monté.
  useEffect(() => {
    if (focusTo === null) return
    const node = focusTo === 'card' ? cardRef.current : againRef.current
    if (!node) return
    setFocusTo(null)
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  })

  const send = async (choice: PersonalChallengeCode | 'none') => {
    if (sending) return
    setSending(true)
    setFailed(false)
    try {
      await settings.mutateAsync({ personalChallenge: choice })
      setFocusTo(choice === 'none' ? 'again' : 'card')
    } catch {
      // Refusé : les trois défis restent, avec le message ; on peut réessayer.
      setSending(false)
      setFailed(true)
    }
  }

  const skip = () => {
    // Déjà « Pas cette semaine » (le choix rouvert) : on le referme, rien à envoyer.
    if (challenge.state === 'none') {
      setReopened(false)
      setFocusTo('again')
      return
    }
    void send('none')
  }

  const title = t(($) => $.game.harvest.challenge.title)
  if (challenge.state === 'choose' || (challenge.state === 'none' && reopened)) {
    return (
      <Section title={title}>
        <ChallengeChoice
          options={challenge.offered.map((code) => ({
            code,
            label: t(($) => $.game.challenges.personal[code]),
            honey: HONEY.challenge,
          }))}
          value={value}
          onChange={setValue}
          onConfirm={() => {
            if (value) void send(value)
          }}
          onSkip={skip}
          busy={sending}
          error={failed ? t(($) => $.game.harvest.challenge.error) : undefined}
        />
      </Section>
    )
  }
  if (challenge.state === 'none') {
    return (
      <Section title={title}>
        <Surface variant="grouped" padding="lg" gap="md">
          <Text>{t(($) => $.game.harvest.challenge.none)}</Text>
          <Row>
            <Button
              ref={againRef}
              variant="secondary"
              label={t(($) => $.game.harvest.challenge.chooseAgain)}
              onPress={() => {
                setValue(null)
                setReopened(true)
              }}
            />
          </Row>
        </Surface>
      </Section>
    )
  }
  const done = challenge.state === 'done'
  const target = done ? targetOfDone(challenge.code) : challenge.target
  return (
    <Section title={title}>
      <ChallengeCard
        label={t(($) => $.game.challenges.personal[challenge.code])}
        progress={done ? target : challenge.progress}
        target={target}
        state={done ? 'done' : 'active'}
        honey={HONEY.challenge}
        labelRef={cardRef}
      />
    </Section>
  )
}

/** Le but d'un défi réussi (le contrat ne le redit pas une fois réussi) : sa jauge est pleine. */
const targetOfDone = (code: PersonalChallengeCode) =>
  PERSONAL_CHALLENGES.find((one) => one.code === code)?.target ?? 1

/** « Défis de mes ruches » : un défi par ruche de 3 membres au moins, sans dire qui n'a rien fait. */
function HivesSection({ harvest }: { harvest: Harvest }) {
  const { t } = useTranslation()
  return (
    <Section title={t(($) => $.game.harvest.hives)}>
      <Stack gap="md">
        {harvest.hiveChallenges.map((challenge) => (
          <ChallengeCard
            key={challenge.hiveId}
            {...(challenge.hiveName ? { title: challenge.hiveName } : null)}
            titleLevel={3}
            label={t(($) => $.game.challenges.hive[challenge.code])}
            progress={challenge.progress}
            target={challenge.target}
            // Option a14 : un défi tiré ce lundi dit « Nouveau », jamais « 0 sur 10 ».
            state={challenge.done ? 'done' : challenge.isNew ? 'new' : 'active'}
            honey={HONEY.hiveChallenge}
          />
        ))}
      </Stack>
    </Section>
  )
}

/**
 * « Classement de la semaine » : la ligne qui mène au classement ; retiré des classements (option
 * b6), la phrase du retrait remplace la ligne, et « Changer ce choix » mène au réglage.
 */
function RankingsSection({ inRankings }: { inRankings: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  // Sur le web, la ligne est un vrai lien `<a>` : le routeur ouvre la page sans la recharger.
  const go = (href: string) => (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.()
    router.push(href)
  }
  return (
    <Section title={t(($) => $.game.harvest.rankings.title)}>
      {inRankings ? (
        <ListGroup>
          <ListRow
            icon="crown"
            label={t(($) => $.game.harvest.rankings.open)}
            href={RANKINGS_HREF}
            onPress={go(RANKINGS_HREF)}
            trailing="chevron"
          />
        </ListGroup>
      ) : (
        <Stack gap="md">
          <Text tone="secondary">{t(($) => $.game.harvest.rankings.off)}</Text>
          <ListGroup>
            <ListRow
              icon="gear-six"
              label={t(($) => $.game.harvest.rankings.change)}
              href={RANKINGS_SETTING_HREF}
              onPress={go(RANKINGS_SETTING_HREF)}
              trailing="chevron"
            />
          </ListGroup>
        </Stack>
      )}
    </Section>
  )
}

/**
 * « Mon miel » : le solde en grand, d'où il vient, puis ce qu'il permet. « Offrir du miel » se fait
 * depuis la page d'un projet : la ligne dit où, sans mener nulle part ; « Décorer mon rayon » ouvre
 * la feuille.
 */
function HoneySection({ honey, onDecorate }: { honey: number; onDecorate: () => void }) {
  const { t } = useTranslation()
  return (
    <Section title={t(($) => $.game.harvest.honey.title)}>
      <Stack gap="md">
        <Surface variant="grouped" padding="lg" gap="xs">
          <AmountFigure text={t(($) => $.game.honey, { amount: honey })} amount={honey} />
          <Text variant="caption" tone="muted">
            {t(($) => $.game.harvest.honey.help)}
          </Text>
        </Surface>
        <ListGroup>
          <ListRow
            icon="heart"
            label={t(($) => $.game.harvest.honey.offer)}
            detail={t(($) => $.game.harvest.honey.offerHint)}
          />
          <ListRow
            icon="paint-brush"
            label={t(($) => $.game.harvest.honey.decorate)}
            detail={t(($) => $.game.harvest.honey.decorateHint)}
            onPress={onDecorate}
            trailing="chevron"
          />
        </ListGroup>
      </Stack>
    </Section>
  )
}

/** Le nom et le dessin d'un sceau gagné, d'après son code (contrat, `SEALS`). */
const useSealOf = () => {
  const { t } = useTranslation()
  return (code: SealCode): { name: string; icon: IconName; matter: 'honey' | 'cream' } => {
    const known = SEALS.find((seal) => seal.code === code)
    if (!known) {
      // Une catégorie créée après R19 par un administrateur : son nom n'est pas dans nos textes.
      return {
        name: t(($) => $.game.seals.categoryOther, { category: code }),
        icon: 'shapes',
        matter: 'cream',
      }
    }
    const milestone = MilestoneSealCode.safeParse(code)
    const name = milestone.success
      ? t(($) => $.game.seals[milestone.data])
      : // Un sceau de catégorie de départ (`SEALS` n'en connaît pas d'autre) : son code est celui
        // de la catégorie, qui nomme son texte (« Cuisine explorée »).
        t(
          ($) =>
            $.game.seals.category[
              code as Exclude<(typeof PROJECT_CATEGORIES)[number], typeof OTHER_CATEGORY>
            ],
        )
    // L'icône du contrat est une icône de l'appli : un test (WaxSeal.icons.test.ts) le vérifie.
    return { name, icon: known.icon as IconName, matter: known.matter }
  }
}

/** « Mes sceaux · N » : chaque sceau gagné, avec sa date ; une ligne pour ceux qui restent. */
function SealsSection({ harvest }: { harvest: Harvest }) {
  const { t, i18n } = useTranslation()
  const sealOf = useSealOf()
  return (
    <Section title={t(($) => $.game.harvest.seals.mine, { count: harvest.seals.length })}>
      <Stack gap="lg">
        {harvest.seals.length > 0 ? (
          <CardGrid {...sealTileGrid}>
            {harvest.seals.map((earned) => {
              const seal = sealOf(earned.code)
              return (
                <SealTile
                  key={earned.code}
                  seal={{ icon: seal.icon, matter: seal.matter, size: 'regular', label: '' }}
                  name={seal.name}
                  date={shortDate(earned.earnedAt, i18n.language)}
                />
              )
            })}
          </CardGrid>
        ) : null}
        {/* Option a4 : pas de vitrine des sceaux manquants, une ligne sobre. */}
        <Text tone="muted">{t(($) => $.game.harvest.seals.more)}</Text>
      </Stack>
    </Section>
  )
}
