// La langue d'une page publique à adresse par langue (tranche R12, scénario « La langue de la
// page » ; relecture du plan, B1) : sous `/fr/…` et `/en/…`, un visiteur lit la page dans la langue
// de son adresse ; un membre connecté la lit dans la langue de son appli.
//
// Pourquoi une instance de traduction à part, plutôt que changer celle de l'appli : sur le web,
// l'appli est créée en français (le pré-rendu ne connaît pas le visiteur), et changer sa langue
// pendant le rendu redessinerait des composants déjà affichés. Une instance propre à la page, créée
// dans la bonne langue, donne le bon texte dès le premier rendu, HTML pré-rendu compris (Expo Router
// prépare une page par langue). Ensuite, une fois sûr qu'il s'agit d'un visiteur, on aligne aussi
// l'appli (feuilles de la racine, `<html lang>`), après l'affichage.
import { ensureLanguage, type Language } from '@ruche/i18n'
import { type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { I18nContext, I18nextProvider, useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { createPageI18n, keepAddressLanguage } from '../i18n'

export function PageLanguage({ language, children }: { language: Language; children: ReactNode }) {
  // L'instance de l'appli, posée par la mise en page racine (app/_layout.tsx), telle quelle :
  // `useTranslation` en rend un relais (react-i18next 18 ; une copie avant), un autre objet qu'on
  // ne doit pas reposer plus bas.
  const { i18n: copy } = useTranslation()
  const appI18n = useContext(I18nContext)?.i18n ?? copy
  const { state } = useMemberSession()
  // useMemo garde la même instance tant que la langue de l'adresse ne change pas ; le lien vers
  // l'autre langue en crée une neuve, déjà dans la langue visée.
  const pageI18n = useMemo(() => createPageI18n(language), [language])

  // R18 : dans le navigateur, l'anglais arrive à la demande. Une page `/en/…` ouverte par son
  // adresse l'a déjà (l'entrée de l'appli l'attend avant l'hydratation, `preparePageLanguage`), et
  // le pré-rendu a toujours les deux langues : l'instance est prête dès sa création. Mais une page
  // `/en/…` atteinte sans rechargement (le lien « English » du pied) peut arriver avant ses textes :
  // elle garde alors la langue de l'appli, celle de la page d'avant (pas d'écran vide, pas de texte
  // à moitié traduit), le temps que `ensureLanguage` les ajoute à l'instance. Si l'anglais n'arrive
  // pas, la page reste lisible dans cette langue.
  const [arrived, setArrived] = useState<object | null>(null)
  const ready = arrived === pageI18n || pageI18n.hasResourceBundle(language, 'translation')
  useEffect(() => {
    if (ready) return
    let cancelled = false
    ensureLanguage(pageI18n, language).then(
      () => {
        // Le paquet est dans l'instance : un rendu de plus pour l'afficher (React ne voit pas
        // l'ajout lui-même). Ignoré si l'adresse a changé de langue entre-temps.
        if (!cancelled) setArrived(pageI18n)
      },
      () => {
        // La page reste dans la langue de l'appli : rien à défaire.
      },
    )
    return () => {
      cancelled = true
    }
  }, [ready, pageI18n, language])

  // Une fois la session lue et vide (un visiteur), l'appli entière passe à la langue de l'adresse et
  // la garde : `<html lang>` (écrit par la racine à chaque changement) et les feuilles posées à la
  // racine (« Signaler ») suivent la page. Pendant la lecture, ou si elle échoue, on ne touche pas à
  // la langue de l'appli : ce peut être un membre.
  useEffect(() => {
    if (state === 'signedOut') keepAddressLanguage(appI18n, language)
  }, [state, appI18n, language])

  // Un membre connecté lit la page dans la langue de son appli (celle de son compte, LanguageSync).
  // Avant de le savoir (pré-rendu, lecture de la session), la langue de l'adresse : c'est celle du
  // HTML reçu. Le même fournisseur dans les deux cas : la page n'est jamais remontée, seul son texte
  // change. Les textes de l'adresse pas encore arrivés : la langue de l'appli, en attendant.
  return (
    <I18nextProvider i18n={state === 'signedIn' || !ready ? appI18n : pageI18n}>
      {children}
    </I18nextProvider>
  )
}
