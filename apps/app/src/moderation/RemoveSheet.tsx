// La fenêtre « Retirer » de la modération (R9, 7d ; planches R9-Retirer et
// R9-Moderation-Detail-Telephone). Elle s'ouvre depuis le détail d'un signalement de la file, sur
// téléphone comme sur ordinateur (une feuille : du bas sur téléphone, un panneau centré sinon).
//
// - « Que retirer ? » : « Seulement cette partie : la photo 2 » (choisi d'avance) ou « Tout le
//   projet ». Une partie qui ne se retire pas seule (le titre, le pitch : REMOVABLE_PARTS) ne laisse
//   que le contenu entier ; un profil ne se retire jamais entier (il se suspend) : seulement sa
//   partie ; un commentaire n'a pas de partie. Dans ces cas, pas de choix à faire.
// - Le fondement, dans un menu, rien de choisi d'avance (décision du 13/11/2026) : la loi, ou les
//   règles de l'appli.
// - L'explication, « Montrée à Inès Haddad » : l'autrice la lira.
// - Le mot de passe, seulement si l'API le redemande (plus de 10 retraits dans l'heure) : le champ
//   apparaît, et « Confirmer » renvoie le même retrait avec lui.
//
// Gardes : la feuille s'ouvre sous le doigt qui vient de toucher « Retirer » ; ses boutons ignorent
// donc une tape pendant 600 ms (`guardTaps`). Un envoi à la fois : une double tape ne retire qu'une
// fois. Pendant l'envoi, la feuille ne se ferme pas (`busy`). L'API refait toutes les vérifications.
import {
  isRemovablePart,
  type ModerationDecisionInput,
  type ModerationQueueItem,
  REMOVAL_EXPLANATION_MAX,
  REMOVALS_BEFORE_PASSWORD,
  RemovalExplanation,
  type RemovalGround,
  type RemovedItem,
  type ReportPart,
  SUSPENSIONS_BEFORE_PASSWORD,
} from '@ruche/contracts'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import type { Focusable } from '../ui/focus'
import { Hint } from '../ui/Hint'
import type { ImageSource } from '../ui/image'
import { MenuField } from '../ui/MenuField'
import { QuotedContent } from '../ui/QuotedContent'
import { RadioGroup } from '../ui/Radio'
import { RemovalNotice } from '../ui/RemovalNotice'
import { Sheet, type SheetNotice, useSheetAside } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { useDecide } from './api'
import { decisionFailure } from './failure'
import { firstText } from './ModerationDetail'
import { partText } from './present'

type Props = {
  /** L'élément de la file à retirer (sa cible et sa partie). */
  item: ModerationQueueItem | RemovedItem
  open: boolean
  /** « Annuler », la croix, Échap, le voile : la feuille se ferme sans rien décider. */
  onClose: () => void
  /** Le retrait est fait : l'écran ferme la feuille et dit le résultat. */
  onDone: () => void
  /**
   * Web : où rendre le focus à la fermeture (voir `Sheet`), lu au moment de fermer. Après un
   * retrait, le bouton « Retirer » qui a ouvert la feuille a laissé la place au résultat
   * (« Contenu retiré. ») : rendu à cet ouvreur parti, le focus tombait sur la page (R9, C8). Rien
   * (null) : l'ouvreur, toujours là quand rien n'a été décidé.
   */
  returnFocusTo?: () => unknown
}

/** Que retirer : la partie seule, ou tout le contenu. */
type Scope = 'part' | 'whole'

/** Les sortes de contenu qui se retirent entières et ont une partie (un profil se suspend). */
type WholeKind = 'project' | 'update' | 'call' | 'message'
const WHOLE_KINDS: readonly string[] = [
  'project',
  'update',
  'call',
  'message',
] satisfies WholeKind[]

