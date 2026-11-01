// Un message encadré : une erreur, une information ou une confirmation, avec son icône.
// accessibilityRole="alert" : les lecteurs d'écran lisent le message dès qu'il apparaît. Un message
// poli (« C’est fait. ») est un « status » : lu sans couper la parole, sur chaque plateforme à sa
// façon (rôle sur le web, région vivante sur Android, annonce demandée sur iOS).
// Une action peut suivre le message, dans le même cadre (« Me reconnecter » après « Ta session a
// expiré », tranche 6c) : c'est un lien à part, hors de l'alerte, pour que l'alerte ne lise que le
// message et que le lien reste atteignable au clavier et par VoiceOver.
// Une action peut appartenir à un groupe (`single`) : une seule notice du groupe à la fois sur
// l'écran, la première arrivée (« Ta session a expiré » une fois, même après deux actions refusées).
import { borders, radii, space } from '@ruche/brand'
import {
  createContext,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react'
import { AccessibilityInfo, Platform, View } from 'react-native'
import { Icon, type IconName, type IconTone } from './Icon'
import { Text, type Tone } from './Text'
import { TextLink } from './TextLink'
import { useTheme } from './theme/ThemeProvider'

/** La taille de l'icône, en points : le lien d'une action s'aligne sur le texte, juste après. */
const ICON_SIZE = 20

/** Ce qu'on peut faire après le message : un lien vers une autre page (« Me reconnecter »). */
export type NoticeAction = {
  label: string
  onPress: () => void
  /**
   * Le nom d'un groupe (« session ») : parmi les messages du même groupe affichés en même temps
   * sur un écran, seul le premier arrivé se montre. Deux actions refusées parce que la session a
   * expiré (Suivre, puis une réaction) disent la même chose : un seul « Me reconnecter » suffit.
   * Le message déjà affiché reste à sa place : en le remplaçant par un message posé ailleurs, on
   * ferait remonter ce qui le suit sous le doigt (relecture de la PR #29 : la rangée des réactions
   * remontait de 106 points, et une tape sur « Drôle » ouvrait la connexion). Un nouveau message
   * du groupe ne s'affiche donc pas, mais fait relire l'alerte affichée ; quand celle-ci
   * disparaît, le suivant prend la relève.
   */
  single?: string
}

// Les messages de chaque groupe, dans leur ordre d'arrivée : un petit magasin partagé par tout le
// module, hors de React. Chaque Notice d'un groupe s'y inscrit en paraissant et s'en retire en
// disparaissant ; useSyncExternalStore (un hook de React) redessine celles qu'un changement
// concerne. Une file, et non un simple « premier » : au retrait du premier, on sait qui prend la
// relève. `repeats` compte les messages arrivés pendant qu'un autre était affiché : chaque arrivée
// change la clé de l'alerte affichée, qui est ainsi posée à neuf et relue par les lecteurs d'écran.
// Un objet neuf à chaque changement : useSyncExternalStore compare les instantanés par identité.
type Group = { queue: readonly string[]; repeats: number }
const groups = new Map<string, Group>()
const listeners = new Set<() => void>()
const changed = () => {
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const join = (key: string, id: string) => {
  const group = groups.get(key)
  groups.set(
    key,
    group
      ? { queue: [...group.queue, id], repeats: group.repeats + 1 }
      : { queue: [id], repeats: 0 },
  )
  changed()
}
const leave = (key: string, id: string) => {
  const group = groups.get(key)
  const queue = (group?.queue ?? []).filter((other) => other !== id)
  if (group && queue.length > 0) groups.set(key, { queue, repeats: group.repeats })
  else groups.delete(key)
  changed()
}

// La portée des groupes : un écran. Sur téléphone, la page du dessous reste montée sous celle
// qu'on regarde ; sans portée, sa notice « session expirée » cacherait celle de la page visible.
// Un contexte React (une valeur transmise à tous les composants d'un sous-arbre, sans passer par
// leurs props) donne à chaque écran un nom unique ; sans fournisseur, une portée commune.
const ScopeContext = createContext('app')

/** Une portée pour les groupes de messages (`single`) : `Screen` en pose une par écran. */
export function NoticeScope({ children }: { children: ReactNode }) {
  const scope = useId()
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

/**
 * Hook : ce message est-il caché par un autre du même groupe, arrivé avant lui ? Et sinon, la clé
 * de son alerte, qui change à chaque message du groupe arrivé ensuite (pour le faire relire).
 * Un message qui n'est pas encore inscrit se montre seulement si son groupe est vide ; s'il en
 * attend un autre, il reste caché dès le premier dessin. useLayoutEffect inscrit le message avant
 * que l'écran soit peint : rien ne clignote. (La page pré-rendue du web n'a pas de groupe :
 * getServerSnapshot.)
 */
const useSingle = (single: string | undefined): { hidden: boolean; alertKey: number } => {
  const id = useId()
  const scope = useContext(ScopeContext)
  const key = single ? `${scope}:${single}` : undefined
  useLayoutEffect(() => {
    if (!key) return
    join(key, id)
    return () => leave(key, id)
  }, [key, id])
  const group = useSyncExternalStore(
    subscribe,
    () => (key ? groups.get(key) : undefined),
    () => undefined,
  )
  if (!group) return { hidden: false, alertKey: 0 }
  return { hidden: group.queue[0] !== id, alertKey: group.repeats }
}

/**
 * Hook : sur iOS, fait lire un message poli par VoiceOver quand il paraît, et à chaque fois que son
 * texte change. iOS n'a pas de région vivante : on demande la lecture, une fois, comme le toast
 * (theme/toast.tsx). Les alertes, elles, gardent leur rôle « alert ».
 */
const useIosAnnouncement = (active: boolean, message: string) => {
  useEffect(() => {
    if (active && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message)
  }, [active, message])
}

type Props = {
  message: string
  tone?: 'error' | 'info' | 'success'
  /**
   * Une simple confirmation (« Note supprimée. ») : role « status », lu par les lecteurs d'écran
   * sans couper ce qu'ils disaient, là où une alerte les interrompt.
   */
  polite?: boolean
  /** Un lien sous le message, dans le cadre ; il mène ailleurs (rôle link). */
  action?: NoticeAction | undefined
  /**
   * Pour y poser le focus du clavier quand le bouton touché disparaît (« Confirmer », sur la page
   * de désinscription) : le message prend sa place, jamais l'action suivante. Avec une ref, le
   * message peut recevoir le focus sur le web (tabIndex -1), sans devenir une étape de Tab.
   * C'est alors le focus qui le fait lire : la zone n'est plus annoncée en plus (aria-live off),
   * sinon certains lecteurs d'écran le liraient deux fois. Sur téléphone, où aucun focus du
   * clavier ne vient le lire, l'annonce reste.
   */
  ref?: Ref<View>
}

export function Notice({ message, tone = 'error', polite = false, action, ref }: Props) {
  const { colors } = useTheme()
  const { hidden, alertKey } = useSingle(action?.single)
  useIosAnnouncement(polite && !hidden, message)
  if (hidden) return null
  const looks: Record<
    NonNullable<Props['tone']>,
    { icon: IconName; iconTone: IconTone; text: Tone; background: string; border?: string }
  > = {
    // Miel 2 : l'erreur est un bandeau pâle cerné d'un trait rose (errorBand, errorBorder), plus
    // doux que l'ancien fond rose plein ; le texte rouge y garde son contraste (contrastPairs).
    error: {
      icon: 'warning-circle',
      iconTone: 'danger',
      text: 'danger',
      background: colors.errorBand,
      border: colors.errorBorder,
    },
    info: { icon: 'info', iconTone: 'amber', text: 'default', background: colors.honeySoft },
    success: {
      icon: 'check-circle',
      iconTone: 'success',
      text: 'default',
      background: colors.surfaceGrouped,
    },
  }
  const look = looks[tone]
  const frame = {
    padding: space.md,
    borderRadius: radii.small,
    backgroundColor: look.background,
    ...(look.border ? { borderWidth: borders.hairline, borderColor: look.border } : null),
  }
  // accessible : le message est lu d'un seul tenant (l'icône est décorative, seul le texte compte).
  // key : une alerte neuve quand un autre message du groupe arrive, pour qu'elle soit relue (seule
  // l'alerte change, le lien qui suit garde son focus).
  const alert = (
    <View
      key={alertKey}
      ref={ref}
      accessible
      {...(polite ? { role: 'status' as const } : { accessibilityRole: 'alert' as const })}
      // Sur Android, un rôle ne suffit pas à TalkBack : il lit un message poli quand il paraît
      // parce que c'est une « région vivante ». Pas sur le web, où react-native-web en ferait un
      // aria-live : le rôle « status » y est déjà annoncé (et la ref doit pouvoir le couper).
      {...(polite && Platform.OS === 'android'
        ? { accessibilityLiveRegion: 'polite' as const }
        : null)}
      {...(ref && Platform.OS === 'web'
        ? { tabIndex: -1 as const, 'aria-live': 'off' as const }
        : null)}
      style={[
        { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
        action ? null : frame,
      ]}
    >
      <Icon name={look.icon} size={ICON_SIZE} tone={look.iconTone} />
      <View style={{ flex: 1 }}>
        <Text variant="callout" tone={look.text}>
          {message}
        </Text>
      </View>
    </View>
  )
  if (!action) return alert
  // Avec une action : le cadre entoure le message et le lien. Le cadre lui-même n'est pas
  // « accessible » : sur iOS, il regrouperait ses enfants et VoiceOver n'atteindrait plus le lien.
  // Le lien s'aligne sur le texte du message (après l'icône de 20 points et l'écart). Sa zone à
  // toucher (44 points) donne déjà de l'air sous le mot : pas de marge du cadre en dessous.
  return (
    <View style={[frame, { paddingBottom: 0 }]}>
      {alert}
      <View style={{ paddingLeft: ICON_SIZE + space.sm, alignItems: 'flex-start' }}>
        <TextLink label={action.label} onPress={action.onPress} tone={look.text} />
      </View>
    </View>
  )
}
