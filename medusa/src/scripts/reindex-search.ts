import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * @rokmohar/medusa-plugin-meilisearch only keeps the MeiliSearch index in
 * sync going forward, via subscribers on product.created/product.updated
 * (see its meilisearch-product-upsert subscriber) -- it never backfills
 * catalog data that already existed before the plugin/index was set up.
 * The plugin's own admin route (POST /admin/meilisearch/sync) triggers a
 * full reindex by emitting this exact event; this script does the same
 * thing without needing an authenticated HTTP call.
 *
 * Run with: npx medusa exec ./src/scripts/reindex-search.ts
 */
export default async function reindexSearch({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const eventBus = container.resolve(Modules.EVENT_BUS);

  // Destructive pipeline automation must default to dry-run until a human
  // reviews the output and explicitly opts in (see docs/pipeline-safety.md).
  const dryRun = process.env.DRY_RUN !== "false";

  if (dryRun) {
    logger.info(
      "[DRY-RUN] WOULD emit meilisearch.sync to trigger a full product reindex. " +
        "Set DRY_RUN=false to run for real."
    );
    return;
  }

  logger.info("Emitting meilisearch.sync to trigger a full product reindex...");
  await eventBus.emit({ name: "meilisearch.sync", data: {} });
  logger.info("meilisearch.sync emitted. Check the MeiliSearch index shortly to confirm documents appear.");
}
