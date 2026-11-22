// Le choix de la langue, en contrôle segmenté. Pour un membre connecté, le choix est aussi
// enregistré sur son compte (voir profile/useChooseLanguage.ts).
//
// R18 : l'anglais arrive à la demande dans le navigateur. L'option touchée est occupée le temps que
// ses textes arrivent, l'ancienne reste cochée ; s'ils n'arrivent pas, la langue reste, et un
// message avec « Réessayer » paraît sous le contrôle.
import { space } from '@ruche/brand'
import { type Language, supportedLanguages } from '@ruche/i18n'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import {
  type LanguageChoice,
  useChooseLanguage,
  useSwitchLanguage,
} from '../profile/useChooseLanguage'
import { Notice } from './Notice'
import { Segmented, type SegmentedHandle } from './Segmented'

type Props = {
  /** compact : « FR / EN », pour un coin d'écran ; sinon les noms complets. */
  compact?: boolean
  /**
   * Une page réservée aux visiteurs (connexion, inscription, R2) : le choix ne change que l'écran,
   * sans lire la session ni écrire sur un compte (il n'y en a pas encore).
   */
  visitor?: boolean
}

export function LanguageSwitcher({ compact = false, visitor = false }: Props) {
  // Deux composants plutôt qu'un hook appelé ou non : React exige les mêmes hooks à chaque affichage.
  return visitor ? <VisitorChoice compact={compact} /> : <MemberChoice compact={compact} />
}

function MemberChoice({ compact }: { compact: boolean }) {
  return <Choice compact={compact} choice={useChooseLanguage()} />
}

function VisitorChoice({ compact }: { compact: boolean }) {
  return <Choice compact={compact} choice={useSwitchLanguage()} />
}

// En version compacte, le contrôle est posé seul au bout d'une rangée (`Row justify="end"`) : il en
// prend la largeur, contrôle à droite comme avant, pour que le message d'un échec ait la place de
// se lire dessous, au lieu de se tasser dans la largeur de « FR / EN ». Le contrôle compact se cale
// lui-même à gauche (`alignSelf` de `Segmented`) : une vue alignée à droite le ramène au bout.
const compactFrame = { flexGrow: 1, flexShrink: 1, gap: space.sm } as const
const fullFrame = { gap: space.sm } as const
const atEnd = { alignSelf: 'flex-end' } as const
const stretched = { alignSelf: 'stretch' } as const

function Choice({ compact, choice }: { compact: boolean; choice: LanguageChoice }) {
  const { t } = useTranslation()
  const { current, choose, loading, failed, retry } = choice
  const control = useRef<SegmentedHandle>(null)
  const onRetry = () => {
    // « Réessayer » part avec le message : le focus du clavier revient d'abord au contrôle (sur la
    // langue cochée, que Tab atteint), pour ne pas tomber sur la page entière.
    control.current?.focusChecked()
    void retry()
  }

  const segmented = (
    <Segmented<Language>
      label={t(($) => $.common.language)}
      // .map() transforme chaque langue en option du contrôle
      options={supportedLanguages.map((language) => ({
        value: language,
        // En version compacte, on affiche le code (« FR ») mais on lit le nom (« Français »).
        label: compact ? language.toUpperCase() : t(($) => $.common.languages[language]),
        spokenLabel: t(($) => $.common.languages[language]),
      }))}
      value={current}
      busy={loading}
      onChange={(language) => void choose(language)}
      fill={!compact}
      handle={control}
    />
  )

  return (
    <View style={compact ? compactFrame : fullFrame}>
      {compact ? <View style={atEnd}>{segmented}</View> : segmented}
      {failed ? (
        <View style={stretched}>
          <Notice
            message={t(($) => $.account.language.loadFailed)}
            action={{ label: t(($) => $.common.retry), role: 'button', onPress: onRetry }}
          />
        </View>
      ) : null}
    </View>
  )
}
