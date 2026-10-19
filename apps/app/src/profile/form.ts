// Règles du formulaire « Mon profil » : transforme ce que le membre a tapé en modifications à
// envoyer, ou en messages d'erreur par champ. Les règles elles-mêmes (longueurs maximales…) ne sont
// pas recopiées ici : on réutilise le schéma ProfileUpdate de @ruche/contracts, le même que l'API.
import { ProfileUpdate } from '@ruche/contracts'

/**
 * Le formulaire tel qu'affiché : les outils sont un seul texte, séparés par des virgules. Le pseudo
 * est facultatif ici : absent ou inchangé, il n'est pas envoyé.
 */
export type ProfileForm = { name: string; bio: string; tools: string; handle?: string }

export type ProfileFormErrors = {
  name?: 'nameRequired' | 'nameTooLong' | 'invalidCharacters'
  // handleTaken (409) et handleChangeLimit (429) ne viennent pas d'ici mais de l'API : l'écran les
  // range avec les autres, sous le champ, pour que le membre les lise là où il doit corriger.
  handle?:
    | 'handleTooShort'
    | 'handleTooLong'
    | 'handleInvalid'
    | 'handleReserved'
    | 'handleTaken'
    | 'handleChangeLimit'
  bio?: 'bioTooLong' | 'invalidCharacters'
  tools?: 'tooManyTools' | 'toolTooLong' | 'invalidCharacters'
}

/** « Claude,  Midjourney , » → ['Claude', 'Midjourney'] */
export const parseTools = (text: string): string[] =>
  text
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0)

// issue.code (Zod) → message du pseudo. « custom » : la règle maison des mots réservés (handles.ts).
const handleErrors: Partial<Record<string, NonNullable<ProfileFormErrors['handle']>>> = {
  too_small: 'handleTooShort',
  too_big: 'handleTooLong',
  invalid_format: 'handleInvalid',
  custom: 'handleReserved',
}

/**
 * @param currentHandle le pseudo enregistré : le même pseudo retapé (« @Lea » pour « lea ») n'est
 * pas un changement, et n'est pas envoyé.
 */
export const toProfileUpdate = (
  form: ProfileForm,
  currentHandle?: string,
): { ok: true; changes: ProfileUpdate } | { ok: false; errors: ProfileFormErrors } => {
  // Un pseudo laissé tel quel n'est même pas vérifié : un pseudo ancien, devenu réservé depuis,
  // n'empêche pas d'enregistrer sa bio.
  const handleTouched = form.handle !== undefined && form.handle !== currentHandle
  // safeParse vérifie sans lever d'erreur : il renvoie soit les données nettoyées (espaces retirés,
  // doublons supprimés, « @Ines » devenu « ines »), soit la liste des problèmes trouvés.
  const parsed = ProfileUpdate.safeParse({
    name: form.name,
    ...(handleTouched ? { handle: form.handle } : null),
    bio: form.bio,
    favoriteTools: parseTools(form.tools),
  })
  if (parsed.success) {
    // Nettoyé, le pseudo peut redevenir l'actuel (« @Lea ») : on ne l'envoie pas.
    const { handle, ...others } = parsed.data
    return { ok: true, changes: handle === currentHandle ? others : parsed.data }
  }

  const errors: ProfileFormErrors = {}
  for (const issue of parsed.error.issues) {
    // issue.path dit où est le problème : ['bio'], ['favoriteTools'] (la liste entière)
    // ou ['favoriteTools', 3] (le 4e outil). issue.code dit lequel : trop court, trop long…
    const [field, index] = issue.path
    if (field === 'handle') {
      // Un seul message par champ : le premier problème trouvé.
      errors.handle ??= handleErrors[issue.code] ?? 'handleInvalid'
      continue
    }
    // « custom » : une règle maison a refusé le texte (caractères invisibles, voir text.ts).
    if (issue.code === 'custom') {
      if (field === 'name' || field === 'bio') errors[field] = 'invalidCharacters'
      if (field === 'favoriteTools') errors.tools = 'invalidCharacters'
      continue
    }
    if (field === 'name') errors.name = issue.code === 'too_big' ? 'nameTooLong' : 'nameRequired'
    if (field === 'bio') errors.bio = 'bioTooLong'
    if (field === 'favoriteTools')
      errors.tools = index === undefined ? 'tooManyTools' : 'toolTooLong'
  }
  return { ok: false, errors }
}
