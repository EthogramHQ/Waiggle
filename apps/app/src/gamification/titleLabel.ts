// Le libellé d'un titre de la récolte (R19) : « Gardienne » ou « Gardien », selon la famille et la
// forme choisie dans « Mon profil ». En anglais, les deux clés portent le même mot (une seule
// forme). Une fonction à part, pour que les réglages et l'Activité écrivent le titre de la même
// façon.
import type { TitleFamily, TitleForm } from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import type { useTranslation } from 'react-i18next'

type T = ReturnType<typeof useTranslation>['t']

/** La clé du titre (« keeper_f ») : TypeScript vérifie qu'elle existe bien dans les textes. */
const titleKey = (family: TitleFamily, form: TitleForm) =>
  `${family}_${form}` as keyof Translation['game']['titles']

/**
 * Le titre d'une famille, à la forme donnée (« Butineuse », « Butineur »). R20 : `scout` est un
 * titre à part, porté par les Éclaireuses (« Éclaireuse », « Éclaireur », « Scout » en anglais).
 */
export const titleLabel = (t: T, family: TitleFamily, form: TitleForm): string =>
  t(($) => $.game.titles[titleKey(family, form)])
