import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createDb } from '@teguns/db'

export async function getDb() {
  const { env } = await getCloudflareContext()
  return createDb(env.DB)
}
