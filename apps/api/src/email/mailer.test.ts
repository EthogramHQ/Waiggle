import { afterEach, describe, expect, it, vi } from 'vitest'
// Tests des transports d'e-mail : Scaleway et Brevo par leur API HTTP, la console en développement,
// et (R8) le SMTP de Scaleway, par nodemailer, le seul qui sache joindre les vignettes du récap « en
// ligne » (montrées par `cid:`, jamais chargées à distance). Relecture du plan R8 : TLS exigé (sec-A2),
// l'adresse vérifiée par le contrat avant l'envoi (sec-A5, avis GHSA-3q53-mvfw-q9v8 de nodemailer),
// et les autres transports refusent un e-mail avec pièces jointes plutôt que de les perdre.
import { z } from 'zod'
import {
  createBrevoMailer,
  createConsoleMailer,
  createMemoryMailer,
  createScalewayMailer,
  createSmtpMailer,
} from './mailer'
import type { Attachment } from './templates'

// nodemailer remplacé par un faux, qui note la configuration du transport et chaque message au lieu
// d'ouvrir une connexion. `vi.hoisted` : ces variables existent avant le `vi.mock`, que Vitest
// remonte en tête du fichier. Le faux répond à `import nodemailer from` comme à
// `import { createTransport } from`.
const smtp = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
  failure: null as Error | null,
}))
vi.mock('nodemailer', () => {
  const createTransport = (options: Record<string, unknown>) => {
    smtp.options.push(options)
    return {
      async sendMail(message: Record<string, unknown>) {
        if (smtp.failure) throw smtp.failure
        smtp.messages.push(message)
        return { messageId: '<m1@example.com>', accepted: [message.to], rejected: [] }
      },
      close() {},
    }
  }
  return { default: { createTransport }, createTransport }
})

afterEach(() => {
  smtp.options.length = 0
  smtp.messages.length = 0
  smtp.failure = null
})

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

// ─── Le SMTP de Scaleway (R8) ────────────────────────────────────────────────────────────────────

/** Une vignette du récap : quelques octets de JPEG suffisent, le faux ne les décode pas. */
const thumb: Attachment = {
  filename: 'projet-1.jpg',
  contentType: 'image/jpeg',
  content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  cid: 'thumb-1',
}
const tile: Attachment = {
  filename: 'categorie-2.png',
  contentType: 'image/png',
  content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  cid: 'thumb-2',
}
const withThumbs = {
  ...email,
  html: '<p>Texte</p><img src="cid:thumb-1" alt="Météo"><img src="cid:thumb-2" alt="Vélo">',
  attachments: [thumb, tile],
}

const smtpWith = (port: number) =>
  createSmtpMailer({
    host: 'smtp.tem.scaleway.com',
    port,
    // Sur Scaleway, l'identifiant SMTP est l'identifiant du projet, le mot de passe la clé secrète.
    user: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
    password: ['test', 'smtp', 'secret'].join('-'),
    from: { email: 'no-reply@waiggle.com', name: 'Ruche' },
  })

/** Les en-têtes d'un message nodemailer, qu'ils soient écrits en objet ou en liste de paires. */
const headersOf = (message: Record<string, unknown> | undefined) => {
  const headers = message?.headers
  if (Array.isArray(headers)) {
    return Object.fromEntries(
      headers.map((pair: { key: string; value: string }) => [pair.key, pair.value]),
    )
  }
  return headers ?? {}
}

