// Ce que lit l'auteur d'un contenu retiré par la modération (tranche 6d) : le bandeau de son projet,
// de sa note ou de son commentaire. Une fonction pure, à part des hooks de api.ts : les tests d'écran
// remplacent api.ts sans perdre celle-ci.
//
// L'article 17 du règlement européen sur les services numériques (DSA) demande de dire à l'auteur :
// ce qui est retiré, qu'il est seul à le voir encore, si c'est après un signalement (jamais de qui),
// qu'une personne a décidé, le fondement, l'explication, et comment contester.
import type { Removal } from '@ruche/contracts'
import type { useTranslation } from 'react-i18next'
import type { RemovedBanner } from '../ui/RemovalNotice'

type T = ReturnType<typeof useTranslation>['t']

/** Le bandeau d'un contenu retiré, phrase par phrase, dans la langue de l'appli. */
export const removalBanner = (removal: Removal, t: T): RemovedBanner => ({
  title: t('removal.banner'),
  lines: [
    t('removal.onlyYou'),
    removal.afterReport ? t('removal.afterReport') : t('removal.direct'),
    t(`removal.grounds.${removal.ground}`),
    t('removal.explanation', { explanation: removal.explanation }),
    t('removal.contest'),
  ],
})
