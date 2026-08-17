import { MedusaContainer } from "@medusajs/framework/types"

export default async function reindexSearch(container: MedusaContainer) {
  const eventBusService = container.resolve("event_bus")

  await eventBusService.emit("meilisearch.sync", {})
}

export const config = {
  name: "reindex-search",
  schedule: "*/30 * * * *",
}