/** La partie telle que l'API l'attend : sans `mediaId` pour une partie sans photo (schéma strict). */
const sentPart = (part: NonNullable<ModerationQueueItem['part']>): ReportPart => ({
  field: part.field,
  ...(part.mediaId ? { mediaId: part.mediaId } : null),
})

type T = ReturnType<typeof useTranslation>['t']

/**
 * Ce que la feuille rappelle du contenu visé : une vignette quand l'API en donne l'adresse (la
 * capture d'un message de testeur, la photo d'un appel), sinon un texte. Le texte de la partie
 * visée quand la copie le porte (la description), à défaut le premier texte de la copie ; une
 * partie image sans adresse (une photo publique, que la file ne montre pas) se dit par son nom
 * (« La photo 2 »). Un contenu déjà retiré porte son texte.
 */
function quotedOf(
  item: ModerationQueueItem | RemovedItem,
  partLabel: string | null,
  t: T,
  mediaSource: (url: string) => ImageSource | null,
): { text?: string; picture?: { name: string; source: ImageSource } } {
  if ('text' in item) return { text: item.text }
  const wanted = item.part?.field
  const image = item.images.find(
    (candidate) =>
      candidate.state === 'present' &&
      candidate.url &&
      candidate.field === (wanted ?? candidate.field),
  )
  const source = image?.url ? mediaSource(image.url) : null
  if (image && source) {
    return { picture: { name: t(($) => $.moderation.images[image.field]), source } }
  }
  const own = item.snapshot.find((entry) => entry.field === wanted)?.value
  const text = own ?? firstText(item.snapshot)
  if (text) return { text }
  return partLabel ? { text: partLabel.charAt(0).toLocaleUpperCase() + partLabel.slice(1) } : {}
}

