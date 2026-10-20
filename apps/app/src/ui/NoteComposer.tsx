// Écrire une note dans le journal d'un projet (tranche 4b), pour son auteur. Fermé : un bouton
// « Publier une note » (et, juste après une publication, la confirmation « Note publiée. »).
// Ouvert : le champ « Ta note », sur plusieurs lignes, avec son compteur, puis « Publier la note »
// et « Annuler ». L'écran garde le texte et décide de l'ouverture ; le composant s'occupe du focus.
//
// Le focus du clavier ne se perd jamais : à l'ouverture, il va dans le champ ; à la fermeture
// (publiée ou annulée), le bouton qu'on vient de toucher disparaît, et le focus revient sur
// « Publier une note », à la même place, sans faire défiler la page. Échap referme le champ (web).
// Pendant l'envoi, le texte est figé et « Annuler » attend.
// En blanc, jamais en miel : sur la page d'un projet, l'action miel est « Tester la démo ».
// Sur téléphone, le bouton fermé peut afficher un texte plus court (« Commenter »), son nom lu
// restant complet (« Écrire un commentaire »). Ouvert à la demande du membre loin de ce qu'il
// regardait (`reveal` : une réponse au bout d'un fil, une modification), le champ défile en vue.
import { space } from '@ruche/brand'
import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { Button } from './Button'
import { focusWithoutScroll, revealWithoutJump } from './focus'
import { escapeCloses } from './keyboard'
import { MentionField, type MentionSuggestion } from './MentionField'
import { Notice } from './Notice'
import { TextField } from './TextField'
import { TextLink } from './TextLink'
import { useLayout } from './theme/layout'
import { useCalmMotion } from './theme/motion'

type Props = {
  open: boolean
  onOpen: () => void
  onCancel: () => void
  value: string
  onChangeText: (text: string) => void
  onSubmit: () => void
  /** La publication est en route : « Publier la note » attend, sans accepter un second appui. */
  pending?: boolean
  /** Le nombre de caractères permis (affiché par le compteur, et imposé par le champ). */
  max: number
  labels: {
    /** « Publier une note » */
    open: string
    /** Le texte affiché sur téléphone, plus court (« Commenter ») ; le nom lu reste `open`. */
    openShort?: string
    /** « Ta note » */
    field: string
    /** L'aide sous le champ. */
    hint: string
    /** « Publier la note » */
    submit: string
    /** « Annuler » */
    cancel: string
  }
  /** Un problème du texte lui-même, sous le champ (« Écris ta note avant de la publier. »). */
  fieldError?: string | undefined
  /** La publication a échoué : le message, au-dessus des boutons (le texte reste dans le champ). */
  error?: string | undefined
  /** La confirmation, une fois la note publiée (« Note publiée. »), sous le bouton refermé. */
  success?: string | undefined
  /**
   * Le champ prend le focus quand il apparaît (vrai par défaut). Faux dans le catalogue, qui en
   * montre plusieurs à la fois : la page sauterait jusqu'au dernier.
   */
  autoFocus?: boolean
  /**
   * Le champ, une fois ouvert, défile en vue s'il est hors de l'écran (web) : pour un champ qui
   * s'ouvre loin de là où l'on regardait. Seulement après un geste du membre.
   */
  reveal?: boolean
  /**
   * Le champ propose des membres à mentionner après « @ » (un commentaire, tranche 6b) : les
   * suggestions trouvées par l'écran, le nom de leur liste, et ce que le champ cherche.
   */
  mentions?: {
    suggestions: readonly MentionSuggestion[]
    label: string
    onQueryChange: (query: string | null) => void
  }
}

// Le peu du navigateur dont on a besoin ici : l'élément qui a le focus, et le corps de la page.
const lostFocus = () => {
  const document = (globalThis as { document?: { activeElement: unknown; body: unknown } }).document
  return !document?.activeElement || document.activeElement === document.body
}

