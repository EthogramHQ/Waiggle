import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDiskStorage, type FileStorage } from './storage'

// Chaque test travaille dans un dossier temporaire neuf, effacé à la fin.
let root: string
let storage: FileStorage
const key = 'avatars/3f2a1b4c-0d5e-4f6a-8b7c-9d0e1f2a3b4c.webp'

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'ruche-storage-'))
  storage = createDiskStorage(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('createDiskStorage', () => {
  it('stores, reads back and deletes a file', async () => {
    await storage.put(key, new Uint8Array([1, 2, 3]))

    expect(await storage.get(key)).toEqual(new Uint8Array([1, 2, 3]))
    await storage.delete(key)
    expect(await storage.get(key)).toBeNull()
  })

  it('never reads outside its folder', async () => {
    expect(await storage.get('avatars/../../../etc/passwd')).toBeNull()
    expect(await storage.get('../secret.webp')).toBeNull()
  })

  it('refuses to write a file under a name it did not generate', async () => {
    await expect(storage.put('avatars/../evil.sh', new Uint8Array([1]))).rejects.toThrow()
  })

  it('keeps the photos of projects in their own folder, and no other', async () => {
    const visual = 'visuals/3f2a1b4c-0d5e-4f6a-8b7c-9d0e1f2a3b4c.webp'
    await storage.put(visual, new Uint8Array([4, 5]))

    expect(await storage.get(visual)).toEqual(new Uint8Array([4, 5]))
    await expect(
      storage.put('secrets/3f2a1b4c-0d5e-4f6a-8b7c-9d0e1f2a3b4c.webp', new Uint8Array([1])),
    ).rejects.toThrow()
  })
})
