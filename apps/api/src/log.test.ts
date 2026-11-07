// Tests du résumé d'erreur écrit dans les journaux (logs) du serveur.
import { describe, expect, it, vi } from 'vitest'
import { describeError, writeAuthLog } from './log'

describe('describeError', () => {
  it('keeps what helps to debug: the kind of error, its code and where it happened', () => {
    const cause = Object.assign(new Error('invalid byte sequence'), { code: '22021' })
    const error = new Error('Failed query: update "profile" set "bio" = $1\nparams: x', { cause })

    const summary = describeError(error, { method: 'PATCH', path: '/v1/me' })

    expect(summary).toMatchObject({ name: 'Error', code: '22021', method: 'PATCH', path: '/v1/me' })
    expect(summary.stack.length).toBeGreaterThan(0)
  })

  it('never copies the message, which may contain what the member typed', () => {
    const error = new Error('Failed query\nparams: lea@example.com,Ma bio secrète')

    const text = JSON.stringify(describeError(error, { method: 'PATCH', path: '/v1/me' }))

    expect(text).not.toContain('lea@example.com')
    expect(text).not.toContain('Ma bio secrète')
  })

  it('drops a line of the message that looks like a stack frame', () => {
    // Une bio peut contenir des retours à la ligne, donc une ligne qui commence par « at ».
    const error = new Error('Failed query\nparams: x,at lea@example.com (piège)')
    error.stack = `Error: Failed query\nat lea@example.com (piège)\n    at update (/app/dist/index.js:10:5)`

    const { stack } = describeError(error, { method: 'PATCH', path: '/v1/me' })

    expect(stack).toEqual(['at update (/app/dist/index.js:10:5)'])
  })

  it('copes with something thrown that is not an Error', () => {
    expect(describeError('oops', { method: 'GET', path: '/' })).toMatchObject({ name: 'string' })
  })
})

// Audit de sécurité du 7/11/2026, N4 : le journal de Better Auth.
describe('writeAuthLog', () => {
  it('keeps the kind of a message, never what follows a colon nor an address', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('Failed query: select "token" from "session"\nparams: secret-token')

    writeAuthLog('error', 'INTERNAL_SERVER_ERROR', failure, 'lea@example.com')
    writeAuthLog('error', 'Failed query: select "token"\nparams: secret-token')
    writeAuthLog('error', 'Could not send to lea@example.com')

    const written = JSON.stringify(error.mock.calls)
    error.mockRestore()
    expect(written).toContain('INTERNAL_SERVER_ERROR')
    expect(written).toContain('Failed query')
    for (const secret of ['secret-token', 'lea@example.com', 'select', 'params']) {
      expect(written).not.toContain(secret)
    }
  })
})
