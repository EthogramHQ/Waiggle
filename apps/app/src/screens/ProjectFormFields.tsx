// Les champs de la feuille de publication et de modification (R6a, planches R6-Publier,
// R6-Publier-Suite et R6-Publier-Desktop), dans l'ordre des planches : les photos et la description
// de la photo choisie ; le titre, « En une phrase », la description, le lien de la démo ; « Où en
// est le projet ? » ; les lignes « Catégorie », « Seconde » et « Outils » (qui ouvrent la seconde
// feuille, `ProjectCategorySheet`) ; « Commencé en » ; « Facile à refaire ? » ; le prompt de départ
// et les autres prompts ; enfin « Qui peut le voir ? » et la phrase qui dit qui verra le projet.
//
// Ce fichier ne fait qu'assembler des composants de `src/ui` : l'écran (`ProjectFormScreen`) garde
// le formulaire, ses erreurs, les photos (`usePhotoTiles`) et l'envoi, et passe ici de quoi les
// montrer et les changer. Sur ordinateur, l'écran peut poser « Qui peut le voir ? » dans la colonne
// de l'aperçu et la phrase au pied de la feuille (`withAudience={false}`, puis `ProjectAudienceChoice` et
// `audienceSentence`).
import {
  PHOTO_DESCRIPTION_MAX,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_PITCH_MAX,
  PROJECT_PROMPT_MAX_LENGTH,
  PROJECT_PROMPTS_MAX,
  PROJECT_TITLE_MAX,
  PROJECT_TOOLS_MAX,
  ProjectDifficulty,
  ProjectStatus,
  publicHttpsUrl,
  STARTED_MONTH_FLOOR,
  startedMonthMax,
  TOOL_MAX_LENGTH,
  VISUALS_MAX,
} from '@ruche/contracts'
import { type RefObject, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { categoryOption, DIFFICULTY_DOTS } from '../projects/categories'
import type { ProjectAudience, ProjectForm, ProjectFormErrors } from '../projects/form'
import type { PhotoActions } from '../projects/usePhotoTiles'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { Disclosure } from '../ui/Disclosure'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { MonthField } from '../ui/MonthField'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from '../ui/PhotoTiles'
import { PromptField, type PromptFieldLabels } from '../ui/PromptField'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { FieldGroup, TextField, type TextFieldInput } from '../ui/TextField'
import { useHydrated } from '../ui/theme/hydration'

// La fonction `t` de react-i18next, pour les textes calculés hors du rendu.
type T = ReturnType<typeof useTranslation>['t']

/** Les champs où l'écran peut poser le focus (le premier en erreur, après un « Publier » refusé). */
export type ProjectFieldName =
  | 'title'
  | 'pitch'
  | 'description'
  | 'demoUrl'
  | 'category'
  | 'secondary'
  | 'tools'

/**
 * Les poignées (`ref`) de ces champs : la saisie d'un champ de texte, la vue d'une ligne. L'écran
 * les crée par `useProjectFieldRefs()` et les garde : il y pose le focus (`focusAndReveal`), et
 * rend celui de la ligne qui a ouvert la seconde feuille quand elle se ferme.
 */
export type ProjectFieldRefs = {
  title: RefObject<TextFieldInput | null>
  pitch: RefObject<TextFieldInput | null>
  description: RefObject<TextFieldInput | null>
  demoUrl: RefObject<TextFieldInput | null>
  category: RefObject<Focusable | null>
  secondary: RefObject<Focusable | null>
  tools: RefObject<Focusable | null>
}

/** Les poignées des champs, à créer une fois par l'écran. */
export const useProjectFieldRefs = (): ProjectFieldRefs => ({
  title: useRef<TextFieldInput>(null),
  pitch: useRef<TextFieldInput>(null),
  description: useRef<TextFieldInput>(null),
  demoUrl: useRef<TextFieldInput>(null),
  category: useRef<Focusable>(null),
  secondary: useRef<Focusable>(null),
  tools: useRef<Focusable>(null),
})

/**
 * Le premier champ en erreur, dans l'ordre de la feuille : celui où poser le focus après un envoi
 * refusé. Une erreur des prompts n'en donne aucun (`PromptField` n'a pas de poignée) : elle reste
 * sous son champ, et le message général de la feuille la signale.
 */
export const firstFieldWithError = (errors: ProjectFormErrors): ProjectFieldName | null => {
  if (errors.title) return 'title'
  if (errors.pitch) return 'pitch'
  if (errors.description) return 'description'
  if (errors.demoUrl) return 'demoUrl'
  if (errors.primaryCategory) return 'category'
  if (errors.tools) return 'tools'
  return null
}

/** La ligne qui ouvre « Catégorie et outils » : le focus y revient à la fermeture. */
export type CategoriesOpener = 'category' | 'secondary' | 'tools'

/**
 * La description des photos : celle de la tuile choisie s'écrit sous les tuiles. L'écran branche
 * ici ce que rend `usePhotoTiles` (`selectedKey`, `select`, `descriptionOf`, `describe`) ; `onLeave`
 * part quand le champ perd le focus (en modification, l'écran enregistre alors : `flushPending`).
 */
export type PhotoDescriptions = {
  selectedKey: string | null
  onSelect: (key: string) => void
  textOf: (key: string) => string
  onChange: (key: string, text: string) => void
  onLeave: (key: string) => void
}

/** Change un champ du formulaire : `change('title')('Le ciel de ce soir')`. */
export type ChangeField = <K extends keyof ProjectForm>(key: K) => (value: ProjectForm[K]) => void

type Props = {
  form: ProjectForm
  change: ChangeField
  /** Les erreurs du dernier envoi refusé, recalculées à la frappe par l'écran. */
  errors: ProjectFormErrors
  /** Le projet modifié ; absent : un nouveau projet. */
  projectId?: string | undefined
  /** Les tuiles des photos et leurs gestes (`usePhotoTiles`). */
  tiles: PhotoTile[]
  photos: PhotoActions
  descriptions: PhotoDescriptions
  /** L'envoi du projet est en cours : les gestes sur les photos attendent. */
  photosBusy?: boolean
  /** Une ligne « Catégorie », « Seconde » ou « Outils » touchée : l'écran ouvre la seconde feuille. */
  onOpenCategories: (from: CategoriesOpener) => void
  fieldRefs: ProjectFieldRefs
  /** Les prompts tels qu'enregistrés (modification) : une clé déjà là demande sa désactivation. */
  savedPrompts?: readonly string[] | undefined
  /**
   * « Qui peut le voir ? » et sa phrase à la fin des champs (par défaut, sur téléphone). `false` :
   * l'écran les pose ailleurs (l'aperçu et le pied de la feuille, sur ordinateur).
   */
  withAudience?: boolean
}

// Les erreurs du formulaire qui ont leur phrase dans `project.errors` (la catégorie a la sienne).
type ErrorKey = Exclude<NonNullable<ProjectFormErrors[keyof ProjectFormErrors]>, 'chooseCategory'>

/** La limite que cite chaque phrase d'erreur (« au plus {{max}} caractères »). */
const LIMITS: Partial<Record<ErrorKey, number>> = {
  titleTooLong: PROJECT_TITLE_MAX,
  pitchTooLong: PROJECT_PITCH_MAX,
  descriptionTooLong: PROJECT_DESCRIPTION_MAX,
  tooManyTools: PROJECT_TOOLS_MAX,
  toolTooLong: TOOL_MAX_LENGTH,
  tooManyPrompts: PROJECT_PROMPTS_MAX,
  promptTooLong: PROJECT_PROMPT_MAX_LENGTH,
}

/** Le compteur d'une description longue n'apparaît qu'à l'approche de sa limite. */
const DESCRIPTION_COUNT_FROM = PROJECT_DESCRIPTION_MAX - 1_000
const PHOTO_DESCRIPTION_COUNT_FROM = PHOTO_DESCRIPTION_MAX - 50

/**
 * La phrase qui dit qui verra le projet, sous « Qui peut le voir ? » (ou au pied de la feuille sur
 * ordinateur). Un nouveau projet parle au futur ; un projet modifié, au présent.
 */
export const audienceSentence = (t: T, audience: ProjectAudience, editing: boolean): string => {
  if (audience === 'private') {
    return editing
      ? t(($) => $.project.form.audiencePrivate)
      : t(($) => $.project.form.audiencePrivateNew)
  }
  return editing
    ? t(($) => $.project.form.audienceMembersEdit)
    : t(($) => $.project.form.audienceMembers)
}

/** « Qui peut le voir ? » : les membres, ou personne d'autre (un brouillon). */
export function ProjectAudienceChoice({
  audience,
  change,
}: {
  audience: ProjectAudience
  change: ChangeField
}) {
  const { t } = useTranslation()
  const choose = change('audience')
  const membersHint = t(($) => $.project.form.membersHint)
  const privateHint = t(($) => $.project.form.privateHint)
  // Le nom lu d'un choix est son libellé ; l'aide affichée dessous lui est liée (`hint`).
  return (
    <ListGroup title={t(($) => $.project.form.audience)} radio>
      <ListRow
        label={t(($) => $.project.form.members)}
        detail={membersHint}
        hint={membersHint}
        selected={audience === 'members'}
        onPress={() => choose('members')}
      />
      <ListRow
        label={t(($) => $.project.form.private)}
        detail={privateHint}
        hint={privateHint}
        selected={audience === 'private'}
        onPress={() => choose('private')}
      />
    </ListGroup>
  )
}

export function ProjectFormFields({
  form,
  change,
  errors,
  projectId,
  tiles,
  photos,
  descriptions,
  photosBusy = false,
  onOpenCategories,
  fieldRefs,
  savedPrompts,
  withAudience = true,
}: Props) {
  const { t, i18n } = useTranslation()
  const editing = projectId !== undefined
  const errorText = (key: ErrorKey | undefined) =>
    key ? t(($) => $.project.errors[key], { max: LIMITS[key] }) : undefined

  // --- Les photos ---
  const kept = tiles.filter((tile) => tile.state !== 'failed').length
  const selectedIndex = tiles.findIndex((tile) => tile.key === descriptions.selectedKey)
  const selected = selectedIndex === -1 ? null : tiles[selectedIndex]
  // Le nom d'une tuile reprend la description de sa photo, en texte simple (sec-M3).
  const tileName = (number: number, cover: boolean) => {
    const key = tiles[number - 1]?.key
    const description = key ? descriptions.textOf(key).trim() : ''
    if (description === '') {
      return cover
        ? t(($) => $.project.form.photoTileCover, { number })
        : t(($) => $.project.form.photoTile, { number })
    }
    return cover
      ? t(($) => $.project.form.photoTileCoverDescribed, { number, description })
      : t(($) => $.project.form.photoTileDescribed, { number, description })
  }
  const tileLabels: PhotoTilesLabels = {
    list: t(($) => $.project.form.photosList),
    add: t(($) => $.project.form.addPhotos),
    addLabel: t(($) => $.project.form.addPhotosLabel),
    dropZone: t(($) => $.project.form.dropZone),
    dropZoneChoose: t(($) => $.project.form.dropZoneChoose),
    cover: t(($) => $.project.form.cover),
    tile: tileName,
    uploading: (number) => t(($) => $.project.form.photoUploading, { number }),
    failed: (number, reason) => t(($) => $.project.form.photoFailed, { number, reason }),
    move: (number) => t(($) => $.project.form.movePhoto, { number }),
    makeCover: t(($) => $.project.form.makeCover),
    earlier: t(($) => $.project.form.movePhotoEarlier),
    later: t(($) => $.project.form.movePhotoLater),
    moved: (place) => t(($) => $.project.form.photoMoved, { place }),
    remove: (number) => t(($) => $.project.form.removePhoto, { number }),
  }
  // Les règles des photos ; en modification, chaque geste s'enregistre tout de suite (jur-J4).
  const photoRules = [
    t(($) => $.project.form.photosRules),
    t(($) => $.project.form.photosOrder),
    ...(editing ? [t(($) => $.project.form.photosSaved)] : []),
  ].join(' ')

  // --- Le lien : sa forme est vérifiée pendant la frappe, le site n'est jamais ouvert (jur-J16) ---
  const demoUrl = form.demoUrl.trim()
  const demoOk = demoUrl !== '' && publicHttpsUrl(demoUrl) !== null

  // --- Les catégories et les outils (les lignes qui ouvrent la seconde feuille) ---
  const categoryLabel = t(($) => $.project.form.category)
  const secondaryLabel = t(($) => $.project.form.secondary)
  const toolsLabel = t(($) => $.project.form.tools)
  const primaryName = form.primaryCategory ? categoryOption(t, form.primaryCategory).label : null
  const secondaryName = form.secondaryCategory
    ? categoryOption(t, form.secondaryCategory).label
    : null
  const categoryError = errors.primaryCategory ? t(($) => $.project.form.chooseCategory) : undefined
  // Sans catégorie, la ligne dit quoi faire ; en erreur, la phrase passe en rouge sous le libellé
  // (et décrit la ligne), sans être écrite deux fois.
  const categoryValue =
    primaryName ?? (categoryError ? null : t(($) => $.project.form.chooseCategory))
  const toolsValue =
    form.tools.length > 0 ? form.tools.join(', ') : t(($) => $.project.form.addToolButton)
  // Le nom lu d'une ligne dit aussi sa valeur : un bouton cache le texte qu'il contient.
  const spoken = (label: string, value: string | null) => (value ? `${label}, ${value}` : label)

  // --- « Commencé en » : le mois en cours se lit une fois la page hydratée (web) ---
  const hydrated = useHydrated()
  const monthMax = hydrated ? startedMonthMax(new Date()) : null
  const monthNames = useMemo(() => {
    // Les douze mois dans la langue de l'appli, en UTC : aucun fuseau ne fait glisser le 1er du
    // mois vers le mois d'avant.
    const format = new Intl.DateTimeFormat(i18n.language, { month: 'long', timeZone: 'UTC' })
    return Array.from({ length: 12 }, (_, index) =>
      format.format(new Date(Date.UTC(2000, index, 1))),
    )
  }, [i18n.language])

  // --- Les prompts : le premier est « le prompt de départ », les autres se replient dessous ---
  const promptLabels: PromptFieldLabels = {
    counter: (count, max) => ({
      shown: t(($) => $.project.form.promptCounter, { count, max }),
      spoken: t(($) => $.project.form.promptCounterSpoken, { count, max }),
    }),
    invisibleRemoved: (count) => t(($) => $.project.form.invisibleRemoved, { count }),
    keyFound: (masked) => t(($) => $.project.form.keyFound, { masked }),
    keyWarning: t(($) => $.project.form.keyWarning),
    keyRevoke: t(($) => $.project.form.keyRevoke),
    removeKey: t(($) => $.project.form.removeKey),
    removeKeyNamed: (masked) => t(($) => $.project.form.removeKeyNamed, { masked }),
  }
  const setPrompt = (index: number, text: string) => {
    const next = [...form.prompts]
    next[index] = text
    // Le prompt de départ vidé, seul : plus de prompt du tout (rien à enregistrer, rien de changé).
    change('prompts')(next.length === 1 && text === '' ? [] : next)
  }
  // Une erreur des prompts se montre sous celui qui dépasse, sinon sous le prompt de départ.
  const promptsError = errorText(errors.prompts)
  const tooLong = form.prompts.findIndex((prompt) => prompt.length > PROJECT_PROMPT_MAX_LENGTH)
  const promptErrorAt = promptsError ? Math.max(tooLong, 0) : -1
  const promptError = (index: number) => (index === promptErrorAt ? promptsError : undefined)
  const others = form.prompts.slice(1)

  // Retirer un prompt fait disparaître le bouton touché : le focus passe à « Ajouter un prompt »
  // (rendu au tour suivant s'il manquait, à la limite), jamais en haut de la page.
  const addPromptRef = useRef<Focusable>(null)
  const focusAddPrompt = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: relu après chaque retrait de prompt.
  useEffect(() => {
    if (!focusAddPrompt.current) return
    focusAddPrompt.current = false
    focusWithoutScroll(addPromptRef.current)
    moveReaderTo(addPromptRef.current)
  }, [form.prompts.length])
  const removePrompt = (index: number) => {
    focusAddPrompt.current = true
    change('prompts')(form.prompts.filter((_, i) => i !== index))
  }
  const addPrompt = () =>
    // Sans prompt de départ, la case du départ vient d'abord (vide), puis la nouvelle.
    change('prompts')([...(form.prompts.length > 0 ? form.prompts : ['']), ''])

  return (
    <Stack gap="xxl">
      {/* Les photos, puis la description de la photo choisie (facultative). */}
      <Stack gap="sm">
        <Row justify="between" align="center">
          <Text variant="headline" heading={2}>
            {t(($) => $.project.form.photos)}
          </Text>
          <Text
            variant="caption"
            tone="muted"
            tabular
            accessibilityLabel={t(($) => $.project.form.photosCountSpoken, {
              count: kept,
              max: VISUALS_MAX,
            })}
          >
            {t(($) => $.project.form.photosCount, { count: kept, max: VISUALS_MAX })}
          </Text>
        </Row>
        <PhotoTiles
          tiles={tiles}
          max={VISUALS_MAX}
          labels={tileLabels}
          selectedKey={descriptions.selectedKey}
          onSelect={descriptions.onSelect}
          onAdd={photos.onAdd}
          onDropFiles={photos.onDropFiles}
          onMove={photos.onMove}
          onRemove={photos.onRemove}
          busy={photosBusy}
        />
        <Text variant="caption" tone="muted">
          {photoRules}
        </Text>
        {selected ? (
          <TextField
            key={selected.key}
            label={t(($) => $.project.form.photoDescription, { number: selectedIndex + 1 })}
            value={descriptions.textOf(selected.key)}
            onChangeText={(text) => descriptions.onChange(selected.key, text)}
            onBlur={() => descriptions.onLeave(selected.key)}
            autoCapitalize="sentences"
            hint={t(($) => $.project.form.photoDescriptionHint)}
            limit={PHOTO_DESCRIPTION_MAX}
            countFrom={PHOTO_DESCRIPTION_COUNT_FROM}
          />
        ) : null}
      </Stack>

      <FieldGroup>
        <TextField
          label={t(($) => $.project.form.title)}
          value={form.title}
          onChangeText={change('title')}
          autoCapitalize="sentences"
          limit={PROJECT_TITLE_MAX}
          showCount
          error={errorText(errors.title)}
          inputRef={fieldRefs.title}
        />
        <TextField
          label={t(($) => $.project.form.oneLine)}
          value={form.pitch}
          onChangeText={change('pitch')}
          autoCapitalize="sentences"
          limit={PROJECT_PITCH_MAX}
          showCount
          error={errorText(errors.pitch)}
          inputRef={fieldRefs.pitch}
        />
      </FieldGroup>

      <TextField
        label={t(($) => $.project.form.description)}
        value={form.description}
        onChangeText={change('description')}
        autoCapitalize="sentences"
        multiline
        hint={t(($) => $.project.form.descriptionHint)}
        limit={PROJECT_DESCRIPTION_MAX}
        countFrom={DESCRIPTION_COUNT_FROM}
        error={errorText(errors.description)}
        inputRef={fieldRefs.description}
      />

      {/* « Lien valide », puis aussitôt ce qui n'est pas vérifié : lus ensemble (jur-J16). */}
      <TextField
        label={t(($) => $.project.form.demoUrl)}
        value={form.demoUrl}
        onChangeText={change('demoUrl')}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        hint={
          demoOk ? t(($) => $.project.form.demoNotChecked) : t(($) => $.project.form.demoUrlHint)
        }
        success={demoOk ? t(($) => $.project.form.demoValid) : undefined}
        keepHint={demoOk}
        error={errorText(errors.demoUrl)}
        inputRef={fieldRefs.demoUrl}
      />

      <Choices
        label={t(($) => $.project.form.stage)}
        options={ProjectStatus.options.map((value) => ({
          value,
          label: t(($) => $.project.status[value]),
        }))}
        value={form.status}
        onChange={change('status')}
      />

      <Stack gap="lg">
        <ListGroup>
          <ListRow
            ref={fieldRefs.category}
            label={categoryLabel}
            {...(categoryValue ? { detail: categoryValue } : null)}
            detailRight
            trailing="chevron"
            spokenLabel={spoken(categoryLabel, categoryError ? null : categoryValue)}
            error={categoryError}
            onPress={() => onOpenCategories('category')}
          />
          <ListRow
            ref={fieldRefs.secondary}
            label={secondaryLabel}
            {...(secondaryName ? { detail: secondaryName } : null)}
            detailRight
            trailing="chevron"
            spokenLabel={spoken(secondaryLabel, secondaryName)}
            onPress={() => onOpenCategories('secondary')}
          />
          <ListRow
            ref={fieldRefs.tools}
            label={toolsLabel}
            detail={toolsValue}
            detailRight
            trailing="chevron"
            spokenLabel={spoken(toolsLabel, toolsValue)}
            error={errorText(errors.tools)}
            onPress={() => onOpenCategories('tools')}
          />
        </ListGroup>
        {monthMax ? (
          <MonthField
            label={t(($) => $.project.form.startedOn)}
            value={form.startedOn}
            onChange={change('startedOn')}
            min={STARTED_MONTH_FLOOR}
            max={monthMax}
            monthNames={monthNames}
            clearLabel={t(($) => $.project.form.clear)}
            monthLabel={t(($) => $.project.form.month)}
            yearLabel={t(($) => $.project.form.year)}
          />
        ) : null}
      </Stack>

      <Choices
        label={t(($) => $.project.form.difficulty)}
        options={ProjectDifficulty.options.map((value) => ({
          value,
          label: t(($) => $.project.difficulty[value]),
          dot: DIFFICULTY_DOTS[value],
        }))}
        value={form.difficulty}
        onChange={change('difficulty')}
        clearLabel={t(($) => $.project.form.clear)}
      />

      <Stack gap="md">
        <PromptField
          label={t(($) => $.project.prompts.starting)}
          value={form.prompts[0] ?? ''}
          onChange={(text) => setPrompt(0, text)}
          max={PROJECT_PROMPT_MAX_LENGTH}
          hint={t(($) => $.project.form.promptHint)}
          labels={promptLabels}
          removedPlaceholder={t(($) => $.project.form.keyRemoved)}
          error={promptError(0)}
          savedValue={savedPrompts?.[0]}
        />
        {/* Les autres prompts, repliés tant qu'il n'y en a pas : un contenu secondaire. */}
        <Disclosure
          title={t(($) => $.project.form.otherPrompts)}
          icon={null}
          initiallyOpen={others.length > 0}
        >
          <Stack gap="lg">
            {others.map((prompt, offset) => {
              const index = offset + 1
              return (
                // Un prompt n'a pas d'identifiant : sa place en tient lieu.
                <Stack key={index} gap="sm">
                  <PromptField
                    label={t(($) => $.project.form.prompt, { number: index + 1 })}
                    value={prompt}
                    onChange={(text) => setPrompt(index, text)}
                    max={PROJECT_PROMPT_MAX_LENGTH}
                    hint={t(($) => $.project.form.promptHint)}
                    labels={promptLabels}
                    removedPlaceholder={t(($) => $.project.form.keyRemoved)}
                    error={promptError(index)}
                    savedValue={savedPrompts?.[index]}
                  />
                  <Button
                    label={t(($) => $.project.form.removePrompt, { number: index + 1 })}
                    variant="secondary"
                    size="compact"
                    icon="trash"
                    onPress={() => removePrompt(index)}
                  />
                </Stack>
              )
            })}
            {form.prompts.length < PROJECT_PROMPTS_MAX ? (
              <Button
                ref={addPromptRef}
                label={t(($) => $.project.form.addPrompt)}
                variant="secondary"
                icon="plus"
                onPress={addPrompt}
              />
            ) : null}
          </Stack>
        </Disclosure>
      </Stack>

      {withAudience ? (
        <Stack gap="md">
          <ProjectAudienceChoice audience={form.audience} change={change} />
          <Text variant="callout" tone="secondary">
            {audienceSentence(t, form.audience, editing)}
          </Text>
        </Stack>
      ) : null}
    </Stack>
  )
}
