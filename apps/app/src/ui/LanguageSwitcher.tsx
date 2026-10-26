// Le choix de la langue, en contrôle segmenté. Pour un membre connecté, le choix est aussi
// enregistré sur son compte (voir profile/useChooseLanguage.ts).
import { supportedLanguages } from '@ruche/i18n'
import { useTranslation } from 'react-i18next'
import { useChooseLanguage } from '../profile/useChooseLanguage'
import { Segmented } from './Segmented'

type Props = {
  /** compact : « FR / EN », pour un coin d'écran ; sinon les noms complets. */
  compact?: boolean
}

export function LanguageSwitcher({ compact = false }: Props) {
  const { t } = useTranslation()
  const { current, choose } = useChooseLanguage()

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
