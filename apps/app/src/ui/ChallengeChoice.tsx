// Le choix du défi perso de la semaine (R19, rubrique « Mon défi » de « Ma récolte », planche
// R19-Recolte du lundi et option b1) : « Choisis ton défi », trois défis à cocher, chacun avec le
// miel qu'il rapporte, puis « Choisir ce défi » (la seule action miel de l'écran) et « Pas cette
// semaine ». Un défi choisi ne change plus de la semaine.
//
// Le composant ne lit aucune donnée et n'envoie rien : l'écran garde le défi coché (`value`), envoie
// le choix (`onConfirm`) ou le renoncement (`onSkip`), et dit quand l'envoi est en cours (`busy`) ou
// a échoué (`error`).
//
// Les défis sont un groupe de boutons radio (`ListGroup radio`, relecture d'interface du plan UI-3) :
// au clavier, Tab ne s'y arrête qu'une fois, les flèches cochent le voisin en faisant le tour.
// Sans défi coché, « Choisir ce défi » est inactif mais reste un arrêt de Tab, annoncé désactivé
// (`focusableWhenDisabled`) : on entend pourquoi il ne répond pas. Deux tapes rapides ne l'envoient
// qu'une fois (`useTapGuard`, la garde des fenêtres) : le choix est définitif pour la semaine.

import { space } from '@ruche/brand'
import type { PersonalChallengeCode } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { ListGroup, ListRow } from './ListGroup'
import { Notice } from './Notice'
import { StatusPill } from './StatusPill'
import { TextLink } from './TextLink'
import { useTapGuard } from './tapGuard'

/** Un défi proposé : son code, son libellé déjà traduit, le miel qu'il rapporte une fois réussi. */
export type ChallengeOption = {
  code: PersonalChallengeCode
  label: string
  honey: number
}

type Props = {
  /** Les défis proposés cette semaine (trois, `Harvest.personalChallenge.offered`). */
  options: ChallengeOption[]
  /** Le défi coché ; null tant qu'aucun ne l'est. */
  value: PersonalChallengeCode | null
  /** Un défi touché, ou atteint par les flèches. */
  onChange: (code: PersonalChallengeCode) => void
  /** « Choisir ce défi » : l'écran envoie le défi coché. */
  onConfirm: () => void
  /** « Pas cette semaine » : l'écran envoie le renoncement. */
  onSkip: () => void
  /** Le choix part : « Choisir ce défi » est annoncé occupé, et ni lui ni les défis ne répondent. */
  busy: boolean
  /** Le choix n'a pas pu s'enregistrer, déjà traduit (« Ce choix n'a pas pu s'enregistrer. »). */
  error?: string | undefined
}

/** La largeur de « Choisir ce défi », au plus (points) : comme les boutons d'une paire. */
const CONFIRM_MAX = 360

export function ChallengeChoice({
  options,
  value,
  onChange,
  onConfirm,
  onSkip,
  busy,
  error,
}: Props) {
  const { t } = useTranslation()
  const guard = useTapGuard()
  const none = value === null

  return (
    <View style={{ gap: space.md }}>
      <ListGroup radio title={t(($) => $.game.harvest.challenge.chooseTitle)}>
        {options.map((option) => {
          const price = t(($) => $.game.harvest.challenge.price, { amount: option.honey })
          return (
            <ListRow
              key={option.code}
              label={option.label}
              selected={option.code === value}
              // Pendant l'envoi, le choix coché ne change plus : c'est lui qui part.
              onPress={() => {
                if (!busy) onChange(option.code)
              }}
              // Le miel se voit dans sa pastille, et se lit après le nom : le nom d'un bouton radio
              // cache le texte qu'il contient.
              hint={price}
              accessory={<StatusPill label={price} />}
            />
          )
        })}
      </ListGroup>
      {/* « Choisir ce défi » prend la place, « Pas cette semaine » le suit, discret ; quand ils ne
          tiennent plus côte à côte (320 points, texte à 200 %), le lien passe dessous. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
          rowGap: space.sm,
        }}
      >
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', maxWidth: CONFIRM_MAX }}>
          <Button
            label={t(($) => $.game.harvest.challenge.confirm)}
            onPress={guard(onConfirm)}
            disabled={none}
            focusableWhenDisabled
            loading={busy}
          />
        </View>
        <TextLink
          role="button"
          label={t(($) => $.game.harvest.challenge.skip)}
          tone="muted"
          disabled={busy}
          onPress={onSkip}
        />
      </View>
      {/* Sous les boutons : la phrase qui paraît après un envoi ne les pousse pas sous le doigt. */}
      {error ? <Notice message={error} /> : null}
    </View>
  )
}
