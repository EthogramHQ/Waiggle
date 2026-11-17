// Une des quatre pages publiques de R11 (« La conformité ») : les Règles (/rules), la
// Confidentialité (/privacy), les Mentions légales (/legal) et l'Accessibilité (/accessibility).
// Planches R11-Pages, R11-Pages-Nuit et R11-Pages-Desktop.
//
// Lisibles sans compte : l'écran ne lit ni la session ni l'API, et sur le web la page est
// pré-rendue en entier (un moteur de recherche, ou un visiteur sans JavaScript, lit tout le texte).
// Seul ce qui dépend de la fenêtre attend l'hydratation : `useLayout()` répond « téléphone » tant
// que la page n'est pas hydratée, comme le serveur qui l'a pré-rendue sans connaître la fenêtre,
// puis le « Sommaire » apparaît à côté du texte sur ordinateur.
//
// L'ordre de lecture : le titre de la page (niveau 1, posé par `Screen`), puis le corps
// (`ui/LegalDocument` : la version, « En bref », le sommaire sur ordinateur, le texte complet), puis
// le pied (`ui/LegalLinks` : les trois autres pages et l'adresse de contact).
import type { LegalPage } from '@ruche/contracts'
import { usePathname } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { legalDocument } from '../legal/documents'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { languageOfPath, publicPath } from '../publicPath'
import { LegalDocument, legalDocumentWidth } from '../ui/LegalDocument'
import { LegalLinks } from '../ui/LegalLinks'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { useLayout } from '../ui/theme/layout'

type Props = {
  /** La page à montrer ; son nom est aussi son adresse (`/rules`, `/privacy`…). */
  page: LegalPage
}

export function LegalPageScreen({ page }: Props) {
  const { t } = useTranslation()
  // Les textes de la page, traduits dans la langue de l'appli, paramètres remplis
  // (legal/documents.ts). Une quarantaine de textes : pas besoin de les garder d'un rendu à l'autre.
  const doc = legalDocument(page, t)
  // Le sommaire seulement quand le texte et lui tiennent côte à côte (ordinateur, dès 1 100 points).
  const wide = useLayout().sizeClass === 'wide'
  // Arrivé par un lien direct (un pied de page partagé, une recherche), rien derrière : l'accueil,
  // dans la langue de l'adresse sous `/fr/…` et `/en/…` (relecture de l'interface R12, A1 : `/`
  // reposait le choix de la langue, et un rechargement suivait celle du navigateur) ; `/` sous
  // `/rules`, qui n'a pas de langue.
  const language = languageOfPath(usePathname())
  const back = useGoBack(language ? publicPath('home', language) : '/')
  // Un lien du texte (la CNIL, le Défenseur des droits, le code source) quitte l'appli : il passe
  // par la page d'avertissement « Tu quittes… » (/out), comme tout lien extérieur.
  const openOutside = useOpenOutside()

  return (
    <Screen header={<TopNav />} onBack={back} title={doc.title} width={legalDocumentWidth(wide)}>
      <Stack gap="xxl">
        <LegalDocument
          version={doc.version}
          summary={doc.summary}
          sections={doc.sections}
          wide={wide}
          onLinkPress={openOutside}
        />
        {/* R12 (plan R12, décision 16) : sous `/fr/…` et `/en/…`, la même page dans l'autre
            langue, au bout du pied ; sous `/rules`, rien de plus. Pas de « Signaler un contenu » :
            l'adresse de contact du pied mène déjà au même endroit. */}
        <LegalLinks variant="footer" current={page} otherLanguage />
      </Stack>
    </Screen>
  )
}