export function RemoveSheet({ item, open, onClose, onDone, returnFocusTo }: Props) {
  const { t } = useTranslation()
  const signInAgain = useSignInAgain()
  const { decide } = useDecide()
  // La feuille posera-t-elle sa colonne `aside` à côté du formulaire ? (Sinon l'aperçu va dessous.)
  const besideRoom = useSheetAside()
  const kind = item.target.kind
  const part = item.part
  // La partie peut-elle se retirer seule ? Et le contenu entier (jamais un profil) ?
  const partAlone = part !== null && isRemovablePart(kind, part.field)
  const wholeKind = WHOLE_KINDS.includes(kind) ? (kind as WholeKind) : null
  const offerChoice = partAlone && wholeKind !== null
  const partLabel = part ? partText(part, t, kind) : null
  // Le nom de l'auteur et le titre du contenu, que la file seule connaît (pas les retirés).
  const record = 'authorRecord' in item ? item.authorRecord : null
  const context = 'context' in item ? item.context : null
  const contentTitle = context?.title ?? record?.name ?? null

  // Ce qu'on rappelle du contenu : sa vignette (capture d'un testeur) ou son texte.
  const mediaSource = useMediaSources()
  const quoted = quotedOf(item, partLabel, t, mediaSource)

  const [scope, setScope] = useState<Scope>(partAlone ? 'part' : 'whole')
  const [ground, setGround] = useState<RemovalGround | null>(null)
  const [explanation, setExplanation] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [passwordAsked, setPasswordAsked] = useState(false)
  const [password, setPassword] = useState('')
  const [failure, setFailure] = useState<{ key: ApiErrorKey; passwordSent: boolean } | null>(null)
  const [sending, setSending] = useState(false)
  // Un envoi à la fois : l'état `sending` n'est à jour qu'au dessin suivant, ce drapeau tout de suite.
  const busy = useRef(false)
  // La ligne « Fondement », où la feuille pose le focus à l'ouverture.
  const groundRef = useRef<Focusable>(null)

  // À chaque ouverture, un formulaire neuf : ce qui a été écrit ou refusé la fois d'avant part
  // (l'erreur d'un formulaire refermé ne revient pas à la réouverture).
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setScope(partAlone ? 'part' : 'whole')
      setGround(null)
      setExplanation('')
      setFieldError(null)
      setPasswordAsked(false)
      setPassword('')
      setFailure(null)
    }
    wasOpen.current = open
  }, [open, partAlone])

  const removingPart = partAlone && scope === 'part'
  const text = explanation.trim()
  const ready = text !== '' && ground !== null && (!passwordAsked || password !== '')

  const submit = async () => {
    if (busy.current || !ready || ground === null) return
    if (!RemovalExplanation.safeParse(text).success) {
      setFieldError(t(($) => $.profile.errors.invalidCharacters))
      return
    }
    setFieldError(null)
    const input: ModerationDecisionInput = {
      action: 'remove',
      target: item.target,
      ...(removingPart && part ? { part: sentPart(part) } : null),
      ground,
      explanation: text,
      ...(passwordAsked ? { password } : null),
    }
    busy.current = true
    setSending(true)
    const result = await decide(input)
    busy.current = false
    setSending(false)
    if (result.ok) {
      onDone()
      return
    }
    if (result.error === 'passwordRequired' && !passwordAsked) {
      // Le champ apparaît ; ce qui a été choisi et écrit reste, l'ancien message s'efface.
      setFailure(null)
      setPasswordAsked(true)
      return
    }
    // Refusé : le message reste au pied, au-dessus du bouton, jusqu'à la réponse suivante.
    setFailure({ key: result.error, passwordSent: passwordAsked })
  }

  const notice: SheetNotice | null = failure
    ? failure.key === 'unauthorized'
      ? { message: t(($) => $.states.expired), action: signInAgain() }
      : { message: decisionFailure(t, failure.key, { passwordSent: failure.passwordSent }) }
    : null

  const title =
    partLabel && contentTitle && removingPart
      ? t(($) => $.moderation.removeSheet.title, { part: partLabel, title: contentTitle })
      : t(($) => $.moderation.removeTitle)

  const confirmLabel = passwordAsked
    ? t(($) => $.moderation.password.confirm)
    : removingPart && partLabel
      ? t(($) => $.moderation.removeSheet.confirmPart, { part: partLabel })
      : t(($) => $.moderation.confirmRemove)

  // « Ce que lira Inès Haddad » (planche R9-Retirer) : le bandeau que l'auteur lira, phrase par
  // phrase, tel que le formulaire le remplit (le fondement et l'explication paraissent quand ils
  // sont choisis et écrits), puis pourquoi le lui dire (DSA, article 17). Le retrait part toujours
  // d'un signalement ouvert (l'API l'exige) : « Après un signalement ». Sans la fiche de l'auteur
  // (un contenu déjà retiré), pas de nom à écrire, pas d'aperçu.
  const preview = record ? (
    <Stack gap="md">
      <Text variant="callout" weight={600} heading={3}>
        {t(($) => $.moderation.removeSheet.preview, { name: record.name })}
      </Text>
      <RemovalNotice
        title={t(($) => $.removal.banner)}
        lines={[
          t(($) => $.removal.onlyYou),
          t(($) => $.removal.afterReport),
          ...(ground ? [t(($) => $.removal.grounds[ground])] : []),
          ...(text ? [t(($) => $.removal.explanation, { explanation: text })] : []),
          t(($) => $.removal.contest),
        ]}
      />
      <Text variant="caption" tone="secondary">
        {t(($) => $.moderation.removeSheet.dsa)}
      </Text>
    </Stack>
  ) : null

  return (
    <Sheet
      open={open}
      title={title}
      // « Cette partie » seulement quand une partie se retire ; le contenu entier a son propre texte.
      subtitle={
        removingPart
          ? t(($) => $.moderation.removeSheet.message)
          : t(($) => $.moderation.removeMessage)
      }
      onClose={onClose}
      // Sur ordinateur, l'aperçu dans la colonne à droite du formulaire ; quand la fenêtre n'a pas
      // la place de la poser (téléphone, fenêtre étroite), il vient sous le formulaire.
      {...(preview && besideRoom ? { aside: preview } : null)}
      busy={sending}
      // Le focus d'ouverture : la première question (« Fondement »), ni « Annuler » ni « Retirer »
      // (R6a S1 : « Retirer » est inactif tant que le formulaire est vide).
      initialFocusRef={groundRef}
      {...(returnFocusTo ? { returnFocusTo } : null)}
      guardTaps
      notice={notice}
      footer={
        <Row gap="sm" justify="end" wrap>
          <Button
            label={t(($) => $.moderation.cancel)}
            variant="secondary"
            onPress={onClose}
            disabled={sending}
          />
          <Button
            // La clé change avec le libellé : « Confirmer » est un autre bouton que « Retirer ».
            key={passwordAsked ? 'password' : 'remove'}
            label={confirmLabel}
            variant="danger"
            icon="eye-slash"
            onPress={() => void submit()}
            loading={sending}
            disabled={!ready}
          />
        </Row>
      }
    >
      <Stack gap="xl">
        {/* Le contenu visé, rappelé comme dans la fenêtre de 7a : la feuille couvre la carte, on
            vérifie ici qu'on retire le bon. */}
        <QuotedContent
          label={t(($) => $.moderation.kinds[kind])}
          text={quoted.text}
          picture={quoted.picture}
        />

        {offerChoice && partLabel && wholeKind ? (
          <RadioGroup<Scope>
            label={t(($) => $.moderation.removeSheet.what)}
            options={[
              {
                value: 'part',
                label: t(($) => $.moderation.removeSheet.onlyPart, { part: partLabel }),
                detail: t(($) => $.moderation.removeSheet.rest[wholeKind]),
              },
              {
                value: 'whole',
                label: t(($) => $.moderation.removeSheet.whole[wholeKind]),
                detail: t(($) => $.moderation.removeSheet.wholeHint[wholeKind]),
              },
            ]}
            value={scope}
            onChange={setScope}
          />
        ) : null}

        <MenuField<RemovalGround>
          label={t(($) => $.moderation.groundLabel)}
          triggerRef={groundRef}
          value={ground}
          options={[
            { value: 'illegal', label: t(($) => $.moderation.grounds.illegal) },
            { value: 'rules', label: t(($) => $.moderation.grounds.rules) },
          ]}
          onChange={setGround}
          placeholder={t(($) => $.moderation.removeSheet.groundNone)}
        />

        <Stack gap="sm">
          <TextField
            label={t(($) => $.moderation.explanation)}
            value={explanation}
            onChangeText={setExplanation}
            hint={t(($) => $.moderation.explanationHint)}
            error={fieldError ?? undefined}
            multiline
            maxLength={REMOVAL_EXPLANATION_MAX}
            showCount
          />
          {record ? (
            <Hint
              icon="info"
              text={t(($) => $.moderation.removeSheet.shownTo, { name: record.name })}
            />
          ) : null}
        </Stack>

        {/* Le mot de passe redemandé par l'API : il arrive au-dessus du bouton, qui devient
            « Confirmer », inactif tant que rien n'est tapé. */}
        {passwordAsked ? (
          <TextField
            label={t(($) => $.moderation.password.label)}
            value={password}
            onChangeText={setPassword}
            hint={t(($) => $.moderation.password.hint, {
              suspensions: SUSPENSIONS_BEFORE_PASSWORD,
              removals: REMOVALS_BEFORE_PASSWORD,
            })}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        ) : null}

        {/* Tant que le bouton est inactif, la feuille dit ce qui manque encore. */}
        {!ready && !passwordAsked ? (
          <Hint icon="info" text={t(($) => $.moderation.removeSheet.missing)} />
        ) : null}

        {besideRoom ? null : preview}
      </Stack>
    </Sheet>
  )
}
