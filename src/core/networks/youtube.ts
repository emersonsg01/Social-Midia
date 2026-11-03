import { HttpError, http } from '../util'
import { readMedia, type Connector } from './types'

const API = 'https://www.googleapis.com/youtube/v3'
const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

export const youtubeConnector: Connector = {
  info: {
    id: 'youtube',
    name: 'YouTube',
    color: '#ff0033',
    siteUrl: 'https://www.youtube.com',
    developerUrl: 'https://console.cloud.google.com/apis/credentials',
    needsSecret: true,
    redirectHost: '127.0.0.1',
    setupSteps: [
      'No Google Cloud Console, crie um projeto e ative a "YouTube Data API v3".',
      'Configure a tela de consentimento OAuth e adicione seu e-mail como usuário de teste.',
      'Crie uma credencial "ID do cliente OAuth" do tipo "App para computador" e copie Client ID e Client Secret.',
      'Projetos não verificados pelo Google publicam vídeos como privados até passarem pela auditoria.',
    ],
    capabilities: {
      text: true,
      image: false,
      video: true,
      link: true,
      title: true,
      maxLength: 5000,
      requiresMedia: 'video',
      note: 'Publica vídeos. O texto vira a descrição e o título é obrigatório.',
    },
  },
  refreshable: true,
  oauth: () => ({
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    pkce: true,
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  }),

  async discover(token) {
    const r = await http(`${API}/channels?part=snippet&mine=true`, { headers: auth(token.accessToken) })
    if (!r.items?.length) throw new Error('Esta conta Google não tem um canal do YouTube.')
    return r.items.map((c: any) => ({
      token,
      account: {
        network: 'youtube' as const,
        externalId: c.id,
        name: c.snippet.title,
        handle: c.snippet.customUrl,
        avatarUrl: c.snippet.thumbnails?.default?.url,
        profileUrl: `https://www.youtube.com/channel/${c.id}`,
      },
    }))
  },

  async publish(_account, post, ctx) {
    const video = post.media.find((m) => m.kind === 'video')
    if (!video) throw new Error('O YouTube exige um arquivo de vídeo.')
    const description = post.link ? `${post.text}\n\n${post.link}` : post.text
    const start = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: { ...auth(ctx.accessToken), 'Content-Type': 'application/json', 'X-Upload-Content-Type': video.mime },
      body: JSON.stringify({
        snippet: { title: (post.title || post.text.split('\n')[0] || video.name).slice(0, 100), description, categoryId: '22' },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      }),
    })
    const location = start.headers.get('location')
    if (!start.ok || !location) {
      const body = await start.json().catch(() => ({}))
      throw new HttpError(start.status, `${start.status}: ${body.error?.message ?? 'falha ao iniciar upload'}`, body)
    }
    const upload = await fetch(location, { method: 'PUT', headers: { 'Content-Type': video.mime }, body: await readMedia(ctx.platform, video) })
    const body = await upload.json().catch(() => ({}))
    if (!upload.ok) throw new HttpError(upload.status, `${upload.status}: ${body.error?.message ?? 'falha no upload'}`, body)
    return { externalId: body.id, url: `https://youtu.be/${body.id}` }
  },

  async analytics(account, ctx) {
    const r = await http(`${API}/channels?part=statistics,contentDetails&id=${account.externalId}`, { headers: auth(ctx.accessToken) })
    const ch = r.items?.[0]
    const s = ch?.statistics ?? {}
    let recent: any[] = []
    const uploads = ch?.contentDetails?.relatedPlaylists?.uploads
    if (uploads) {
      const items = await http(`${API}/playlistItems?part=contentDetails&maxResults=10&playlistId=${uploads}`, { headers: auth(ctx.accessToken) })
      const ids = (items.items ?? []).map((i: any) => i.contentDetails.videoId).join(',')
      if (ids) recent = (await http(`${API}/videos?part=snippet,statistics&id=${ids}`, { headers: auth(ctx.accessToken) })).items ?? []
    }
    return {
      followers: Number(s.subscriberCount ?? 0),
      metrics: [
        { label: 'Inscritos', value: Number(s.subscriberCount ?? 0) },
        { label: 'Visualizações', value: Number(s.viewCount ?? 0) },
        { label: 'Vídeos', value: Number(s.videoCount ?? 0) },
      ],
      recent: recent.map((v) => ({
        id: v.id,
        text: v.snippet.title,
        url: `https://youtu.be/${v.id}`,
        createdAt: v.snippet.publishedAt,
        thumbnailUrl: v.snippet.thumbnails?.medium?.url,
        metrics: [
          { label: 'Views', value: Number(v.statistics.viewCount ?? 0) },
          { label: 'Curtidas', value: Number(v.statistics.likeCount ?? 0) },
          { label: 'Comentários', value: Number(v.statistics.commentCount ?? 0) },
        ],
      })),
    }
  },
}
