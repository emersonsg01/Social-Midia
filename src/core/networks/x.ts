import { http } from '../util'
import { readMedia, type Connector } from './types'

const API = 'https://api.x.com/2'

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

export const xConnector: Connector = {
  info: {
    id: 'x',
    name: 'X (Twitter)',
    color: '#e7e9ea',
    siteUrl: 'https://x.com',
    developerUrl: 'https://developer.x.com/en/portal/dashboard',
    needsSecret: false,
    redirectHost: '127.0.0.1',
    setupSteps: [
      'Crie um Projeto e um App no portal de desenvolvedores do X.',
      'Em "User authentication settings", ative OAuth 2.0 com permissão "Read and write" e tipo "Native App".',
      'Cadastre a Callback URI exibida abaixo e copie o Client ID.',
    ],
    capabilities: { text: true, image: true, video: false, link: true, maxLength: 280 },
  },
  refreshable: true,
  oauth: () => ({
    authorizeUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: `${API}/oauth2/token`,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'],
    pkce: true,
    basicAuth: true,
  }),

  async discover(token) {
    const { data } = await http(`${API}/users/me?user.fields=profile_image_url,username,name`, { headers: auth(token.accessToken) })
    return [
      {
        token,
        account: {
          network: 'x',
          externalId: data.id,
          name: data.name,
          handle: `@${data.username}`,
          avatarUrl: data.profile_image_url,
          profileUrl: `https://x.com/${data.username}`,
        },
      },
    ]
  },

  async publish(account, post, ctx) {
    const mediaIds: string[] = []
    for (const item of post.media.filter((m) => m.kind === 'image').slice(0, 4)) {
      const fd = new FormData()
      fd.set('media', await readMedia(ctx.platform, item), item.name)
      fd.set('media_category', 'tweet_image')
      fd.set('media_type', item.mime)
      const r = await http(`${API}/media/upload`, { method: 'POST', headers: auth(ctx.accessToken), body: fd })
      mediaIds.push(r.data?.id ?? r.media_id_string)
    }
    const text = post.link && !post.text.includes(post.link) ? `${post.text}\n${post.link}` : post.text
    const r = await http(`${API}/tweets`, {
      method: 'POST',
      headers: auth(ctx.accessToken),
      json: { text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) },
    })
    const handle = account.handle?.replace('@', '') ?? 'i'
    return { externalId: r.data.id, url: `https://x.com/${handle}/status/${r.data.id}` }
  },

  async analytics(account, ctx) {
    const { data: me } = await http(`${API}/users/${account.externalId}?user.fields=public_metrics`, { headers: auth(ctx.accessToken) })
    const m = me.public_metrics ?? {}
    const tweets = await http(
      `${API}/users/${account.externalId}/tweets?max_results=10&tweet.fields=public_metrics,created_at`,
      { headers: auth(ctx.accessToken) },
    ).catch(() => ({ data: [] }))
    return {
      followers: m.followers_count,
      metrics: [
        { label: 'Seguidores', value: m.followers_count ?? 0 },
        { label: 'Seguindo', value: m.following_count ?? 0 },
        { label: 'Posts', value: m.tweet_count ?? 0 },
        { label: 'Listas', value: m.listed_count ?? 0 },
      ],
      recent: (tweets.data ?? []).map((t: any) => ({
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        url: `${account.profileUrl}/status/${t.id}`,
        metrics: [
          { label: 'Curtidas', value: t.public_metrics?.like_count ?? 0 },
          { label: 'Reposts', value: t.public_metrics?.retweet_count ?? 0 },
          { label: 'Respostas', value: t.public_metrics?.reply_count ?? 0 },
          { label: 'Impressões', value: t.public_metrics?.impression_count ?? 0 },
        ],
      })),
    }
  },
}
