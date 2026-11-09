// La feuille d'un outil du catalogue (tranche R6b), pour un administrateur : ajouter un « Autre »
// au catalogue (`admit`, depuis la Modération), créer un outil (`create`), ou modifier un outil
// (`edit`, depuis « Modifier » de sa page). Les mêmes champs dans les trois cas : le nom, la famille,
// une phrase neutre en français et en anglais (relecture juridique jur-T7 : ni prix, ni
// superlatif), et le site, facultatif.
//
// La feuille n'écrit rien elle-même : `onSubmit` reçoit les valeurs, déjà vérifiées par le schéma du
// contrat (`ToolAdmit`), et rend le résultat de l'écriture. Réussi : la feuille se ferme (`onClose`).
// Refusé : le message se lit sous le champ concerné (`field` : « Ce nom est déjà celui d'un
// outil… » sous le nom), ou au pied de la feuille, et ce qui est tapé reste.
//
// Ses sorties (relecture du plan, point 15, comme la feuille de publication) :
// - « Annuler », « Fermer », Échap, le voile et le glissé ferment une feuille non modifiée ;
// - modifiée, chacune demande d'abord « Abandonner les changements ? » (`closeGuard` de `Sheet`) ;
// - pendant l'écriture, rien ne ferme (`busy`) : « Annuler » mentirait, l'écriture continuerait ;
// - une seconde tape sur « Enregistrer » pendant l'écriture n'écrit pas une seconde fois ;
// - le Retour du navigateur quitte la page (la feuille n'a pas d'adresse à elle).
import {
  TOOL_DESCRIPTION_MAX,
  TOOL_FAMILIES,
  TOOL_NAME_MAX,
  ToolAdmit,
  type ToolFamily,
} from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey } from '../api/errors'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { Sheet } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { TextField, type TextFieldInput } from '../ui/TextField'
import { ProjectAbandonDialog } from './ProjectAbandonDialog'

/** Un champ de la feuille, tel que le contrat le nomme. */
export type ToolEditField = keyof ToolAdmit

/**
 * Le résultat d'une écriture, rendu par l'écran : réussi, ou refusé avec la clé du message
 * (`toolNameTaken`) et, s'il le sait, le champ en cause (son message se lit alors sous lui).
 */
export type ToolEditResult = { ok: true } | { ok: false; error: ApiErrorKey; field?: ToolEditField }

type Props = {
  open: boolean
  /** Ajouter un « Autre » au catalogue, créer un outil, ou modifier un outil du catalogue. */
  mode: 'admit' | 'create' | 'edit'
  /** Les valeurs de départ (le nom tapé par les membres, l'outil tel qu'il est), relues à chaque ouverture. */
  initial: Partial<ToolAdmit>
  /** L'écriture : reçoit des valeurs valides et rend son résultat. Ne doit jamais lever. */
  onSubmit: (values: ToolAdmit) => Promise<ToolEditResult>
  /** La feuille se ferme : fermée sans changement, abandonnée, ou après une écriture réussie. */
  onClose: () => void
  /**
   * Web : où va le focus quand la feuille se ferme, à la place du bouton qui l'a ouverte (voir
   * `Sheet`). Après « Ajouter au catalogue », ce bouton n'existe plus : le résultat de la carte.
   */
  returnFocusTo?: () => unknown
}

/** Ce qui est tapé : du texte partout (le site vide vaut « pas de site »), la famille ou rien. */
type Values = {
  name: string
  family: ToolFamily | null
  descriptionFr: string
  descriptionEn: string
  siteUrl: string
}

const valuesOf = (initial: Partial<ToolAdmit>): Values => ({
  name: initial.name ?? '',
  family: initial.family ?? null,
  descriptionFr: initial.descriptionFr ?? '',
  descriptionEn: initial.descriptionEn ?? '',
  siteUrl: initial.siteUrl ?? '',
})

const sameValues = (a: Values, b: Values) =>
  a.name === b.name &&
  a.family === b.family &&
  a.descriptionFr === b.descriptionFr &&
  a.descriptionEn === b.descriptionEn &&
  a.siteUrl === b.siteUrl

/** Le problème montré : la clé du message, et les champs en erreur (aucun : au pied seulement). */
type Problem = { error: ApiErrorKey; fields: ToolEditField[] }

