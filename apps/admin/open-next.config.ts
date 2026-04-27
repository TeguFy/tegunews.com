import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig({
  // Admin is auth-gated SSR — no ISR cache needed
})
