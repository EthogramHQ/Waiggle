// Tests des touches ajoutées sur le web (keyboard.ts) : Entrée ouvre un lien, Échap referme un champ,
// l'espace bascule un interrupteur. Les tests tournent « sur téléphone » : on fait croire au web.
import { Platform } from 'react-native'
import { enterActivates, escapeCloses, spaceToggles } from './keyboard'

type Handler = {
  onKeyDown?: (event: { key: string; repeat?: boolean; preventDefault: () => void }) => void
}

const press = (props: object, key: string, repeat = false) => {
  const preventDefault = jest.fn()
  ;(props as Handler).onKeyDown?.({ key, repeat, preventDefault })
  return preventDefault
}

describe('keys on the web', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('opens a link with Enter, once even when the key is held down', () => {
    const open = jest.fn()
    const props = enterActivates(open)

    expect(press(props, 'Enter')).toHaveBeenCalled()
    press(props, 'Enter', true) // la touche gardée enfoncée se répète
    press(props, ' ') // l'espace fait défiler la page, comme sur un vrai lien

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('does nothing with Enter on a disabled link', () => {
    const open = jest.fn()
    press(enterActivates(open, true), 'Enter')

    expect(open).not.toHaveBeenCalled()
  })

  it('closes a field with Escape, unless it is busy', () => {
    // Sur un champ, la touche arrive par onKeyPress (un champ ne laisse pas remonter ses touches).
    const type = (props: object, key: string) =>
      (props as { onKeyPress?: (e: { nativeEvent: object }) => void }).onKeyPress?.({
        nativeEvent: { key, preventDefault: jest.fn() },
      })
    const close = jest.fn()
    type(escapeCloses(close), 'Escape')
    type(escapeCloses(close, true), 'Escape')
    type(escapeCloses(close), 'Enter')

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('toggles a switch with the space bar', () => {
    const toggle = jest.fn()
    press(spaceToggles(toggle), ' ')

    expect(toggle).toHaveBeenCalledTimes(1)
  })
})

describe('keys on a phone', () => {
  it('adds nothing: the system handles its own keys', () => {
    expect(enterActivates(jest.fn())).toEqual({})
    expect(escapeCloses(jest.fn())).toEqual({})
  })
})
