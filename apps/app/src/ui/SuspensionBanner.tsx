// Le bandeau d'un compte suspendu (tranche 7c), en haut de chaque page du membre suspendu.
//
// Replié (décision de Louis du 27/10/2026) : le cadenas, une ligne forte qui dit que le compte est
// suspendu et jusqu'à quand (le jour et l'heure de Paris, ou « jusqu'à nouvel ordre »), et un bouton
// « Détails » qui déplie sur place. Déplié, en plus : après un signalement ou non (jamais de qui) et
// le fondement, l'explication de la modération, ce que le membre peut encore faire, et comment
// contester, par un lien qui ouvre la messagerie, ou devant la justice (article 17 du DSA ;
// relecture juridique J2, J3, J4). Le bandeau ne se masque jamais en entier : la ligne forte reste.
//
// Il se montre déplié sur l'accueil (`initiallyOpen`), et à la première visite après une suspension
// nouvelle ou changée (suspensionMemory.ts) ; replié ailleurs, pour que la page arrive vite sur un
// téléphone.
//
// Il reçoit la suspension telle que l'API la donne et écrit lui-même ses phrases : la barre du haut
// (`TopNav`) n'a qu'à le poser, une seule fois pour toutes les pages. Ce n'est pas une alerte : il
// est là dès l'ouverture de la page, et se lit à son tour, sans couper le lecteur d'écran (rôle
// « status »).
import { contactEmail, radii, readableWidth, space } from '@ruche/brand'
import type { Suspension } from '@ruche/contracts'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, View } from 'react-native'
import { Icon } from './Icon'
import { parisDateTime } from './parisTime'
import { isNewSuspension, noteSuspensionSeen, suspensionSignature } from './suspensionMemory'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useHydrated } from './theme/hydration'
import { useTheme } from './theme/ThemeProvider'

/** La taille de l'icône : les lignes dépliées s'alignent sur la ligne forte, juste après elle. */
const ICON_SIZE = 16
/**
 * L'écart entre le cadenas et la ligne forte. Serré, comme l'icône et le cadre : sur un téléphone de
 * 320 points à 200 % de texte, chaque point rendu à la phrase lui évite une ligne de plus (mesuré :
 * 6 lignes et 320 px de haut avec l'icône de 20 et des marges de 12, décision du 27/10/2026 :
 * moins de 300 px replié).
 */
const ICON_GAP = space.xs

/**
 * La largeur en dessous de laquelle la ligne forte ne partage plus sa rangée avec « Détails » : le
 * bouton passe alors dessous (petit téléphone, texte agrandi) plutôt que d'écraser la phrase.
 */
const HEADLINE_MIN_WIDTH = 200

type Props = {
  /** La suspension en cours (`Me.suspension`). */
  suspension: Suspension
  /**
   * true : déplié dès l'affichage, même si la suspension a déjà été vue (l'accueil). false : replié
   * dès l'affichage (le catalogue). Absent : selon la mémoire de l'appareil, déplié à la première
   * visite après une suspension nouvelle ou changée, replié ensuite.
   */
  initiallyOpen?: boolean | undefined
}

