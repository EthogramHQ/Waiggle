// La carte d'une invitation dans une ruche (tranche R10, planches R10-Ruches, R10-Inviter et
// R10-Etats ; relecture du plan, juridique C1 et interface 9, 12, 14).
//
// - Reçue (`mode` « received », par défaut), en tête de l'onglet Ruches : l'alvéole de la ruche,
//   « Nora Benali t'invite dans la ruche Atelier IA », « 6 membres · il y a 5 min », puis les trois
//   promesses (ce que rejoindre partage : on les lit avant d'atteindre « Rejoindre la ruche »),
//   « Rejoindre la ruche » (miel) et « Refuser » (blanc), et dessous « Refuser ne prévient
//   personne. ». À l'œil, les mots courts de la planche ; à l'oreille, le nom qui dit quelle
//   invitation (« Rejoindre la ruche Atelier IA », « Refuser l'invitation de Nora Benali ») : la
//   page peut en montrer plusieurs.
// - Le « … », dans l'en-tête, loin des deux boutons : « Signaler la ruche Atelier IA », seulement
//   quand l'écran le permet (`onReport`).
// - En aperçu (`preview`, « Ce que reçoit Max » dans la feuille « Inviter ») : la même carte, ses
//   promesses et ses boutons dessinés mais inertes (ni rôle, ni geste, ni focus : `Button drawing`),
//   sans « … », avec « Refuser ne prévient personne. » dessous, comme sur la carte reçue.
// - Refusée (`refused`) : elle reste à sa place, « Invitation refusée. » au lieu des boutons,
//   jusqu'au prochain passage sur la page ; le focus, qui était sur « Refuser », va au message. Elle
//   n'a plus de « … » : on ne signale plus une ruche dont on a refusé l'invitation (l'API non plus).
// - Une seule action miel par écran : `primary={false}` met « Rejoindre » en blanc (toutes les
//   invitations après la première).
//
// Une seule écriture à la fois : deux tapes rapides (ou « Rejoindre » puis « Refuser ») ne lancent
// qu'une promesse. La garde est un `ref`, lu et posé au toucher : un état React ne serait à jour
// qu'au rendu suivant, trop tard pour la seconde tape. Le bouton touché tourne pendant l'écriture
// (`loading`, qui garde le focus) ; l'échec, l'écran le dit, et l'on peut réessayer.
import { layout, radii, space } from '@ruche/brand'
import type { HiveInvitation as Invitation } from '@ruche/contracts'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'
import { useNameOf } from '../useNameOf'
import { ActionMenu } from './ActionMenu'
import { Button } from './Button'
import { ButtonPair } from './ButtonPair'
import { type Focusable, focusWithoutScroll, holdsFocus, moveReaderTo } from './focus'
import { HiveBadge } from './HiveBadge'
import { useRelativeDate } from './RelativeTime'
import { Stack } from './Stack'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  invitation: Invitation
  /** Rejoindre la ruche ; la promesse finit avec l'écriture (réussie ou non). */
  onAccept: () => Promise<void>
  /** Refuser l'invitation ; la promesse finit avec l'écriture. */
  onRefuse: () => Promise<void>
  /** « Signaler la ruche … », dans le « … » ; absent : pas de « … ». */
  onReport?: () => void
  /** received (par défaut) : l'invitation reçue ; preview : l'aperçu, inerte. */
  mode?: 'received' | 'preview'
  /** Refusée : « Invitation refusée. » à la place des boutons, et plus de « … ». */
  refused?: boolean
  /**
   * « Rejoindre la ruche » en miel (vrai par défaut). Une seule action miel par écran (règle du
   * design, notée au plan de R10) : quand l'écran montre plusieurs invitations, seule la première
   * l'a ; les autres ont « Rejoindre » en blanc, comme « Refuser ».
   */
  primary?: boolean
}

/** Cache une vue et ce qu'elle contient aux lecteurs d'écran : web, iOS et Android. */
const hiddenFromReaders = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
}

