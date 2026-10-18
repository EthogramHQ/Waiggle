// Ce que le serveur écrit dans ses journaux (logs) quand une erreur imprévue survient.
// Les logs sont lus par les administrateurs, gardés longtemps, parfois envoyés à d'autres outils :
// on n'y met jamais ce qu'un membre a tapé. Or le message d'une erreur de base de données contient
// souvent les valeurs de la requête (« params: lea@example.com,… »). On garde donc la nature de
// l'erreur, son code et l'endroit du code où elle s'est produite, jamais son message.

export type ErrorSummary = {
  name: string
  code?: string
  method: string
  path: string
  /** Les lignes « at … » de la pile d'appels : quelle fonction, quel fichier, quelle ligne. */
  stack: string[]
}

// Le code technique d'une erreur, s'il existe (PostgreSQL : « 22021 » = encodage invalide…).
const codeOf = (value: unknown): string | undefined =>
  typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
    ? value.code
    : undefined

// Une ligne de pile d'appels : « at » … « :12:5 » ou « :12:5) » à la fin.
const STACK_FRAME = /^at .+:\d+:\d+\)?$/

export const describeError = (
  error: unknown,
  where: { method: string; path: string },
): ErrorSummary => {
  if (!(error instanceof Error)) return { name: typeof error, ...where, stack: [] }
  const code = codeOf(error) ?? codeOf(error.cause)
  return {
    name: error.name,
    ...(code && { code }),
    ...where,
    // La pile commence par le message, sur une ou plusieurs lignes : on saute ces lignes-là, puis
    // on ne garde que celles de la forme « at fonction (fichier:ligne:colonne) ».
    stack: (error.stack ?? '')
      .split('\n')
      .slice(error.message.split('\n').length)
      .map((line) => line.trim())
      .filter((line) => STACK_FRAME.test(line))
      .slice(0, 8),
  }
}