export function NoteComposer({
  open,
  onOpen,
  onCancel,
  value,
  onChangeText,
  onSubmit,
  pending = false,
  max,
  labels,
  fieldError,
  error,
  success,
  autoFocus = true,
  reveal = false,
  mentions,
}: Props) {
  const { sizeClass } = useLayout()
  const calm = useCalmMotion()
  const openButton = useRef<View>(null)
  const field = useRef<View>(null)
  // Ce que montrait le composant au dessin précédent : on ne bouge le focus qu'à une fermeture.
  const wasOpen = useRef(open)
  useEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    // Le bouton touché (« Publier la note », « Annuler ») vient de disparaître : sur le web, le focus
    // est retombé sur la page. On le pose sur « Publier une note », revenu à la même place.
    if (closed && Platform.OS === 'web' && lostFocus()) focusWithoutScroll(openButton.current)
  }, [open])
  // Ouvert (à l'apparition, ou après un appui sur le bouton) : si on l'a demandé, le champ vient
  // dans l'écran, au dessin suivant (requestAnimationFrame), une fois sa place connue. Seulement
  // à l'ouverture : changer de réglage d'animation ensuite ne fait pas défiler la page.
  const calmNow = useRef(calm)
  calmNow.current = calm
  useEffect(() => {
    if (!open || !reveal) return
    const frame = requestAnimationFrame(() => revealWithoutJump(field.current, calmNow.current))
    return () => cancelAnimationFrame(frame)
  }, [open, reveal])

  if (!open) {
    return (
      <View style={{ gap: space.md, alignItems: 'flex-start' }}>
        <Button
          ref={openButton}
          label={sizeClass === 'compact' && labels.openShort ? labels.openShort : labels.open}
          spokenLabel={labels.open}
          icon="note-pencil"
          variant="secondary"
          size="compact"
          onPress={onOpen}
        />
        {success ? (
          <View style={{ alignSelf: 'stretch' }}>
            {/* polite : une confirmation se lit sans interrompre (role « status »), comme « Note
                supprimée. ». */}
            <Notice tone="success" message={success} polite />
          </View>
        ) : null}
      </View>
    )
  }
  // Les réglages du champ, les mêmes avec ou sans les suggestions de membres.
  const fieldProps = {
    // Échap referme le champ, comme « Annuler » (web), sauf pendant l'envoi. (Avec une liste de
    // membres ouverte, Échap la referme d'abord : voir MentionField.)
    ...escapeCloses(onCancel, pending),
    label: labels.field,
    value,
    onChangeText,
    hint: labels.hint,
    error: fieldError,
    multiline: true,
    maxLength: max,
    showCount: true,
    autoCapitalize: 'sentences' as const,
    // Le champ vient d'apparaître, à la demande du membre : on peut y écrire tout de suite.
    autoFocus,
    // Pendant l'envoi, le texte ne bouge plus : ce qui part est ce qu'on voit.
    editable: !pending,
  }
  return (
    <View ref={field} style={{ gap: space.md }}>
      {mentions ? (
        <MentionField
          {...fieldProps}
          suggestions={mentions.suggestions}
          suggestionsLabel={mentions.label}
          onQueryChange={mentions.onQueryChange}
        />
      ) : (
        <TextField {...fieldProps} />
      )}
      {error ? <Notice message={error} /> : null}
      {/* « Annuler » en simple lien, comme dans l'en-tête des formulaires : on voit d'emblée lequel
          des deux publie. Ils passent l'un sous l'autre quand la place manque. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.lg }}>
        <Button
          label={labels.submit}
          icon="paper-plane-tilt"
          variant="secondary"
          size="compact"
          loading={pending}
          onPress={onSubmit}
        />
        {/* Pendant l'envoi, « Annuler » mentirait : la note part quand même. Il attend. */}
        <TextLink label={labels.cancel} role="button" onPress={onCancel} disabled={pending} />
      </View>
    </View>
  )
}
