import type { ToolDef } from './ai'
import { connectors } from './networks'
import type { AppService } from './service'
import type { MediaItem, NetworkId } from './types'

export interface AppTool {
  def: ToolDef
  run(args: any): Promise<unknown>
}

const guessMedia = (url: string): MediaItem => {
  const isVideo = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)
  const name = url.split('/').pop()?.split('?')[0] || 'media'
  return { kind: isVideo ? 'video' : 'image', url, name, mime: isVideo ? 'video/mp4' : 'image/jpeg' }
}

/**
 * The app's capabilities as tools. Shared by the in-app assistant and by the local MCP
 * server that external AIs (Claude Desktop, ChatGPT, LM Studio...) connect to.
 */
export function buildTools(service: AppService): AppTool[] {
  return [
    {
      def: {
        name: 'list_accounts',
        description: 'Lista as contas/páginas/canais conectados, com id, rede, nome e o que cada rede aceita publicar.',
        parameters: { type: 'object', properties: {} },
      },
      async run() {
        const accounts = await service.store.getAccounts()
        return accounts.map((a) => ({
          id: a.id,
          network: a.network,
          name: a.name,
          handle: a.handle,
          url: a.profileUrl,
          capabilities: connectors[a.network].info.capabilities,
        }))
      },
    },
    {
      def: {
        name: 'get_analytics',
        description: 'Retorna métricas (seguidores, engajamento, posts recentes) de uma conta, ou de todas se account_id for omitido.',
        parameters: {
          type: 'object',
          properties: {
            account_id: { type: 'string', description: 'Id retornado por list_accounts.' },
            refresh: { type: 'boolean', description: 'Buscar dados atualizados na rede em vez do cache.' },
          },
        },
      },
      async run({ account_id, refresh }) {
        const ids = account_id ? [account_id] : (await service.store.getAccounts()).map((a) => a.id)
        return Promise.all(
          ids.map((id) =>
            service.getAnalytics(id, !!refresh).catch((e) => ({ accountId: id, error: String(e?.message ?? e) })),
          ),
        )
      },
    },
    {
      def: {
        name: 'get_growth_history',
        description: 'Histórico diário de seguidores e métricas de uma conta, para analisar crescimento.',
        parameters: { type: 'object', properties: { account_id: { type: 'string' } }, required: ['account_id'] },
      },
      run: ({ account_id }) => service.getSnapshots(account_id),
    },
    {
      def: {
        name: 'list_posts',
        description: 'Lista publicações (rascunhos, agendadas, publicadas, com falha). Datas em ISO 8601.',
        parameters: {
          type: 'object',
          properties: { status: { type: 'string', enum: ['draft', 'scheduled', 'published', 'partial', 'failed'] } },
        },
      },
      async run({ status }) {
        const posts = await service.listPosts()
        return posts
          .filter((p) => !status || p.status === status)
          .map((p) => ({ id: p.id, status: p.status, scheduledAt: p.scheduledAt, text: p.draft.text, accountIds: p.draft.accountIds, results: p.results }))
      },
    },
    {
      def: {
        name: 'create_post',
        description:
          'Cria uma publicação para uma ou mais contas. Sem scheduled_at vira rascunho; com scheduled_at (ISO 8601 com fuso) é agendada. Só use publish_now=true se o usuário pediu explicitamente para publicar agora.',
        parameters: {
          type: 'object',
          properties: {
            account_ids: { type: 'array', items: { type: 'string' } },
            text: { type: 'string' },
            title: { type: 'string', description: 'Título do vídeo (YouTube) ou da live (Twitch).' },
            link: { type: 'string' },
            media_urls: { type: 'array', items: { type: 'string' }, description: 'URLs públicas de imagens ou vídeos.' },
            overrides: {
              type: 'object',
              description: 'Texto específico por conta: { "<account_id>": { "text": "..." } }',
              additionalProperties: { type: 'object', properties: { text: { type: 'string' }, title: { type: 'string' } } },
            },
            scheduled_at: { type: 'string' },
            publish_now: { type: 'boolean' },
          },
          required: ['account_ids', 'text'],
        },
      },
      async run(a) {
        const post = await service.savePost({
          draft: {
            text: a.text,
            title: a.title,
            link: a.link,
            media: (a.media_urls ?? []).map(guessMedia),
            accountIds: a.account_ids,
            overrides: a.overrides,
          },
          scheduledAt: a.scheduled_at ? new Date(a.scheduled_at).toISOString() : null,
        })
        return a.publish_now ? service.publishNow(post.id) : post
      },
    },
    {
      def: {
        name: 'reschedule_post',
        description: 'Altera a data de uma publicação agendada ou rascunho. scheduled_at null volta para rascunho.',
        parameters: {
          type: 'object',
          properties: { post_id: { type: 'string' }, scheduled_at: { type: ['string', 'null'] } },
          required: ['post_id'],
        },
      },
      async run({ post_id, scheduled_at }) {
        const post = (await service.listPosts()).find((p) => p.id === post_id)
        if (!post) throw new Error('Publicação não encontrada.')
        return service.savePost({ id: post.id, draft: post.draft, scheduledAt: scheduled_at ? new Date(scheduled_at).toISOString() : null })
      },
    },
    {
      def: {
        name: 'publish_post',
        description: 'Publica imediatamente uma publicação existente (ou tenta novamente as contas que falharam).',
        parameters: { type: 'object', properties: { post_id: { type: 'string' } }, required: ['post_id'] },
      },
      run: ({ post_id }) => service.publishNow(post_id),
    },
    {
      def: {
        name: 'delete_post',
        description: 'Exclui um rascunho ou cancela um agendamento.',
        parameters: { type: 'object', properties: { post_id: { type: 'string' } }, required: ['post_id'] },
      },
      async run({ post_id }) {
        await service.deletePost(post_id)
        return { deleted: post_id }
      },
    },
    {
      def: {
        name: 'network_guidelines',
        description: 'Limites e requisitos de publicação de cada rede (tamanho de texto, mídia obrigatória etc.).',
        parameters: { type: 'object', properties: {} },
      },
      async run() {
        return Object.fromEntries(
          (Object.keys(connectors) as NetworkId[]).map((id) => [id, { name: connectors[id].info.name, ...connectors[id].info.capabilities }]),
        )
      },
    },
  ]
}
