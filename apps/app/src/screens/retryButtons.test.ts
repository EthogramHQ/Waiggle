// Une règle de l'appli (relecture juridique R2, jur-13 ; relecture de l'interface C1) : un bouton
// bloqué par « Trop d'essais » dit pourquoi. Le câblage (la phrase « Nouvel essai possible à… »,
// désignée par le bouton) vit dans un seul composant, RetryButton (src/ui) ; chaque écran qui tient
// une attente (`useRetryAt`) passe par lui, et aucun ne pose la phrase seule, à côté d'un bouton
// qui ne la désignerait pas. Le comportement du composant est testé dans src/ui/RetryButton.test.tsx.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const here = __dirname
const screens = readdirSync(here)
  .filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))
  .map((file) => ({ file, source: readFileSync(join(here, file), 'utf8') }))
const waiting = screens.filter(({ source }) => source.includes('useRetryAt('))

describe('the buttons blocked by « too many attempts »', () => {
  it('are found on the screens that wait (témoin)', () => {
    expect(waiting.map(({ file }) => file).sort()).toEqual(
      expect.arrayContaining([
        'ChangePasswordScreen.tsx',
        'CheckEmailScreen.tsx',
        'ForgotPasswordScreen.tsx',
        'ResetPasswordScreen.tsx',
        'SignInForm.tsx',
        'SignUpForm.tsx',
      ]),
    )
  })

  it.each(waiting.map(({ file, source }) => [file, source]))(
    'say why on %s: through RetryButton, never a sentence alone',
    (_file, source) => {
      expect(source).toMatch(/<RetryButton\b/)
      expect(source).not.toMatch(/<RetryAt\b/)
    },
  )
})
