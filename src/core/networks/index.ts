import type { NetworkId, Settings } from '../types'
import { linkedinConnector } from './linkedin'
import { facebookConnector, instagramConnector } from './meta'
import { twitchConnector } from './twitch'
import type { Connector, NetworkInfo } from './types'
import { xConnector } from './x'
import { youtubeConnector } from './youtube'

export const connectors: Record<NetworkId, Connector> = {
  linkedin: linkedinConnector,
  facebook: facebookConnector,
  instagram: instagramConnector,
  youtube: youtubeConnector,
  twitch: twitchConnector,
  x: xConnector,
}

export const networkList: NetworkInfo[] = Object.values(connectors).map((c) => c.info)

export const defaultRedirectUri = (network: NetworkId, settings: Pick<Settings, 'oauthPort'>) =>
  `http://${connectors[network].info.redirectHost}:${settings.oauthPort}/callback`

export type { Connector, NetworkInfo }
