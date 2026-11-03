import { HttpError, http } from '../util'
import { readMedia, type Connector, type ConnectorContext } from './types'

const headers = (ctx: Pick<ConnectorContext, 'accessToken' | 'settings'>) => ({
  Authorization: `Bearer ${ctx.accessToken}`,
  'LinkedIn-Version': ctx.settings.linkedinVersion,
  'X-Restli-Protocol-Version': '2.0.0',
})

async function uploadImage(owner: string, blob: Blob, ctx: ConnectorContext) {
  const init = await http('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: headers(ctx),
    json: { initializeUploadRequest: { owner } },
  })
  const res = await fetch(init.value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
    body: blob,
  })
  if (!res.ok) throw new HttpError(res.status, `Falha ao enviar imagem ao LinkedIn (${res.status})`)
  return init.value.image as string
}

export const linkedinConnector: Connector = {
  info: {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0a66c2',
    siteUrl: 'https://www.linkedin.com',
    developerUrl: 'https://www.linkedin.com/developers/apps',
    needsSecret: true,
    redirectHost: 'localhost',
    setupSteps: [
      'Crie um app em LinkedIn Developers vinculado a uma Página da empresa.',
      'Em "Products", adicione "Sign In with LinkedIn using OpenID Connect" e "Share on LinkedIn".',
      'Em "Auth", cadastre a Redirect URL exibida abaixo e copie Client ID e Client Secret.',
    ],
    capabilities: { text: true, image: true, video: false, link: true, maxLength: 3000 },
  },
  refreshable: false,
  oauth: () => ({
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
  }),

  async discover(token) {
    const me = await http('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.accessToken}` } })
    return [
      {
        token,
        account: {
          network: 'linkedin',
          externalId: me.sub,
          name: me.name,
          handle: me.email,
          avatarUrl: me.picture,
          profileUrl: 'https://www.linkedin.com/in/me',
        },
      },
    ]
  },

  async publish(account, post, ctx) {
    const author = `urn:li:person:${account.externalId}`
    let content: unknown
    const image = post.media.find((m) => m.kind === 'image')
    if (image) {
      const id = await uploadImage(author, await readMedia(ctx.platform, image), ctx)
      content = { media: { id, altText: image.name } }
    } else if (post.link) {
      content = { article: { source: post.link, title: post.title || post.link } }
    }
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: { ...headers(ctx), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author,
        commentary: post.text,
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(content ? { content } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new HttpError(res.status, `${res.status}: ${body.message ?? res.statusText}`, body)
    }
    const urn = res.headers.get('x-restli-id') ?? undefined
    return { externalId: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : undefined }
  },

  async analytics() {
    return {
      metrics: [],
      recent: [],
      notes: [
        'A API pública do LinkedIn não libera métricas de perfis pessoais. Estatísticas de Páginas exigem o produto "Community Management API" aprovado pelo LinkedIn.',
        'Os tokens do LinkedIn valem 60 dias — reconecte a conta quando expirar.',
      ],
    }
  },
}
