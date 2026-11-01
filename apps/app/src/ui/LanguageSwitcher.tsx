// Le choix de la langue, en contrôle segmenté. Pour un membre connecté, le choix est aussi
// enregistré sur son compte (voir profile/useChooseLanguage.ts).
import { type Language, supportedLanguages } from '@ruche/i18n'
import { useTranslation } from 'react-i18next'
import { useChooseLanguage } from '../profile/useChooseLanguage'
import { Segmented } from './Segmented'

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
  const { current, choose } = useChooseLanguage()
  return <Choice compact={compact} current={current} choose={choose} />
}

function VisitorChoice({ compact }: { compact: boolean }) {
  const { i18n } = useTranslation()
  return (
    <Choice
      compact={compact}
      current={i18n.language as Language}
      choose={(language) => void i18n.changeLanguage(language)}
    />
  )
}

function Choice({
  compact,
  current,
  choose,
}: {
  compact: boolean
  current: Language
  choose: (language: Language) => unknown
}) {
  const { t } = useTranslation()

  return (
    <Segmented
      label={t(($) => $.common.language)}
      // .map() transforme chaque langue en option du contrôle
      options={supportedLanguages.map((language) => ({
        value: language,
        // En version compacte, on affiche le code (« FR ») mais on lit le nom (« Français »).
        label: compact ? language.toUpperCase() : t(($) => $.common.languages[language]),
        spokenLabel: t(($) => $.common.languages[language]),
      }))}
      value={current}
      onChange={(language) => void choose(language)}
      fill={!compact}
    />
  )
}
