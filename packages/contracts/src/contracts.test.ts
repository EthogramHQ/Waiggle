import { describe, expect, it } from 'vitest'
import { ErrorResponse, HealthResponse } from './index'

// `parse` renvoie la donnée si elle est valide et lève une erreur sinon.
// `safeParse` ne lève jamais d'erreur : il renvoie { success: true/false, ... }.

describe('HealthResponse', () => {
  it('accepts a healthy response with a version', () => {
    expect(HealthResponse.parse({ status: 'ok', version: '0.1.0' })).toEqual({
      status: 'ok',
      version: '0.1.0',
    })
  })

  it('rejects any other status', () => {
    expect(HealthResponse.safeParse({ status: 'down', version: '0.1.0' }).success).toBe(false)
  })
})

describe('ErrorResponse', () => {
  it('accepts a known error code with a message', () => {
    const body = { error: { code: 'not_found', message: "Cette page n'existe pas." } }
    expect(ErrorResponse.parse(body)).toEqual(body)
  })

  it('rejects an unknown error code', () => {
    const body = { error: { code: 'teapot', message: 'I am a teapot' } }
    expect(ErrorResponse.safeParse(body).success).toBe(false)
  })
})
