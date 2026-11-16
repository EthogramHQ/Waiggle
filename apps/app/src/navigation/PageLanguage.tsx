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
import type { Language } from '@ruche/i18n'
import { type ReactNode, useContext, useEffect, useMemo } from 'react'
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
  // change.
  return (
    <I18nextProvider i18n={state === 'signedIn' ? appI18n : pageI18n}>{children}</I18nextProvider>
  )
}
