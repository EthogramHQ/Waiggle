// Règles du formulaire « Mon profil » : transforme ce que le membre a tapé en modifications à
// envoyer, ou en messages d'erreur par champ. Les règles elles-mêmes (longueurs maximales…) ne sont
// pas recopiées ici : on réutilise le schéma ProfileUpdate de @ruche/contracts, le même que l'API.
import { ProfileUpdate } from '@ruche/contracts'

/** Le formulaire tel qu'affiché : les outils sont un seul texte, séparés par des virgules. */
export type ProfileForm = { name: string; bio: string; tools: string }

export type ProfileFormErrors = {
  name?: 'nameRequired' | 'nameTooLong' | 'invalidCharacters'
  bio?: 'bioTooLong' | 'invalidCharacters'
  tools?: 'tooManyTools' | 'toolTooLong' | 'invalidCharacters'
}

/** « Claude,  Midjourney , » → ['Claude', 'Midjourney'] */
export const parseTools = (text: string): string[] =>
  text
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0)

export const toProfileUpdate = (
  form: ProfileForm,
): { ok: true; changes: ProfileUpdate } | { ok: false; errors: ProfileFormErrors } => {
  // safeParse vérifie sans lever d'erreur : il renvoie soit les données nettoyées (espaces retirés,
  // doublons supprimés), soit la liste des problèmes trouvés.
  const parsed = ProfileUpdate.safeParse({
    name: form.name,
    bio: form.bio,
    favoriteTools: parseTools(form.tools),
  })
  if (parsed.success) return { ok: true, changes: parsed.data }

  const errors: ProfileFormErrors = {}
  for (const issue of parsed.error.issues) {
    // issue.path dit où est le problème : ['bio'], ['favoriteTools'] (la liste entière)
    // ou ['favoriteTools', 3] (le 4e outil). issue.code dit lequel : trop court, trop long…
    const [field, index] = issue.path
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
