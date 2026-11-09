// Un test ajouté à ceux de Dialog.test.tsx (R6a, ui-dev U3c) : Échap, enfoncée pendant que la
// fenêtre est ouverte, est marquée « déjà servie » (`preventDefault`), pour qu'une feuille ouverte
// dessous (la feuille « Publier », d'où vient « Abandonner ce projet ? ») ne se ferme pas avec elle.
// La feuille relit ce marquage quand la touche est relâchée (`lastEscape` de Sheet.tsx) ; le Modal
// de react-native-web, lui, appelle la fermeture de toutes les couches ouvertes au relâchement.
import { act } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Dialog } from './Dialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un faux document : toute méthode existe et retient ses appels ; <html> et <body> ont un style. */
const fakeDocument = (): Record<string, unknown> => {
  const node = (): Record<string, unknown> =>
    new Proxy(
      { style: { setProperty: jest.fn(), removeProperty: jest.fn() } } as Record<
        string | symbol,
        unknown
      >,
      {
        get(target, key) {
          if (key === 'then') return undefined
          if (!(key in target)) {
            target[key] =
              key === 'documentElement' || key === 'body' || key === 'head'
                ? node()
                : jest.fn(() => undefined)
          }
          return target[key]
        },
      },
    ) as Record<string, unknown>
  return node()
}

/** Envoie une touche enfoncée aux écouteurs `keydown` posés sur le document. */
const keyDown = async (page: Record<string, unknown>, key: string) => {
  const event = { key, preventDefault: jest.fn() }
  const listeners = (page.addEventListener as jest.Mock).mock.calls.filter(
    ([type]) => type === 'keydown',
  )
  await act(() => {
    for (const [, listener] of listeners) (listener as (event: object) => void)(event)
  })
  return event
}

describe('Dialog, Escape on the web', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('marks an Escape pressed while open as taken, so a sheet beneath keeps open', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const page = fakeDocument()
    Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
    await renderWithProviders(
      <Dialog
        visible
        title="Abandonner ce projet ?"
        message="Rien n’a été envoyé."
        onDismiss={jest.fn()}
      >
        <Button label="Continuer" variant="secondary" onPress={jest.fn()} />
      </Dialog>,
    )

    // Témoin : une autre touche n'est pas prise.
    expect((await keyDown(page, 'Tab')).preventDefault).not.toHaveBeenCalled()
    expect((await keyDown(page, 'Escape')).preventDefault).toHaveBeenCalledTimes(1)
  })

  it('takes no key while closed', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const page = fakeDocument()
    Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
    await renderWithProviders(
      <Dialog
        visible={false}
        title="Abandonner ce projet ?"
        message="Rien n’a été envoyé."
        onDismiss={jest.fn()}
      >
        <Button label="Continuer" variant="secondary" onPress={jest.fn()} />
      </Dialog>,
    )

    expect((await keyDown(page, 'Escape')).preventDefault).not.toHaveBeenCalled()
  })
})
