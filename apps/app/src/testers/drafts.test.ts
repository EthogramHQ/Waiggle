// Tests des brouillons du coin des testeurs (R7b, `testers/drafts.ts`) : un appel, un retour ou une
// réponse commencés se retrouvent en rouvrant la feuille. Les règles :
// - rien sur l'appareil : le magasin vit en mémoire (un brouillon est un texte privé, et un appareil
//   partagé ne doit pas le garder) ;
// - la clé contient le membre : deux comptes qui se suivent sur le même appareil ne se voient pas ;
// - `clearAllDrafts()` oublie tout (appelée à la déconnexion : `testers/corner-api.test.tsx`).
//
// Le module est écrit avant ces tests (il fait partie des crochets du coin) : ils passent dès
// l'écriture. Chacun a son témoin (le brouillon est bien gardé avant d'être oublié), et le contrôle
// « rien sur l'appareil » regarde aussi le code source.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook } from '@testing-library/react-native'
import { clearAllDrafts, clearDraft, draftKey, readDraft, useDraft, writeDraft } from './drafts'

beforeEach(() => {
  clearAllDrafts()
})

afterEach(() => {
  jest.restoreAllMocks()
})

const PROJECT = 'p1'

describe('draftKey', () => {
  it('puts the member, the project and the kind in the key, and the tester when given', () => {
    expect(draftKey('u1', PROJECT, 'call')).toBe('u1:p1:call')
    expect(draftKey('u1', PROJECT, 'reply', 't9')).toBe('u1:p1:reply:t9')
  })

  it('gives two members two keys for the same draft', () => {
    expect(draftKey('u1', PROJECT, 'feedback')).not.toBe(draftKey('u2', PROJECT, 'feedback'))
  })
})

describe('the drafts store', () => {
  it('gives back the draft written under a key, and nothing under another', () => {
    writeDraft(draftKey('u1', PROJECT, 'feedback'), { text: 'Le niveau 3 rame' })

    expect(readDraft(draftKey('u1', PROJECT, 'feedback'))).toEqual({ text: 'Le niveau 3 rame' })
    expect(readDraft(draftKey('u1', PROJECT, 'call'))).toBeUndefined()
  })

  it('keeps the drafts of two members apart', () => {
    writeDraft(draftKey('u1', PROJECT, 'feedback'), 'Le brouillon d’Inès')

    expect(readDraft(draftKey('u1', PROJECT, 'feedback'))).toBe('Le brouillon d’Inès') // témoin
    expect(readDraft(draftKey('u2', PROJECT, 'feedback'))).toBeUndefined()
  })

  it('forgets one draft with clearDraft, and keeps the others', () => {
    writeDraft(draftKey('u1', PROJECT, 'feedback'), 'Retour')
    writeDraft(draftKey('u1', PROJECT, 'call'), 'Appel')

    clearDraft(draftKey('u1', PROJECT, 'feedback'))

    expect(readDraft(draftKey('u1', PROJECT, 'feedback'))).toBeUndefined()
    expect(readDraft(draftKey('u1', PROJECT, 'call'))).toBe('Appel')
  })

  it('forgets every draft of every member with clearAllDrafts', () => {
    const keys = [
      draftKey('u1', PROJECT, 'feedback'),
      draftKey('u1', 'p2', 'call'),
      draftKey('u2', PROJECT, 'reply', 't9'),
    ]
    for (const key of keys) writeDraft(key, 'Un texte commencé')
    // Témoin : les trois brouillons sont gardés.
    expect(keys.map((key) => readDraft(key))).toEqual(keys.map(() => 'Un texte commencé'))

    clearAllDrafts()

    expect(keys.map((key) => readDraft(key))).toEqual(keys.map(() => undefined))
  })

  it('writes nothing on the device', () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem')
    const multiSet = jest.spyOn(AsyncStorage, 'multiSet')
    const mergeItem = jest.spyOn(AsyncStorage, 'mergeItem')

    writeDraft(draftKey('u1', PROJECT, 'feedback'), 'Un texte privé')

    // Témoin : le brouillon est bien gardé, en mémoire.
    expect(readDraft(draftKey('u1', PROJECT, 'feedback'))).toBe('Un texte privé')
    expect([setItem, multiSet, mergeItem].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0])
  })

  it('reads no device storage in its code', () => {
    // Le stockage de l'appareil, sous toutes ses formes : AsyncStorage (téléphone et web, où il
    // passe par localStorage), SecureStore, le stockage du navigateur. Les commentaires retirés
    // d'abord : ils en parlent pour dire pourquoi le module ne s'en sert pas.
    const source = readFileSync(join(__dirname, 'drafts.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    // Témoin : le code lu est bien celui du magasin.
    expect(source).toContain('clearAllDrafts')
    expect(source).not.toMatch(/async-storage|secure-store|localStorage|sessionStorage|indexedDB/i)
  })
})

describe('useDraft', () => {
  const key = draftKey('u1', PROJECT, 'feedback')

  it('starts from the draft kept under its key, or from the empty value', async () => {
    const empty = await renderHook(() => useDraft(key, ''))
    expect(empty.result.current[0]).toBe('')
    await empty.unmount()

    writeDraft(key, 'Déjà commencé')
    const kept = await renderHook(() => useDraft(key, ''))
    expect(kept.result.current[0]).toBe('Déjà commencé')
  })

  it('keeps what is typed in the store', async () => {
    const { result } = await renderHook(() => useDraft(key, ''))

    await act(async () => {
      result.current[1]('Le score repart à zéro')
    })

    expect(result.current[0]).toBe('Le score repart à zéro')
    expect(readDraft(key)).toBe('Le score repart à zéro')
  })

  it('goes back to the empty value and forgets the draft when cleared', async () => {
    writeDraft(key, 'Déjà commencé')
    const { result } = await renderHook(() => useDraft(key, ''))
    expect(result.current[0]).toBe('Déjà commencé') // témoin

    await act(async () => {
      result.current[2]()
    })

    expect(result.current[0]).toBe('')
    expect(readDraft(key)).toBeUndefined()
  })

  it('switches to the draft of the new key when the key changes', async () => {
    const other = draftKey('u1', PROJECT, 'reply', 't9')
    writeDraft(key, 'Retour d’Inès')
    writeDraft(other, 'Réponse à Sam')
    const { result, rerender } = await renderHook(
      ({ current }: { current: string }) => useDraft(current, ''),
      {
        initialProps: { current: key },
      },
    )
    expect(result.current[0]).toBe('Retour d’Inès') // témoin

    await rerender({ current: other })

    expect(result.current[0]).toBe('Réponse à Sam')
  })

  it('forgets what was typed once every draft is cleared', async () => {
    const first = await renderHook(() => useDraft(key, ''))
    await act(async () => {
      first.result.current[1]('Un retour à finir')
    })
    await first.unmount()

    clearAllDrafts()

    const after = await renderHook(() => useDraft(key, ''))
    expect(after.result.current[0]).toBe('')
  })
})
