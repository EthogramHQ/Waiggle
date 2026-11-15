// Une des quatre pages publiques de R11 (les Règles, la Confidentialité, les Mentions légales,
// l'Accessibilité), lisibles sans compte. PROVISOIRE : cet écran ne montre que le titre de la page,
// le temps que le vrai écran (le texte de la page, « En bref », ses parties, le sommaire sur
// ordinateur) le remplace. Il existe déjà pour que les quatre adresses soient construites et
// servies, et que les liens qui y mènent ne tombent pas sur « introuvable ».
import type { LegalPage } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'

type Props = {
  /** La page à montrer ; son nom est aussi son adresse (`/rules`, `/privacy`…). */
  page: LegalPage
}

export function LegalPageScreen({ page }: Props) {
  const { t } = useTranslation()
  // Le titre de chaque page, écrit avec ses textes (packages/i18n, `legal.pages`).
  // `Record<LegalPage, …>` oblige à donner un titre à chaque page : une cinquième page ajoutée au
  // contrat ferait échouer le typage ici, au lieu d'afficher une page sans titre.
  const titles: Record<LegalPage, string> = {
    rules: t(($) => $.legal.pages.rules.title),
    privacy: t(($) => $.legal.pages.privacy.title),
    legal: t(($) => $.legal.pages.legal.title),
    accessibility: t(($) => $.legal.pages.accessibility.title),
  }
  const title = titles[page]

  return (
    <Screen pageTitle={title}>
      <Text variant="title2" heading={1}>
        {title}
      </Text>
    </Screen>
  )
}
