import type { OAuthSpec } from '../oauth'
import type { NetworkCredentials, TokenSet } from '../types'
import { http } from '../util'
import { readMedia, type Connector, type ConnectorContext } from './types'

const GRAPH = 'https://graph.facebook.com/v23.0'

const metaOAuth = (scopes: string[]): OAuthSpec => ({
  authorizeUrl: 'https://www.facebook.com/v23.0/dialog/oauth',
  tokenUrl: `${GRAPH}/oauth/access_token`,
  scopes,
  scopeSeparator: ',',
})

const metaSetup = [
  'Crie um app do tipo "Empresa" em Meta for Developers.',
  'Adicione o produto "Login do Facebook" e cadastre a URI de redirecionamento exibida abaixo.',
  'Em Configurações > Básico, copie o ID do app (Client ID) e a Chave secreta (Client Secret).',
  'No modo de desenvolvimento só você (e testadores) conseguem conectar; para outros usuários o app precisa passar pela revisão da Meta.',
]

const graph = (path: string, token: string, params: Record<string, string> = {}) => {
  const url = new URL(`${GRAPH}/${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return http(url.toString())
}

const graphPost = (path: string, token: string, body: Record<string, string> | FormData) => {
  const fd = body instanceof FormData ? body : new URLSearchParams(body)
  fd.set('access_token', token)
  return http(`${GRAPH}/${path}`, { method: 'POST', body: fd })
}

/** Swaps the short-lived user token for a ~60 day one; page tokens derived from it don't expire. */
async function longLivedUserToken(token: TokenSet, cred: NetworkCredentials): Promise<TokenSet> {
  if (!cred.clientSecret) return token
  const r = await graph('oauth/access_token', token.accessToken, {
    grant_type: 'fb_exchange_token',
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
    fb_exchange_token: token.accessToken,
  })
  return { accessToken: r.access_token, expiresAt: r.expires_in ? Date.now() + r.expires_in * 1000 : undefined }
}

async function listPages(userToken: string) {
  const r = await graph('me/accounts', userToken, {
    fields: 'id,name,access_token,link,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
    limit: '100',
  })
  return (r.data ?? []) as any[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitForContainer(id: string, token: string) {
  for (let i = 0; i < 60; i++) {
    const r = await graph(id, token, { fields: 'status_code,status' })
    if (r.status_code === 'FINISHED') return
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') throw new Error(`Instagram rejeitou a mídia: ${r.status ?? r.status_code}`)
    await sleep(5000)
  }
  throw new Error('Tempo esgotado aguardando o Instagram processar a mídia.')
}

export const facebookConnector: Connector = {
  info: {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877f2',
    siteUrl: 'https://www.facebook.com',
    developerUrl: 'https://developers.facebook.com/apps',
    needsSecret: true,
    redirectHost: 'localhost',
    setupSteps: metaSetup,
    capabilities: {
      text: true,
      image: true,
      video: true,
      link: true,
      maxLength: 63206,
      note: 'Publica em Páginas do Facebook. A API não permite publicar em perfis pessoais.',
    },
  },
  refreshable: false,
  oauth: () => metaOAuth(['public_profile', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'read_insights']),

  async discover(token, ctx) {
    const user = await longLivedUserToken(token, ctx.credentials)
    const pages = await listPages(user.accessToken)
    if (!pages.length) throw new Error('Nenhuma Página do Facebook encontrada. Verifique se você selecionou suas Páginas na autorização.')
    return pages.map((p) => ({
      token: { accessToken: p.access_token },
      account: {
        network: 'facebook' as const,
        externalId: p.id,
        name: p.name,
        avatarUrl: p.picture?.data?.url,
        profileUrl: p.link ?? `https://www.facebook.com/${p.id}`,
      },
    }))
  },

  async publish(account, post, ctx) {
    const token = ctx.accessToken
    const video = post.media.find((m) => m.kind === 'video')
    const images = post.media.filter((m) => m.kind === 'image')
    let id: string
    if (video) {
      const fd = new FormData()
      fd.set('description', post.text)
      if (post.title) fd.set('title', post.title)
      if (video.url) fd.set('file_url', video.url)
      else fd.set('source', await readMedia(ctx.platform, video), video.name)
      id = (await graphPost(`${account.externalId}/videos`, token, fd)).id
    } else if (images.length) {
      // Upload each photo unpublished, then attach them all to a single feed post.
      const photoIds: string[] = []
      for (const img of images.slice(0, 10)) {
        const fd = new FormData()
        fd.set('published', 'false')
        if (img.url) fd.set('url', img.url)
        else fd.set('source', await readMedia(ctx.platform, img), img.name)
        photoIds.push((await graphPost(`${account.externalId}/photos`, token, fd)).id)
      }
      const body: Record<string, string> = { message: post.text }
      photoIds.forEach((pid, i) => (body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: pid })))
      id = (await graphPost(`${account.externalId}/feed`, token, body)).id
    } else {
      const body: Record<string, string> = { message: post.text }
      if (post.link) body.link = post.link
      id = (await graphPost(`${account.externalId}/feed`, token, body)).id
    }
    return { externalId: id, url: `https://www.facebook.com/${id}` }
  },

  async analytics(account, ctx) {
    const page = await graph(account.externalId, ctx.accessToken, { fields: 'followers_count,fan_count' })
    const posts = await graph(`${account.externalId}/published_posts`, ctx.accessToken, {
      fields: 'message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
      limit: '10',
    }).catch(() => ({ data: [] }))
    return {
      followers: page.followers_count,
      metrics: [
        { label: 'Seguidores', value: page.followers_count ?? 0 },
        { label: 'Curtidas na Página', value: page.fan_count ?? 0 },
      ],
      recent: (posts.data ?? []).map((p: any) => ({
        id: p.id,
        text: p.message ?? '',
        url: p.permalink_url,
        createdAt: p.created_time,
        thumbnailUrl: p.full_picture,
        metrics: [
          { label: 'Reações', value: p.reactions?.summary?.total_count ?? 0 },
          { label: 'Comentários', value: p.comments?.summary?.total_count ?? 0 },
          { label: 'Compartilhamentos', value: p.shares?.count ?? 0 },
        ],
      })),
    }
  },
}

