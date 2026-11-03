import type { McpServerConfig } from './types'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

/**
 * Everything the shared core needs from the host. The desktop app implements it in
 * the Electron main process; the mobile app implements it inside the Capacitor WebView.
 */
export interface Platform {
  name: 'desktop' | 'mobile'
  /** Plain JSON storage for non-sensitive data. */
  storage: {
    get<T>(key: string): Promise<T | undefined>
    set(key: string, value: unknown): Promise<void>
  }
  /** Encrypted storage for tokens and API keys. */
  secrets: {
    get(key: string): Promise<string | undefined>
    set(key: string, value: string | undefined): Promise<void>
  }
  /**
   * Opens `authUrl` in the system browser and resolves with the full redirect URL
   * once the provider sends the user back to `redirectUri`.
   */
  authorize(authUrl: string, redirectUri: string): Promise<string>
  /** Reads a local file. Only available on desktop. */
  readFile?(path: string): Promise<Uint8Array>
  notify(title: string, body: string): void
  createMcpTransport(config: McpServerConfig): Transport
}
