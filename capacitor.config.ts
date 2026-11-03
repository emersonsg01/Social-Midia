import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.socialhub.app',
  appName: 'Social Hub',
  webDir: 'dist',
  // Routes fetch() through native HTTP so the social/AI APIs work without CORS.
  plugins: { CapacitorHttp: { enabled: true } },
}

export default config
