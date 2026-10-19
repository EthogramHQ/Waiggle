// Écrire une note dans le journal d'un projet (tranche 4b), pour son auteur. Fermé : un bouton
// « Publier une note » (et, juste après une publication, la confirmation « Note publiée. »).
// Ouvert : le champ « Ta note », sur plusieurs lignes, avec son compteur, puis « Publier la note »
// et « Annuler ». L'écran garde le texte et décide de l'ouverture ; le composant s'occupe du focus.
//
// Le focus du clavier ne se perd jamais : à l'ouverture, il va dans le champ ; à la fermeture
// (publiée ou annulée), le bouton qu'on vient de toucher disparaît, et le focus revient sur
// « Publier une note », à la même place, sans faire défiler la page.
// En blanc, jamais en miel : sur la page d'un projet, l'action miel est « Tester la démo ».
import { space } from '@ruche/brand'
import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { Button } from './Button'
import { focusWithoutScroll } from './focus'
import { Notice } from './Notice'
import { TextField } from './TextField'
import { TextLink } from './TextLink'

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
}: Props) {
  const openButton = useRef<View>(null)
  // Ce que montrait le composant au dessin précédent : on ne bouge le focus qu'à une fermeture.
  const wasOpen = useRef(open)
  useEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    // Le bouton touché (« Publier la note », « Annuler ») vient de disparaître : sur le web, le focus
    // est retombé sur la page. On le pose sur « Publier une note », revenu à la même place.
    if (closed && Platform.OS === 'web' && lostFocus()) focusWithoutScroll(openButton.current)
  }, [open])

  if (!open) {
    return (
      <View style={{ gap: space.md, alignItems: 'flex-start' }}>
        <Button
          ref={openButton}
          label={labels.open}
          icon="note-pencil"
          variant="secondary"
          size="compact"
          onPress={onOpen}
        />
        {success ? (
          <View style={{ alignSelf: 'stretch' }}>
            <Notice tone="success" message={success} />
          </View>
        ) : null}
      </View>
    )
  }
  return (
    <View style={{ gap: space.md }}>
      <TextField
        label={labels.field}
        value={value}
        onChangeText={onChangeText}
        hint={labels.hint}
        error={fieldError}
        multiline
        maxLength={max}
        showCount
        autoCapitalize="sentences"
        // Le champ vient d'apparaître, à la demande du membre : on peut y écrire tout de suite.
        autoFocus={autoFocus}
      />
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
        <TextLink label={labels.cancel} role="button" onPress={onCancel} />
      </View>
    </View>
  )
}
