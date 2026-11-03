import { AccountAvatar, NetworkIcon } from '@/components/NetworkIcon'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, fmtDate, useToast } from '@/components/ui'
import type { NetworkInfo } from '@/core/networks'
import type { NetworkSetup } from '@/core/service'
import type { NetworkId } from '@/core/types'
import { api, openExternal } from '@/lib/api'
import { useApp } from '@/lib/state'
import { Copy, ExternalLink, Globe, KeyRound, Plug, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'

function SetupModal({ network, onClose }: { network: NetworkInfo; onClose: () => void }) {
  const toast = useToast()
  const [setup, setSetup] = useState<NetworkSetup>()
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => void api.getNetworkSetup(network.id).then(setSetup), [network.id])

  const save = async () => {
    if (!setup) return
    setSaving(true)
    try {
      await api.setNetworkSetup(network.id, {
        clientId: setup.clientId,
        clientSecret: secret || undefined,
        redirectUri: setup.redirectUri === setup.defaultRedirectUri ? undefined : setup.redirectUri,
      })
      toast('ok', `${network.name} configurado.`)
      onClose()
    } catch (e: any) {
      toast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Configurar ${network.name}`} wide>
      {!setup ? null : (
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <p className="mb-2 text-sm font-medium">Como obter as credenciais</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
              {network.setupSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <Button size="sm" className="mt-3" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(network.developerUrl)}>
              Abrir portal de desenvolvedores
            </Button>
          </div>

          <Field label="URL de redirecionamento (Callback / Redirect URI)" hint="Cadastre exatamente este endereço no app de desenvolvedor.">
            <div className="flex gap-2">
              <Input value={setup.redirectUri} onChange={(e) => setSetup({ ...setup, redirectUri: e.target.value })} />
              <Button icon={<Copy className="size-4" />} onClick={() => navigator.clipboard.writeText(setup.redirectUri).then(() => toast('info', 'Copiado!'))}>
                Copiar
              </Button>
            </div>
          </Field>
          <Field label="Client ID / App ID">
            <Input value={setup.clientId} onChange={(e) => setSetup({ ...setup, clientId: e.target.value })} placeholder="Cole aqui" />
          </Field>
          <Field
            label={`Client Secret${network.needsSecret ? '' : ' (opcional)'}`}
            hint={setup.hasSecret ? 'Já existe um segredo salvo. Deixe vazio para mantê-lo.' : 'Guardado criptografado neste dispositivo.'}
          >
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={setup.hasSecret ? '••••••••••' : ''} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={save} disabled={!setup.clientId}>
              Salvar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function Accounts() {
  const { networks, accounts, settings, navigate } = useApp()
  const toast = useToast()
  const [setupFor, setSetupFor] = useState<NetworkInfo>()
  const [connecting, setConnecting] = useState<NetworkId>()

  const connect = async (n: NetworkInfo) => {
    if (!settings.configuredNetworks.includes(n.id)) return setSetupFor(n)
    setConnecting(n.id)
    toast('info', `Conclua o login do ${n.name} no navegador que foi aberto.`)
    try {
      const added = await api.connect(n.id)
      toast('ok', `${added.length} conta(s) do ${n.name} conectada(s).`)
    } catch (e: any) {
      toast('error', e.message)
    } finally {
      setConnecting(undefined)
    }
  }

  const disconnect = async (id: string, name: string) => {
    if (!confirm(`Desconectar ${name}? Publicações agendadas para esta conta vão falhar.`)) return
    await api.disconnect(id)
    toast('info', `${name} desconectada.`)
  }

  return (
    <>
      <PageHeader title="Contas" subtitle="Conecte suas redes via API oficial para publicar e ver métricas. Para usar os sites normalmente, use o Navegador." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {networks.map((n) => {
          const list = accounts.filter((a) => a.network === n.id)
          const configured = settings.configuredNetworks.includes(n.id)
          return (
            <Card key={n.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <NetworkIcon network={n.id} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{n.name}</p>
                    {list.length ? <Badge tone="green">{list.length} conectada(s)</Badge> : configured ? <Badge tone="blue">pronto</Badge> : <Badge>não configurado</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{n.capabilities.note ?? 'Publicação de texto, imagens e links.'}</p>
                </div>
              </div>

              {list.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {list.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 rounded-xl bg-panel-2 p-2.5">
                      <AccountAvatar name={a.name} url={a.avatarUrl} network={a.network} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="truncate text-[11px] text-muted">desde {fmtDate(a.connectedAt, { dateStyle: 'short' })}</p>
                      </div>
                      <Button size="sm" variant="ghost" title="Abrir no navegador" onClick={() => navigate('browser', { url: a.profileUrl ?? n.siteUrl })}>
                        <Globe className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Desconectar" onClick={() => disconnect(a.id, a.name)}>
                        <Unplug className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto flex gap-2 pt-4">
                <Button variant="primary" className="flex-1" loading={connecting === n.id} icon={<Plug className="size-4" />} onClick={() => connect(n)}>
                  {list.length ? 'Adicionar outra' : 'Conectar'}
                </Button>
                <Button title="Credenciais do app" onClick={() => setSetupFor(n)}>
                  <KeyRound className="size-4" />
                </Button>
                <Button title="Abrir site" onClick={() => navigate('browser', { url: n.siteUrl })}>
                  <Globe className="size-4" />
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
      {setupFor && <SetupModal network={setupFor} onClose={() => setSetupFor(undefined)} />}
    </>
  )
}
