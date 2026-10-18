import { ApiError } from './errors'
import { shouldRetry } from './query-client'

describe('shouldRetry', () => {
  it('shows « not found » at once instead of asking again', () => {
    // Le bug : un projet introuvable faisait attendre plusieurs secondes (trois nouvelles tentatives).
    expect(shouldRetry(0, new ApiError('notFound'))).toBe(false)
    expect(shouldRetry(0, new ApiError('unauthorized'))).toBe(false)
    expect(shouldRetry(0, new ApiError('forbidden'))).toBe(false)
  })

  it('never asks again after a « too many requests » refusal', () => {
    expect(shouldRetry(0, new ApiError('rateLimited'))).toBe(false)
  })

  it('tries again, twice at most, when the network or the server stumbles', () => {
    expect(shouldRetry(0, new ApiError('network'))).toBe(true)
    expect(shouldRetry(1, new ApiError('unavailable'))).toBe(true)
    expect(shouldRetry(2, new ApiError('internal'))).toBe(false)
  })
})