describe('createSmtpMailer', () => {
  it('builds the SMTP transport with TLS required', async () => {
    for (const port of [465, 587]) {
      smtp.options.length = 0

      await smtpWith(port).send(email)

      expect(smtp.options).toHaveLength(1)
      const options = smtp.options[0] ?? {}
      expect(options).toMatchObject({
        host: 'smtp.tem.scaleway.com',
        port,
        auth: {
          user: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
          pass: ['test', 'smtp', 'secret'].join('-'),
        },
      })
      // 465 : TLS dès la connexion ; 587 : STARTTLS exigé. Sans l'un ou l'autre, nodemailer
      // enverrait l'identification en clair si le serveur n'annonçait pas STARTTLS (sec-A2).
      if (port === 465) expect(options.secure, String(port)).toBe(true)
      else expect(options.requireTLS, String(port)).toBe(true)
      // Le certificat du serveur est toujours vérifié, et rien n'écrit la conversation SMTP (où
      // passent l'identification et les adresses) dans les journaux.
      const tls = (options.tls ?? {}) as Record<string, unknown>
      expect(tls.rejectUnauthorized).not.toBe(false)
      expect(options.logger ?? false).toBe(false)
      expect(options.debug ?? false).toBe(false)
    }
  })

  it('sends the email with its text, its HTML and the one-click headers', async () => {
    await smtpWith(465).send(withHeaders)

    expect(smtp.messages).toHaveLength(1)
    const message = smtp.messages[0]
    expect(message).toMatchObject({
      to: 'lea@example.com',
      subject: 'Sujet',
      text: 'Texte',
      html: '<p>Texte</p>',
    })
    expect(JSON.stringify(message?.from)).toContain('no-reply@waiggle.com')
    expect(headersOf(message)).toEqual(withHeaders.headers)
    // Rien d'autre n'est joint à un e-mail qui n'a pas de vignette.
    expect((message?.attachments as unknown[] | undefined) ?? []).toEqual([])
  })

  it('joins the thumbnails inline, each under its cid', async () => {
    await smtpWith(465).send(withThumbs)

    const attachments = (smtp.messages[0]?.attachments ?? []) as Record<string, unknown>[]
    expect(attachments).toHaveLength(2)
    for (const [index, expected] of [thumb, tile].entries()) {
      const attachment = attachments[index]
      expect(attachment).toMatchObject({
        filename: expected.filename,
        contentType: expected.contentType,
        cid: expected.cid,
      })
      // Les octets de l'image, tels quels (un Buffer est un Uint8Array).
      expect(attachment?.content).toBeInstanceOf(Uint8Array)
      expect(
        Buffer.from(attachment?.content as Uint8Array).equals(Buffer.from(expected.content)),
      ).toBe(true)
      // Jamais un chemin, une adresse ou un lien : le transport ne va rien chercher ailleurs.
      expect(attachment?.path).toBeUndefined()
      expect(attachment?.href).toBeUndefined()
    }
  })

  it('refuses to send to an address the contract does not accept', async () => {
    for (const to of [
      'lea@example.com, eve@evil.example',
      'lea@example.com\r\nBcc: eve@evil.example',
      '"eve@evil.example"@example.com',
      'Léa <lea@example.com>',
      'eve@evil.example (lea@example.com)',
      'lea@example.com;eve@evil.example',
      '',
    ]) {
      // L'adresse est refusée par le contrat avant toute connexion (avis GHSA-3q53-mvfw-q9v8).
      expect(z.email().safeParse(to).success, to).toBe(false)

      await expect(smtpWith(465).send({ ...email, to }), to).rejects.toThrow()

      expect(smtp.messages, to).toEqual([])
    }
    // Témoin : une adresse ordinaire part.
    await smtpWith(465).send(email)
    expect(smtp.messages).toHaveLength(1)
  })

  it('refuses any other header, a line break or a non-ASCII value, and sends nothing', async () => {
    for (const headers of [
      { Bcc: 'someone@evil.example' },
      { 'List-Unsubscribe': `<${unsubscribeUrl}>\r\nBcc: someone@evil.example` },
      { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Clické' },
      { 'Reply-To': 'someone@evil.example' },
    ]) {
      await expect(smtpWith(465).send({ ...email, headers })).rejects.toThrow()
    }

    expect(smtp.messages).toEqual([])
    // Témoin : les deux en-têtes permis partent.
    await smtpWith(465).send(withHeaders)
    expect(smtp.messages).toHaveLength(1)
  })

  it('fails loudly when the SMTP server refuses the email, without repeating its answer', async () => {
    smtp.failure = new Error('550 5.1.1 <lea@example.com>: internal details of the relay')

    await expect(smtpWith(465).send(email)).rejects.toThrow()
    // L'erreur peut finir dans un journal : ni la réponse du serveur, ni l'adresse.
    const error = await smtpWith(465)
      .send(email)
      .then(
        () => null,
        (thrown: unknown) => thrown,
      )
    expect(String(error)).not.toContain('internal details')
    expect(String(error)).not.toContain('lea@example.com')
    // Témoin : le serveur accepte de nouveau, le même e-mail part.
    smtp.failure = null
    await smtpWith(465).send(email)
    expect(smtp.messages).toHaveLength(1)
  })
})

describe('the SMTP transport without encryption', () => {
  it('refuses to exist on a port that does not encrypt', () => {
    for (const port of [25, 2525, 80]) {
      expect(() => smtpWith(port), String(port)).toThrow()
    }
    expect(smtp.options).toEqual([])
  })
})

describe('the thumbnails on the other transports', () => {
  it('refuses an e-mail with attachments rather than lose them, and sends nothing', async () => {
    const scaleway = recordingFetch(new Response('{}', { status: 200 }))
    const brevo = recordingFetch(new Response('{}', { status: 201 }))
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await expect(scalewayWith(scaleway.fakeFetch).send(withThumbs)).rejects.toThrow()
      await expect(brevoWith(brevo.fakeFetch).send(withThumbs)).rejects.toThrow()
      await expect(createConsoleMailer().send(withThumbs)).rejects.toThrow()

      expect(scaleway.calls).toEqual([])
      expect(brevo.calls).toEqual([])
      expect(logged).not.toHaveBeenCalled()
      // Témoin : sans vignette, les mêmes transports envoient.
      await scalewayWith(scaleway.fakeFetch).send({ ...withThumbs, attachments: [] })
      expect(scaleway.calls).toHaveLength(1)
    } finally {
      logged.mockRestore()
    }
  })

  it('keeps them in the memory mailer of the tests', async () => {
    const mailer = createMemoryMailer()

    await mailer.send(withThumbs)

    expect(mailer.sent[0]?.attachments).toEqual([thumb, tile])
  })
})