export const instagramConnector: Connector = {
  info: {
    id: 'instagram',
    name: 'Instagram',
    color: '#e1306c',
    siteUrl: 'https://www.instagram.com',
    developerUrl: 'https://developers.facebook.com/apps',
    needsSecret: true,
    redirectHost: 'localhost',
    setupSteps: [
      ...metaSetup,
      'A conta do Instagram precisa ser Profissional (Empresa ou Criador) e estar vinculada a uma Página do Facebook.',
    ],
    capabilities: {
      text: true,
      image: true,
      video: true,
      link: false,
      maxLength: 2200,
      requiresMedia: 'image-or-video',
      note: 'O Instagram exige ao menos uma imagem ou vídeo acessível por URL pública.',
    },
  },
  refreshable: false,
  oauth: () =>
    metaOAuth([
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
    ]),

  async discover(token, ctx) {
    const user = await longLivedUserToken(token, ctx.credentials)
    const pages = (await listPages(user.accessToken)).filter((p) => p.instagram_business_account)
    if (!pages.length) throw new Error('Nenhuma conta profissional do Instagram vinculada às suas Páginas do Facebook foi encontrada.')
    return pages.map((p) => {
      const ig = p.instagram_business_account
      return {
        token: { accessToken: p.access_token },
        account: {
          network: 'instagram' as const,
          externalId: ig.id,
          name: ig.name || ig.username,
          handle: `@${ig.username}`,
          avatarUrl: ig.profile_picture_url,
          profileUrl: `https://www.instagram.com/${ig.username}`,
          meta: { pageId: p.id },
        },
      }
    })
  },

  async publish(account, post, ctx: ConnectorContext) {
    const token = ctx.accessToken
    const media = post.media.filter((m) => m.url).slice(0, 10)
    if (!media.length) throw new Error('O Instagram exige imagem ou vídeo com URL pública (ex.: link direto de um CDN).')
    const ig = account.externalId
    const container = async (m: (typeof media)[number], extra: Record<string, string>) => {
      const body: Record<string, string> =
        m.kind === 'video' ? { media_type: 'REELS', video_url: m.url!, ...extra } : { image_url: m.url!, ...extra }
      const { id } = await graphPost(`${ig}/media`, token, body)
      if (m.kind === 'video') await waitForContainer(id, token)
      return id as string
    }

    let creationId: string
    if (media.length === 1) {
      creationId = await container(media[0], { caption: post.text })
    } else {
      const children: string[] = []
      for (const m of media) children.push(await container(m, { is_carousel_item: 'true' }))
      creationId = (await graphPost(`${ig}/media`, token, { media_type: 'CAROUSEL', children: children.join(','), caption: post.text })).id
      await waitForContainer(creationId, token)
    }
    const { id } = await graphPost(`${ig}/media_publish`, token, { creation_id: creationId })
    const link = await graph(id, token, { fields: 'permalink' }).catch(() => ({}))
    return { externalId: id, url: link.permalink }
  },

  async analytics(account, ctx) {
    const me = await graph(account.externalId, ctx.accessToken, { fields: 'followers_count,follows_count,media_count' })
    const media = await graph(`${account.externalId}/media`, ctx.accessToken, {
      fields: 'caption,timestamp,permalink,like_count,comments_count,media_url,thumbnail_url,media_type',
      limit: '12',
    }).catch(() => ({ data: [] }))
    return {
      followers: me.followers_count,
      metrics: [
        { label: 'Seguidores', value: me.followers_count ?? 0 },
        { label: 'Seguindo', value: me.follows_count ?? 0 },
        { label: 'Publicações', value: me.media_count ?? 0 },
      ],
      recent: (media.data ?? []).map((m: any) => ({
        id: m.id,
        text: m.caption ?? '',
        url: m.permalink,
        createdAt: m.timestamp,
        thumbnailUrl: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
        metrics: [
          { label: 'Curtidas', value: m.like_count ?? 0 },
          { label: 'Comentários', value: m.comments_count ?? 0 },
        ],
      })),
    }
  },
}
