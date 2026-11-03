import { http } from '../util'
import type { Connector, ConnectorContext } from './types'

const API = 'https://api.twitch.tv/helix'
const headers = (ctx: Pick<ConnectorContext, 'accessToken' | 'credentials'>) => ({
  Authorization: `Bearer ${ctx.accessToken}`,
  'Client-Id': ctx.credentials.clientId,
})

export const twitchConnector: Connector = {
  info: {
    id: 'twitch',
    name: 'Twitch',
    color: '#9146ff',
    siteUrl: 'https://www.twitch.tv',
    developerUrl: 'https://dev.twitch.tv/console/apps',
    needsSecret: true,
    redirectHost: 'localhost',
    setupSteps: [
      'No Twitch Developer Console, registre um aplicativo do tipo "Confidential".',
      'Cadastre a OAuth Redirect URL exibida abaixo.',
      'Copie o Client ID e gere um Client Secret.',
    ],
    capabilities: {
      text: true,
      image: false,
      video: false,
      link: false,
      title: true,
      maxLength: 140,
      note: 'Na Twitch, "publicar" atualiza o título da transmissão do canal.',
    },
  },
  refreshable: true,
  oauth: () => ({
    authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    scopes: ['user:read:email', 'channel:manage:broadcast', 'moderator:read:followers'],
  }),

  async discover(token, ctx) {
    const r = await http(`${API}/users`, { headers: headers({ accessToken: token.accessToken, credentials: ctx.credentials }) })
    return r.data.map((u: any) => ({
      token,
      account: {
        network: 'twitch' as const,
        externalId: u.id,
        name: u.display_name,
        handle: u.login,
        avatarUrl: u.profile_image_url,
        profileUrl: `https://www.twitch.tv/${u.login}`,
      },
    }))
  },

  async publish(account, post, ctx) {
    const title = (post.title || post.text).slice(0, 140)
    await http(`${API}/channels?broadcaster_id=${account.externalId}`, { method: 'PATCH', headers: headers(ctx), json: { title } })
    return { url: account.profileUrl }
  },

  async analytics(account, ctx) {
    const id = account.externalId
    const [followers, streams, videos, channel] = await Promise.all([
      http(`${API}/channels/followers?broadcaster_id=${id}&first=1`, { headers: headers(ctx) }).catch(() => ({ total: 0 })),
      http(`${API}/streams?user_id=${id}`, { headers: headers(ctx) }).catch(() => ({ data: [] })),
      http(`${API}/videos?user_id=${id}&first=10`, { headers: headers(ctx) }).catch(() => ({ data: [] })),
      http(`${API}/channels?broadcaster_id=${id}`, { headers: headers(ctx) }).catch(() => ({ data: [] })),
    ])
    const live = streams.data?.[0]
    return {
      followers: followers.total,
      metrics: [
        { label: 'Seguidores', value: followers.total ?? 0 },
        { label: live ? 'Espectadores ao vivo' : 'Ao vivo', value: live ? live.viewer_count : 0 },
        { label: 'Vídeos recentes', value: videos.data?.length ?? 0 },
      ],
      notes: channel.data?.[0] ? [`Título atual: "${channel.data[0].title}" · Categoria: ${channel.data[0].game_name || '—'}`] : undefined,
      recent: (videos.data ?? []).map((v: any) => ({
        id: v.id,
        text: v.title,
        url: v.url,
        createdAt: v.created_at,
        thumbnailUrl: v.thumbnail_url?.replace('%{width}', '320').replace('%{height}', '180'),
        metrics: [{ label: 'Views', value: v.view_count ?? 0 }],
      })),
    }
  },
}
