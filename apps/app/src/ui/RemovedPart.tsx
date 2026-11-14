// Une partie d'un contenu retirée par la modération, vue par son auteur, et lui seul (R9, planche
// `R9-Partie-Retiree`, décision L2 de Louis du 13/11/2026) : « La photo 2 a été retirée par la
// modération ». La partie reste sous ses yeux (la photo, la description…), suivie d'un encadré rouge
// pâle qui dit tout ce que l'article 17 du règlement européen sur les services numériques demande :
// que les autres ne la voient plus, qu'une personne a décidé (après un signalement ou non, jamais
// de qui), le fondement, l'explication, la date, comment contester (l'adresse écrite en clair, en
// lien qui ouvre la messagerie avec un objet prêt), et la justice. Puis « Remplacer » et
// « Supprimer », quand l'écran les permet.
//
// Le tout est un groupe nommé par son titre : un lecteur d'écran qui y entre entend d'abord quelle
// partie a été retirée. L'écran donne le titre, l'objet de « Contester » et les actions ; les
// phrases de la décision sont écrites ici, à partir de la `Removal` du contrat.
import { borders, radii, space } from '@ruche/brand'
import type { Removal } from '@ruche/contracts'
import { type ReactNode, type RefObject, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { ButtonPair } from './ButtonPair'
import { ContactLink } from './ContactLink'
import { type Focusable, focusWithoutScroll, moveReaderTo } from './focus'
import { Icon } from './Icon'
import { parisDateTime } from './parisTime'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** La taille de l'icône du titre : les phrases s'alignent sur le bord du cadre, pas sur elle. */
const ICON_SIZE = 20

type Props = {
  /** « La photo 2 a été retirée par la modération » : le titre de l'encadré et le nom du groupe. */
  title: string
  /** La décision, telle que le contrat la donne à l'auteur (fondement, explication, date…). */
  removal: Removal
  /** L'objet de l'e-mail de « Contester », qui nomme la décision et sa date (J12). */
  contestSubject: string
  /** « Remplacer » : null, le bouton n'est pas là (une partie qu'on ne remplace pas ici). */
  onReplace: (() => void) | null
  /** « Supprimer » : null, le bouton n'est pas là. */
  onDelete: (() => void) | null
  /** La partie elle-même (la photo, le texte retiré), que l'auteur voit encore. */
  children?: ReactNode
  /**
   * « Supprimer » est en cours (la photo part pour de bon, l'API peut mettre quelques secondes) :
   * le bouton montre son chargement, et « Remplacer » est inactif le temps de l'envoi.
   */
  deleting?: boolean
  /**
   * Le bouton « Supprimer », pour qui lui rend le focus : l'écran qui pose une confirmation avant
   * de supprimer le reprend à « Annuler ».
   */
  deleteRef?: RefObject<Focusable | null>
}

export function RemovedPart({
  title,
  removal,
  contestSubject,
  onReplace,
  onDelete,
  children,
  deleting = false,
  deleteRef,
}: Props) {
  const { t, i18n } = useTranslation()
  const { colors } = useTheme()
  const titleRef = useRef<Focusable>(null)
  // L'identifiant du titre : les deux boutons s'y rattachent (« Supprimer », puis le titre lu),
  // car deux parties retirées dans une page donnent deux boutons de même nom.
  const titleId = useId()

  // Le fondement est une clé fabriquée à partir de la valeur du contrat (« illegal », « rules ») :
  // recopiée dans une constante avant le sélecteur, comme le veut le typage des textes.
  const ground = removal.ground
  // Qui a décidé, et après quoi : jamais le nom du membre qui a signalé.
  const decided = removal.afterReport ? t(($) => $.removal.afterReport) : t(($) => $.removal.direct)
  // La date écrite en entier, à l'heure de Paris (« 12 novembre »), jamais « il y a 2 jours » :
  // l'encadré se relit longtemps après, et l'objet de « Contester » la reprend.
  const date = parisDateTime(removal.at, i18n.language).date

  const remove = onDelete
    ? () => {
        // Le bouton touché peut disparaître avec la partie (ou céder la place à une confirmation) :
        // le focus va d'abord au titre de l'encadré, pour ne jamais retomber en haut de la page, et
        // le lecteur d'écran du téléphone, qui n'a pas de focus du clavier, y va aussi.
        focusWithoutScroll(titleRef.current)
        moveReaderTo(titleRef.current)
        onDelete()
      }
    : null

  return (
    <View
      // Un groupe nommé, sans `accessible` : sur iOS, VoiceOver n'atteindrait plus ce qu'il contient.
      role="group"
      accessibilityLabel={title}
      style={{ gap: space.md }}
    >
      {children}
      <View
        style={{
          gap: space.sm,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
          borderRadius: radii.group,
          borderWidth: borders.hairline,
          // Le rouge pâle du bandeau d'erreur d'un formulaire (contrastPairs : dangerText,
          // textSecondary et text sur errorBand).
          backgroundColor: colors.errorBand,
          borderColor: colors.errorBorder,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          {/* Le bouclier est décoratif : le titre dit tout. Une vue autour : sur le web, un
              dessin seul rétrécit quand le titre est long. */}
          <View aria-hidden style={{ flexShrink: 0, paddingTop: space.xxs }}>
            <Icon name="shield-warning" size={ICON_SIZE} tone="danger" />
          </View>
          {/* flexShrink et minWidth 0 : le titre passe à la ligne au lieu de sortir du cadre. */}
          <View style={{ flexShrink: 1, flexGrow: 1, minWidth: 0 }}>
            <Text
              variant="callout"
              weight={700}
              tone="danger"
              focusRef={titleRef}
              nativeID={titleId}
            >
              {title}
            </Text>
          </View>
        </View>
        <Text variant="callout" tone="secondary">
          {t(($) => $.removal.part.onlyYou)}
        </Text>
        <Text variant="callout" tone="secondary">
          {`${decided} ${t(($) => $.removal.grounds[ground])}`}
        </Text>
        {/* L'explication est écrite par la personne qui a décidé : elle peut contenir une adresse
            ou un mot sans espace, coupé plutôt que de sortir du cadre. */}
        <Text variant="callout" tone="secondary" breakAnywhere>
          {t(($) => $.removal.explanation, { explanation: removal.explanation })}
        </Text>
        <Text variant="callout" tone="secondary">
          {t(($) => $.removal.part.date, { date })}
        </Text>
        {/* « Pour contester : » puis l'adresse, écrite en clair (elle se lit et se recopie, même
            sans appli de messagerie) et en lien qui ouvre un brouillon avec l'objet prêt. Une
            rangée qui passe à la ligne : à 320 points ou à 200 %, l'adresse descend sous le début.
            Le lien garde sa zone de 44 points, plus haute que la ligne : une marge négative la
            laisse déborder sur l'air des phrases voisines (qu'on ne touche pas), pour que la ligne
            ne paraisse pas détachée des autres. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.xs,
            marginVertical: -space.sm,
          }}
        >
          <Text variant="callout" tone="secondary">
            {t(($) => $.removal.part.contestLead)}
          </Text>
          <View style={{ flexShrink: 1, maxWidth: '100%' }}>
            <ContactLink subject={contestSubject} />
          </View>
        </View>
        <Text variant="callout" tone="secondary">
          {t(($) => $.removal.part.court)}
        </Text>
      </View>
      {onReplace || remove ? (
        <ButtonPair>
          {onReplace ? (
            <Button
              key="replace"
              label={t(($) => $.removal.part.replace)}
              icon="arrows-left-right"
              variant="secondary"
              onPress={onReplace}
              disabled={deleting}
              describedById={titleId}
              hint={title}
            />
          ) : null}
          {remove ? (
            <Button
              key="delete"
              ref={deleteRef}
              label={t(($) => $.removal.part.delete)}
              icon="trash"
              variant="danger"
              onPress={remove}
              loading={deleting}
              describedById={titleId}
              hint={title}
            />
          ) : null}
        </ButtonPair>
      ) : null}
    </View>
  )
}