/** Le diamètre de la puce d'une promesse, en points. */
const BULLET = 5

/**
 * Le geste d'un bouton dessiné de l'aperçu : rien. `Button drawing` ne l'appelle jamais ; on ne lui
 * donne pas pour autant `onAccept` (défense en profondeur : l'aperçu ne doit rien pouvoir écrire).
 */
const inert = () => {}

/** Une promesse finie, quelle qu'en soit l'issue : la garde se relève. */
const settle = (promise: Promise<void>, done: () => void) => {
  promise.then(done, done)
}

/** Sur le web, le focus est-il tombé sur la page (son élément a disparu) ? */
const focusLost = (): boolean => {
  if (Platform.OS !== 'web') return false
  const doc = (globalThis as { document?: { activeElement?: unknown; body?: unknown } }).document
  return !doc?.activeElement || doc.activeElement === doc.body
}

export function HiveInvitation({
  invitation,
  onAccept,
  onRefuse,
  onReport,
  mode = 'received',
  refused = false,
  primary = true,
}: Props) {
  const { t } = useTranslation()
  // « de Nora Benali », « d’Inès » : le nom relié au texte selon la langue (`{{nameOf}}`).
  const nameOf = useNameOf()
  const preview = mode === 'preview'
  const { hive, inviter } = invitation
  // Dans une phrase qui dit déjà « la ruche » : « Rejoindre la ruche sans nom ».
  const hiveInline = hive.name ?? t(($) => $.hives.unnamedInline)
  const { label: relative } = useRelativeDate(invitation.createdAt)
  const line = inviter
    ? t(($) => $.hives.invitations.line, { name: inviter.name, hive: hiveInline })
    : t(($) => $.hives.invitations.lineNoInviter, { hive: hiveInline })
  const when = t(($) => $.hives.invitations.when, {
    members: t(($) => $.hives.members, { count: hive.memberCount }),
    relative,
  })
  const refuseNamed = inviter
    ? t(($) => $.hives.invitations.refuseNamed, { nameOf: nameOf(inviter.name) })
    : t(($) => $.hives.invitations.refuseNamedNoInviter, { hive: hiveInline })
  const hintId = useId()

  // La garde : vraie du toucher à la fin de l'écriture.
  const busy = useRef(false)
  const [running, setRunning] = useState<'accept' | 'refuse' | null>(null)
  // Le dernier geste de la carte : « Refuser » qui réussit fait passer la carte à « refusée ».
  const lastGesture = useRef<'accept' | 'refuse' | null>(null)
  const run = (gesture: 'accept' | 'refuse', write: () => Promise<void>) => {
    if (busy.current) return
    busy.current = true
    lastGesture.current = gesture
    setRunning(gesture)
    settle(write(), () => {
      busy.current = false
      setRunning(null)
    })
  }

  // « Refuser » a disparu avec le focus : il va au message qui le remplace, sans faire défiler la
  // page (et le lecteur d'écran du téléphone y va aussi). Seulement après un geste de cette carte :
  // une carte déjà refusée au chargement ne prend pas le focus.
  const card = useRef<View>(null)
  const refusedText = useRef<Focusable>(null)
  const wasRefused = useRef(refused)
  useEffect(() => {
    if (refused && !wasRefused.current && lastGesture.current === 'refuse') {
      if (focusLost() || holdsFocus(card.current)) focusWithoutScroll(refusedText.current)
      moveReaderTo(refusedText.current)
    }
    wasRefused.current = refused
  }, [refused])

  return (
    <View ref={card}>
      <Surface variant="grouped" padding="lg" gap="md">
        {/* L'en-tête : l'alvéole, qui invite où, la taille de la ruche et quand ; le « … » au bout. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
          {/* Un décor : la phrase nomme déjà la ruche. */}
          <View {...hiddenFromReaders} style={{ flexShrink: 0 }}>
            <HiveBadge icon={hive.icon} name={hive.name} size={44} />
          </View>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space.xxs }}>
            <Text variant="callout" weight={700} breakAnywhere>
              {line}
            </Text>
            <Text variant="caption" tone="secondary">
              {when}
            </Text>
          </View>
          {/* Pas sur une carte refusée (relecture de l'interface de R10, point 1) : l'API répond à
              l'invité qui a refusé comme pour une ruche inconnue, et « Signaler » menait à une
              feuille « introuvable », un cul-de-sac. */}
          {!preview && !refused && onReport ? (
            // Le menu dépasse un peu dans la marge de la carte : son icône s'aligne sur le texte,
            // sa zone garde ses 44 points.
            <View style={{ flexShrink: 0, marginTop: -space.sm, marginRight: -space.sm }}>
              <ActionMenu
                label={t(($) => $.hives.invitations.more, { hive: hiveInline })}
                items={[
                  {
                    label: t(($) => $.hives.invitations.report, { hive: hiveInline }),
                    icon: 'flag',
                    onPress: onReport,
                  },
                ]}
                variant="bare"
                align="end"
              />
            </View>
          ) : null}
        </View>

        {/* Les trois promesses (juridique C1) : ce que rejoindre partage, lu avant les boutons. */}
        <Stack gap="xs">
          {[
            t(($) => $.hives.invitations.promiseFaces),
            t(($) => $.hives.invitations.promiseProjects),
            t(($) => $.hives.invitations.promiseLeave),
          ].map((promise) => (
            <PromiseLine key={promise} text={promise} />
          ))}
        </Stack>

        <Stack gap="sm">
          {refused ? (
            // À la place des boutons, aussi haut qu'eux côte à côte, et « Refuser ne prévient
            // personne. » reste dessous : la carte garde sa hauteur, rien ne remonte sous le doigt.
            <View style={{ minHeight: layout.controlHeight.regular, justifyContent: 'center' }}>
              <Text tone="secondary" focusRef={refusedText}>
                {t(($) => $.hives.invitations.refused)}
              </Text>
            </View>
          ) : (
            <ButtonPair>
              <Button
                label={t(($) => $.hives.invitations.accept)}
                spokenLabel={t(($) => $.hives.invitations.acceptNamed, { hive: hiveInline })}
                variant={primary ? 'primary' : 'secondary'}
                onPress={preview ? inert : () => run('accept', onAccept)}
                loading={running === 'accept'}
                drawing={preview}
              />
              <Button
                label={t(($) => $.hives.invitations.refuse)}
                spokenLabel={refuseNamed}
                variant="secondary"
                onPress={preview ? inert : () => run('refuse', onRefuse)}
                loading={running === 'refuse'}
                drawing={preview}
                {...(preview
                  ? null
                  : { describedById: hintId, hint: t(($) => $.hives.invitations.refuseHint) })}
              />
            </ButtonPair>
          )}
          {/* Aussi dans l'aperçu : la feuille « Inviter » montre la carte telle que l'invité la
              lira, cette phrase comprise (elle n'y décrit alors aucun bouton). */}
          <Text variant="caption" tone="muted" {...(preview ? null : { nativeID: hintId })}>
            {t(($) => $.hives.invitations.refuseHint)}
          </Text>
        </Stack>
      </Surface>
    </View>
  )
}

/** Une promesse : sa puce (un décor) et sa phrase. */
function PromiseLine({ text }: { text: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      {/* La puce, à la hauteur de la première ligne du texte (21 points de haut, callout). */}
      <View
        {...hiddenFromReaders}
        style={{
          flexShrink: 0,
          width: BULLET,
          height: BULLET,
          marginTop: space.sm,
          borderRadius: radii.pill,
          backgroundColor: colors.textMuted,
        }}
      />
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
        <Text variant="callout">{text}</Text>
      </View>
    </View>
  )
}