export function ToolEditSheet({ open, mode, initial, onSubmit, onClose, returnFocusTo }: Props) {
  const { t } = useTranslation()
  const [values, setValues] = useState(() => valuesOf(initial))
  const [start, setStart] = useState(() => valuesOf(initial))
  const [problem, setProblem] = useState<Problem | null>(null)
  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState(false)
  // La garde de la double tape : un `ref`, lu avant que React ait redessiné le bouton.
  const savingNow = useRef(false)
  const nameRef = useRef<TextFieldInput>(null)

  // Chaque ouverture repart des valeurs de départ, sans l'erreur d'un envoi précédent (règle du
  // design : l'erreur d'un formulaire refermé disparaît à la réouverture). Changer un état pendant
  // le rendu, quand une prop change, est la façon que React recommande (pas d'image fausse entre deux).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(valuesOf(initial))
      setStart(valuesOf(initial))
      setProblem(null)
      setAsking(false)
    }
  }

  const dirty = !sameValues(values, start)
  const change = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  /** Toute demande de fermeture : refusée pendant l'écriture, posée en question si modifiée. */
  const requestClose = () => {
    if (savingNow.current) return
    if (dirty) setAsking(true)
    else onClose()
  }

  const save = async () => {
    if (savingNow.current) return
    // Le schéma du contrat vérifie tout avant l'envoi : un champ vide ou trop long, un site qui
    // n'est pas une adresse https publique, ou qui porte des paramètres de suivi.
    const parsed = ToolAdmit.safeParse({
      ...values,
      siteUrl: values.siteUrl.trim() === '' ? null : values.siteUrl,
    })
    if (!parsed.success) {
      const fields = [
        ...new Set(parsed.error.issues.map((issue) => issue.path[0] as ToolEditField)),
      ]
      setProblem({ error: 'validation', fields })
      return
    }
    savingNow.current = true
    setSaving(true)
    setProblem(null)
    const result = await onSubmit(parsed.data)
    savingNow.current = false
    setSaving(false)
    if (result.ok) {
      onClose()
      return
    }
    setProblem({ error: result.error, fields: result.field ? [result.field] : [] })
  }

  const message = problem ? t(($) => $.errors[problem.error]) : null
  // Le nom refusé par l'API (déjà pris) : la phrase sous le nom. Les autres : au pied, toujours en
  // vue, et les champs en cause marqués « invalides ».
  const nameError = problem?.fields.length === 1 && problem.fields[0] === 'name' ? message : null
  const invalid = (field: ToolEditField) => problem?.fields.includes(field) ?? false

  const title =
    mode === 'admit'
      ? t(($) => $.moderation.catalogue.formAdmitTitle)
      : mode === 'create'
        ? t(($) => $.moderation.catalogue.formCreateTitle)
        : t(($) => $.moderation.catalogue.formEditTitle)

  return (
    <>
      <Sheet
        open={open}
        title={title}
        onClose={onClose}
        {...(returnFocusTo ? { returnFocusTo } : null)}
        closeGuard={dirty ? requestClose : undefined}
        busy={saving}
        initialFocusRef={nameRef}
        notice={message && !nameError ? { message, tone: 'error' } : null}
        footer={
          <Stack gap="sm">
            <Button
              label={t(($) => $.moderation.catalogue.save)}
              onPress={() => void save()}
              loading={saving}
            />
            <Button
              label={t(($) => $.moderation.catalogue.cancel)}
              variant="secondary"
              onPress={requestClose}
              disabled={saving}
            />
          </Stack>
        }
      >
        <Stack gap="lg">
          <TextField
            label={t(($) => $.moderation.catalogue.name)}
            value={values.name}
            onChangeText={(text) => change('name', text)}
            inputRef={nameRef}
            limit={TOOL_NAME_MAX}
            showCount
            error={nameError ?? undefined}
            invalid={invalid('name')}
            autoCorrect={false}
          />
          <Choices
            label={t(($) => $.moderation.catalogue.family)}
            options={TOOL_FAMILIES.map((family) => ({
              value: family,
              label: t(($) => $.tools.family[family]),
            }))}
            value={values.family}
            onChange={(family) => change('family', family)}
            error={
              invalid('family') && values.family === null
                ? t(($) => $.moderation.catalogue.familyRequired)
                : undefined
            }
          />
          <TextField
            label={t(($) => $.moderation.catalogue.descriptionFr)}
            value={values.descriptionFr}
            onChangeText={(text) => change('descriptionFr', text)}
            hint={t(($) => $.moderation.catalogue.descriptionHint)}
            limit={TOOL_DESCRIPTION_MAX}
            showCount
            multiline
            maxLines={4}
            invalid={invalid('descriptionFr')}
          />
          <TextField
            label={t(($) => $.moderation.catalogue.descriptionEn)}
            value={values.descriptionEn}
            onChangeText={(text) => change('descriptionEn', text)}
            hint={t(($) => $.moderation.catalogue.descriptionHint)}
            limit={TOOL_DESCRIPTION_MAX}
            showCount
            multiline
            maxLines={4}
            invalid={invalid('descriptionEn')}
          />
          <TextField
            label={t(($) => $.moderation.catalogue.site)}
            value={values.siteUrl}
            onChangeText={(text) => change('siteUrl', text)}
            hint={t(($) => $.moderation.catalogue.siteHint)}
            invalid={invalid('siteUrl')}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Stack>
      </Sheet>
      <ProjectAbandonDialog
        visible={asking}
        editing
        onKeep={() => setAsking(false)}
        onAbandon={() => {
          setAsking(false)
          onClose()
        }}
      />
    </>
  )
}
