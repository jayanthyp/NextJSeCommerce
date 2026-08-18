import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Self-healing backstop for the MeiliSearch index. @rokmohar/medusa-plugin-
 * meilisearch's own subscribers already keep the index in sync in real time
 * on product.created/product.updated -- this job exists only to catch drift
 * (e.g. a manual DB edit, a plugin hiccup) rather than to be the primary
 * sync path, so it runs daily (not every 30 minutes, as an earlier draft
 * had it) -- a full reindex that often is unnecessary load for a backstop
 * and risks competing with the storefront for CPU/memory on the 4 vCPU /
 * 8GB VPS.
 *
 * Mirrors medusa/src/scripts/reindex-search.ts's typed
 * container.resolve(Modules.EVENT_BUS) + eventBus.emit({ name, data })
 * call -- no `as any` needed, this is the actual typed shape.
 */
export default async function reindexSearch(container: MedusaContainer) {
  const logger = container.resolve("logger")
  const eventBus = container.resolve(Modules.EVENT_BUS)

  logger.info("[reindex-search job] Emitting meilisearch.sync to trigger a full product reindex...")
  await eventBus.emit({ name: "meilisearch.sync", data: {} })
}

export const config = {
  name: "reindex-search",
  schedule: "0 3 * * *",
}
