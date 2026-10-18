// Le stockage des fichiers envoyés par les membres : les avatars et les visuels des projets.
// Comme pour les e-mails, le reste du code ne connaît que l'interface `FileStorage` :
// - sur le disque en développement et sur le VPS (un dossier, monté en volume Docker) ;
// - en mémoire dans les tests ;
// - plus tard, un stockage S3 (Garage, OVH) pourra s'ajouter sans toucher au reste.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface FileStorage {
  put(key: string, data: Uint8Array): Promise<void>
  /** Le contenu du fichier, ou null s'il n'existe pas. */
  get(key: string): Promise<Uint8Array | null>
  delete(key: string): Promise<void>
}

/**
 * Les noms de fichiers sont toujours fabriqués par le serveur (un identifiant aléatoire + extension).
 * Cette règle stricte refuse tout le reste, notamment les « ../ » qui permettraient de sortir du
 * dossier et de lire n'importe quel fichier du serveur (attaque par « path traversal »).
 */
export const isValidKey = (key: string) =>
  /^(avatars|visuals)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(
    key,
  )

const checkKey = (key: string) => {
  if (!isValidKey(key)) throw new Error(`Invalid storage key: ${key}`)
}

/** Pour les tests : une Map (dictionnaire) clé → contenu, consultable par les tests. */
export const createMemoryStorage = () => {
  const files = new Map<string, Uint8Array>()
  return {
    files,
    async put(key: string, data: Uint8Array) {
      checkKey(key)
      files.set(key, data)
    },
    async get(key: string) {
      return isValidKey(key) ? (files.get(key) ?? null) : null
    },
    async delete(key: string) {
      files.delete(key)
    },
  } satisfies FileStorage & { files: Map<string, Uint8Array> }
}

/** Fichiers rangés dans un dossier du disque. */
export const createDiskStorage = (root: string): FileStorage => {
  const fullPath = (key: string) => path.join(root, key)
  return {
    async put(key, data) {
      checkKey(key)
      await mkdir(path.dirname(fullPath(key)), { recursive: true })
      await writeFile(fullPath(key), data)
    },
    async get(key) {
      if (!isValidKey(key)) return null
      try {
        return new Uint8Array(await readFile(fullPath(key)))
      } catch {
        return null // fichier absent
      }
    },
    async delete(key) {
      if (!isValidKey(key)) return
      await rm(fullPath(key), { force: true }) // force : pas d'erreur si le fichier n'existe plus
    },
  }
}
