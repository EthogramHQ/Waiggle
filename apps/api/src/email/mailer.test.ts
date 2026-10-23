import { describe, expect, it, vi } from 'vitest'
import { createBrevoMailer, createConsoleMailer, createScalewayMailer } from './mailer'

const email = { to: 'lea@example.com', subject: 'Sujet', text: 'Texte', html: '<p>Texte</p>' }

// Un faux `fetch` qui note la requête au lieu de l'envoyer sur Internet, et répond ce qu'on veut.
const recordingFetch = (response: Response) => {
  const calls: { url: string; init: RequestInit }[] = []
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return response
  }
  return { calls, fakeFetch }
}

describe('createScalewayMailer', () => {
  it('sends the email through the Scaleway API, with the secret key in a header', async () => {
    const { calls, fakeFetch } = recordingFetch(
      new Response(JSON.stringify({ id: 'e1', status: 'new' }), { status: 200 }),
    )
    const mailer = createScalewayMailer({
      secretKey: 'test-secret',
      projectId: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
      region: 'fr-par',
      from: { email: 'no-reply@waiggle.com', name: 'Ruche' },
      fetch: fakeFetch,
    })

    await mailer.send(email)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails',
    )
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('x-auth-token')).toBe('test-secret')
    // Un prestataire qui ne répond pas ne doit pas bloquer l'inscription : la requête a un délai.
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      project_id: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
      from: { email: 'no-reply@waiggle.com', name: 'Ruche' },
      to: [{ email: 'lea@example.com' }],
      subject: 'Sujet',
      text: 'Texte',
      html: '<p>Texte</p>',
    })
  })

  it('fails loudly when Scaleway refuses the email, without repeating its answer', async () => {
    const mailer = createScalewayMailer({
      secretKey: 'bad-secret',
      projectId: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
      region: 'fr-par',
      from: { email: 'no-reply@waiggle.com', name: 'Ruche' },
      fetch: async () => new Response('{"message":"internal details"}', { status: 403 }),
    })

    await expect(mailer.send(email)).rejects.toThrow(/403/)
    await expect(mailer.send(email)).rejects.not.toThrow(/internal details/)
  })
})

describe('createBrevoMailer', () => {
  it('sends the email through the Brevo API, with the key in a header and no tracking', async () => {
    // Un faux `fetch` qui note la requête au lieu de l'envoyer sur Internet.
    const calls: { url: string; init: RequestInit }[] = []
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify({ messageId: 'm1' }), { status: 201 })
    }
    const mailer = createBrevoMailer({
      apiKey: 'test-key',
      from: { email: 'no-reply@waiggle.com', name: 'Ruche' },
      fetch: fakeFetch,
    })

    await mailer.send(email)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.brevo.com/v3/smtp/email')
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('api-key')).toBe('test-key')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      sender: { email: 'no-reply@waiggle.com', name: 'Ruche' },
      // Pas de pixel d'ouverture ni de lien de suivi : la promesse « pas de traqueurs ».
      to: [{ email: 'lea@example.com', contactPixelTrackingConsent: false }],
      subject: 'Sujet',
      textContent: 'Texte',
      htmlContent: '<p>Texte</p>',
    })
  })

  it('fails loudly when Brevo refuses the email', async () => {
    const mailer = createBrevoMailer({
      apiKey: 'bad-key',
      from: { email: 'no-reply@waiggle.com', name: 'Ruche' },
      fetch: async () => new Response('unauthorized', { status: 401 }),
    })

    await expect(mailer.send(email)).rejects.toThrow(/401/)
  })
})

// Les en-têtes de désinscription en un clic (tranche 6c, RFC 8058) : le récap et l'e-mail de
// mentions portent « List-Unsubscribe » (l'adresse signée) et « List-Unsubscribe-Post », pour que
// la messagerie affiche son bouton « Se désabonner ». Seuls ces deux en-têtes sont permis, en ASCII
// imprimable (relecture de sécurité S-A7) : un retour à la ligne dans une valeur ajouterait un
// en-tête (« Bcc: … », une copie cachée vers n'importe qui).
const unsubscribeUrl = 'https://api.waiggle.com/v1/email/unsubscribe?token=v1.abc.recap.sig'
const withHeaders = {
  ...email,
  headers: {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
}

const scalewayWith = (fakeFetch: typeof fetch) =>
  createScalewayMailer({
    secretKey: 'test-secret',
    projectId: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
    region: 'fr-par',
    from: { email: 'no-reply@waiggle.com', name: 'Ruche' },
    fetch: fakeFetch,
  })
const brevoWith = (fakeFetch: typeof fetch) =>
  createBrevoMailer({
    apiKey: 'test-key',
    from: { email: 'no-reply@waiggle.com', name: 'Ruche' },
    fetch: fakeFetch,
  })

describe('the one-click unsubscribe headers', () => {
  it('passes them to Scaleway as additional headers', async () => {
    const { calls, fakeFetch } = recordingFetch(new Response('{}', { status: 200 }))

    await scalewayWith(fakeFetch).send(withHeaders)

    expect(JSON.parse(String(calls[0]?.init.body)).additional_headers).toEqual([
      { key: 'List-Unsubscribe', value: `<${unsubscribeUrl}>` },
      { key: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
    ])
  })

  it('passes them to Brevo as headers', async () => {
    const { calls, fakeFetch } = recordingFetch(new Response('{}', { status: 201 }))

    await brevoWith(fakeFetch).send(withHeaders)

    expect(JSON.parse(String(calls[0]?.init.body)).headers).toEqual(withHeaders.headers)
  })

  it('shows them in the terminal in development', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})

    await createConsoleMailer().send(withHeaders)

    expect(JSON.stringify(logged.mock.calls)).toContain('List-Unsubscribe')
    logged.mockRestore()
  })

  it('refuses any other header, a line break or a non-ASCII value, and sends nothing', async () => {
    const forbidden = [
      { Bcc: 'someone@evil.example' },
      { 'List-Unsubscribe': `<${unsubscribeUrl}>\r\nBcc: someone@evil.example` },
      { 'List-Unsubscribe': `<${unsubscribeUrl}>\nBcc: someone@evil.example` },
      { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Clické' },
      { 'Reply-To': 'someone@evil.example' },
    ]
    for (const headers of forbidden) {
      const scaleway = recordingFetch(new Response('{}', { status: 200 }))
      const brevo = recordingFetch(new Response('{}', { status: 201 }))

      await expect(scalewayWith(scaleway.fakeFetch).send({ ...email, headers })).rejects.toThrow()
      await expect(brevoWith(brevo.fakeFetch).send({ ...email, headers })).rejects.toThrow()

      expect(scaleway.calls).toEqual([])
      expect(brevo.calls).toEqual([])
    }
  })
})
