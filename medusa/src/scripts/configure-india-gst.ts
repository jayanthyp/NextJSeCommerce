import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Makes India's prices GST-inclusive rather than itemized as a separate line
 * at checkout (see issue #8 discussion) — marks the India region
 * tax-inclusive and adds a default GST rate to price against.
 *
 * Deliberately NOT part of seed.ts, same reasoning as add-global-regions.ts:
 * this runs against the already-seeded database, so it has to be additive
 * and idempotent, never a destructive reseed. Requires add-global-regions.ts
 * to have already created the India region/tax region.
 *
 * The 18% rate is the standard GST slab for general goods — real GST varies
 * by HSN/SAC product classification (0/5/12/18/28%), which this repo has no
 * per-product data for yet. Treat this as a reasonable default to adjust via
 * Admin once real product categorization exists, not a finished tax setup.
 */
const INDIA_GST_RATE = 18;

export default async function configureIndiaGst({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const regionModuleService = container.resolve(Modules.REGION);
  const taxModuleService = container.resolve(Modules.TAX);

  const existingRegions = await regionModuleService.listRegions({});
  const indiaRegion = existingRegions.find((r) => r.name === "India");
  if (!indiaRegion) {
    throw new Error('Expected an existing "India" region — run add-global-regions.ts first.');
  }

  // is_tax_inclusive isn't exposed on RegionDTO (it's stored via a linked
  // PricePreference, not a literal column), so there's nothing to read
  // before writing here -- setting it is naturally idempotent regardless of
  // current state, so just always set it.
  logger.info("Marking the India region as tax-inclusive...");
  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: indiaRegion.id },
      update: { is_tax_inclusive: true },
    },
  });

  const [indiaTaxRegion] = await taxModuleService.listTaxRegions({ country_code: "in" });
  if (!indiaTaxRegion) {
    throw new Error("Expected an existing India tax region — run add-global-regions.ts first.");
  }

  const existingRates = await taxModuleService.listTaxRates({
    tax_region_id: indiaTaxRegion.id,
  });
  if (!existingRates.length) {
    logger.info(`Creating a default ${INDIA_GST_RATE}% GST rate for India...`);
    await taxModuleService.createTaxRates([
      {
        tax_region_id: indiaTaxRegion.id,
        name: "GST",
        code: "gst",
        rate: INDIA_GST_RATE,
      },
    ]);
  }

  logger.info("Finished configuring India GST.");
}