export function SuspensionBanner({ suspension, initiallyOpen }: Props) {
  const { t, i18n } = useTranslation()
  const { colors } = useTheme()
  // La date de fin s'écrit dans la langue du visiteur et selon l'année en cours, et le stockage de
  // l'appareil n'existe que dans le navigateur : la page pré-rendue ne connaît rien de tout cela.
  // On attend d'être dans le navigateur (ui/theme/hydration.ts).
  const hydrated = useHydrated()
  const signature = suspensionSignature(suspension)
  // Déplié ou replié ; null tant qu'on ne sait pas encore si cette suspension est nouvelle sur cet
  // appareil (le stockage se lit sans attendre l'écran, d'où une promesse).
  const [open, setOpen] = useState<boolean | null>(initiallyOpen ?? null)

  useEffect(() => {
    // Replié imposé (le catalogue) : un exemple ne compte pas comme une suspension vue.
    if (!hydrated || initiallyOpen === false) return
    // `cancelled` : si le bandeau disparaît avant la réponse du stockage (ou si React relance
    // l'effet, comme il le fait en développement), cette lecture ne décide plus rien et ne note
    // rien. Sinon, une seconde lecture trouverait la suspension déjà « vue » et la replierait.
    let cancelled = false
    void isNewSuspension(signature).then((isNew) => {
      if (cancelled) return
      // Une décision déjà prise (l'accueil, ou un geste) n'est jamais défaite : rien ne bouge sans
      // geste du membre.
      setOpen((current) => current ?? isNew)
      void noteSuspensionSeen(signature)
    })
    return () => {
      cancelled = true
    }
  }, [hydrated, signature, initiallyOpen])

  if (!hydrated || open === null) return null

  const { endsAt, ground, explanation } = suspension
  // La fin à l'heure de Paris, quel que soit le fuseau de l'appareil (J4) : la même que dans
  // l'e-mail.
  const end = endsAt ? parisDateTime(endsAt, i18n.language) : null
  const headline = end
    ? t(($) => $.suspension.headline, { date: end.date, time: end.time })
    : t(($) => $.suspension.headlineIndefinite)
  // Après un signalement ou non, et le fondement : la décision en une phrase, avant l'explication.
  const decision = suspension.afterReport
    ? t(($) => $.suspension.afterReport)
    : t(($) => $.suspension.direct)
  const decisionLine = t(($) => $.suspension.decisionLine, {
    decision,
    ground: t(($) => $.removal.grounds[ground]),
  })

  return (
    <View
      role="status"
      style={{
        gap: space.sm,
        // Des marges serrées (voir ICON_GAP) : le bandeau replié tient en peu de hauteur.
        paddingVertical: space.sm,
        paddingHorizontal: space.sm,
        borderRadius: radii.small,
        // Le fond miel pâle des informations, comme le bandeau d'un contenu retiré : le texte normal
        // s'y lit (contrastPairs : text sur honeySoft).
        backgroundColor: colors.honeySoft,
      }}
    >
      {/* La ligne forte et « Détails » : sur une rangée tant qu'il y a la place, « Détails » dessous
          sinon (flexWrap). La phrase ne descend jamais sous HEADLINE_MIN_WIDTH. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
          maxWidth: readableWidth,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: ICON_GAP,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: HEADLINE_MIN_WIDTH,
            minWidth: 0,
          }}
        >
          {/* Le cadenas est décoratif : la ligne forte dit tout. */}
          {/* Un léger retrait en haut : l'icône, plus petite que la ligne de texte, se centre sur
              la première ligne. */}
          <View aria-hidden style={{ paddingTop: space.xxs }}>
            <Icon name="lock-simple" size={ICON_SIZE} tone="amber" />
          </View>
          {/* flex 1 et minWidth 0 : la phrase passe à la ligne au lieu de sortir du cadre. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="callout" weight={700} breakAnywhere>
              {headline}
            </Text>
          </View>
        </View>
        {/* Le même bouton replie et déplie : il garde sa place et le focus, et dit son état
            (aria-expanded). Il reste à côté de la phrase, au-dessus de ce qu'il déplie. */}
        <TextLink
          role="button"
          label={t(($) => $.suspension.details)}
          expanded={open}
          onPress={() => setOpen((current) => !current)}
        />
      </View>
      {open ? (
        // Le détail, aligné sur la ligne forte (après le cadenas). Replié, il n'est pas dessiné du
        // tout : le lecteur d'écran ne lit que la ligne forte et le bouton.
        <View
          style={{
            gap: space.sm,
            paddingLeft: ICON_SIZE + ICON_GAP,
            maxWidth: readableWidth,
          }}
        >
          <Text variant="callout" breakAnywhere>
            {decisionLine}
          </Text>
          <Text variant="callout" breakAnywhere>
            {t(($) => $.suspension.explanation, { explanation })}
          </Text>
          {/* Ce qui reste possible, en plus petit : utile, mais moins pressant que la décision. */}
          <Text variant="caption" breakAnywhere>
            {t(($) => $.suspension.canStill)}
          </Text>
          <View>
            <Text variant="callout" breakAnywhere>
              {t(($) => $.suspension.contestLead)}
            </Text>
            {/* L'adresse, dans une ligne à elle (une donnée sans espace), en lien qui ouvre la
                messagerie, sans la page « Tu quittes… » réservée aux sites tiers. */}
            <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
              <TextLink
                label={contactEmail}
                breakAnywhere
                onPress={() => void Linking.openURL(`mailto:${contactEmail}`)}
              />
            </View>
            <Text variant="callout" breakAnywhere>
              {t(($) => $.suspension.contestCourt)}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}
