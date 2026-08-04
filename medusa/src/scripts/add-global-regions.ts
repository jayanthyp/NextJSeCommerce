import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateEntityId, Modules } from "@medusajs/framework/utils";
import {
  createRegionsWorkflow,
  createShippingOptionsWorkflow,
  createTaxRegionsWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * Adds regions for the world's ~20 largest economies by nominal GDP, each
 * with its own currency, so the storefront's existing region-switcher
 * (country-select -> updateRegion() -> cart.region_id) has real currencies
 * to switch between instead of just the one seeded "Europe"/EUR region.
 *
 * Deliberately NOT part of seed.ts: this runs against the already-seeded
 * production database, so it has to be additive and idempotent (safe to
 * re-run), never a destructive reseed. Every workflow call below checks
 * for existing state first. Every module-service call and query.graph
 * field used here was verified against the actual running backend before
 * this ran for real (see PR discussion / session notes) rather than
 * assumed from framework docs — Medusa v2's exact relation names
 * (`price_set.id` as a direct nested field, `relations: ["countries"]`,
 * `relations: ["supported_currencies"]`) aren't all obvious from the
 * public API surface.
 *
 * Two judgment calls, on record here:
 *   - Russia is excluded (sanctions/compliance complexity most payment
 *     providers can't support) and Poland substituted as the next-ranked
 *     economy.
 *   - The UK is moved OUT of the "Europe"/EUR region into its own GBP
 *     region — it was seeded there originally, but the UK uses GBP, not
 *     EUR, which directly contradicted the goal of this change.
 *
 * Same-currency countries share one region (matching how the existing
 * "Europe" region already groups 7 countries under EUR) rather than
 * creating redundant single-country regions for the Eurozone members.
 *
 * Prices below are illustrative/approximate — rough order-of-magnitude
 * conversions from the existing EUR 10 / USD 15 demo prices, NOT live FX
 * rates. Treat them as placeholders to adjust via Admin, not real pricing.
 */

type CurrencyRegion = {
  regionName: string;
  currencyCode: string;
  countries: string[];
  /** Amount for a "10 EUR-equivalent" item, in this currency's own unit
   * convention (whole yen/won for zero-decimal currencies, otherwise the
   * same major-unit convention the existing EUR/USD prices already use). */
  baseAmount: number;
  /** Amount for a "15 EUR-equivalent" item (the second price tier already
   * used across every seeded product variant). */
  highAmount: number;
  /** Flat shipping price in this currency. */
  shippingAmount: number;
};

const NEW_CURRENCY_REGIONS: CurrencyRegion[] = [
  { regionName: "United Kingdom", currencyCode: "gbp", countries: ["gb"], baseAmount: 9, highAmount: 13, shippingAmount: 9 },
  { regionName: "United States", currencyCode: "usd", countries: ["us"], baseAmount: 10, highAmount: 15, shippingAmount: 10 },
  { regionName: "China", currencyCode: "cny", countries: ["cn"], baseAmount: 77, highAmount: 115, shippingAmount: 77 },
  { regionName: "Japan", currencyCode: "jpy", countries: ["jp"], baseAmount: 1600, highAmount: 2400, shippingAmount: 1600 },
  { regionName: "India", currencyCode: "inr", countries: ["in"], baseAmount: 900, highAmount: 1350, shippingAmount: 900 },
  { regionName: "Canada", currencyCode: "cad", countries: ["ca"], baseAmount: 14, highAmount: 21, shippingAmount: 14 },
  { regionName: "Brazil", currencyCode: "brl", countries: ["br"], baseAmount: 54, highAmount: 81, shippingAmount: 54 },
  { regionName: "South Korea", currencyCode: "krw", countries: ["kr"], baseAmount: 13500, highAmount: 20000, shippingAmount: 13500 },
  { regionName: "Australia", currencyCode: "aud", countries: ["au"], baseAmount: 16, highAmount: 24, shippingAmount: 16 },
  { regionName: "Mexico", currencyCode: "mxn", countries: ["mx"], baseAmount: 180, highAmount: 270, shippingAmount: 180 },
  { regionName: "Indonesia", currencyCode: "idr", countries: ["id"], baseAmount: 170000, highAmount: 255000, shippingAmount: 170000 },
  { regionName: "Saudi Arabia", currencyCode: "sar", countries: ["sa"], baseAmount: 38, highAmount: 57, shippingAmount: 38 },
  { regionName: "Turkey", currencyCode: "try", countries: ["tr"], baseAmount: 340, highAmount: 510, shippingAmount: 340 },
  { regionName: "Switzerland", currencyCode: "chf", countries: ["ch"], baseAmount: 10, highAmount: 15, shippingAmount: 10 },
  { regionName: "Poland", currencyCode: "pln", countries: ["pl"], baseAmount: 43, highAmount: 65, shippingAmount: 43 },
];

// Netherlands joins the existing Europe/EUR region (it wasn't in the
// original 7-country seed list). The UK is handled separately above since
// it's leaving that region, not joining a new one.
const EUROPE_ADDITIONAL_COUNTRIES = ["nl"];

export default async function addGlobalRegions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const regionModuleService = container.resolve(Modules.REGION);
  const storeModuleService = container.resolve(Modules.STORE);
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);

  // --- 0. Fetch existing state we need to extend rather than recreate ------

  const [store] = await storeModuleService.listStores(
    {},
    { relations: ["supported_currencies"] }
  );
  const existingRegions = await regionModuleService.listRegions(
    {},
    { relations: ["countries"] }
  );
  const europeRegion = existingRegions.find((r) => r.name === "Europe");
  if (!europeRegion) {
    throw new Error('Expected an existing "Europe" region from seed.ts — run that first.');
  }

  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  const shippingProfile = shippingProfiles[0];
  if (!shippingProfile) {
    throw new Error("Expected an existing default shipping profile from seed.ts.");
  }

  const fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets(
    {},
    { relations: ["service_zones"] }
  );
  const fulfillmentSet = fulfillmentSets[0];
  if (!fulfillmentSet) {
    throw new Error("Expected an existing fulfillment set from seed.ts.");
  }

  // --- 1. Move the UK out of Europe/EUR into its own GBP region ------------

  if (europeRegion.countries?.some((c) => c.iso_2 === "gb")) {
    logger.info("Moving United Kingdom out of the Europe/EUR region...");
    const remainingCountries = europeRegion.countries
      .filter((c) => c.iso_2 !== "gb")
      .map((c) => c.iso_2!);
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: europeRegion.id },
        update: { countries: remainingCountries },
      },
    });
  }

  // --- 2. Add the Netherlands to the existing Europe/EUR region ------------

  const currentEuropeCountries = (europeRegion.countries ?? [])
    .map((c) => c.iso_2!)
    .filter((c) => c !== "gb");
  const missingEuropeCountries = EUROPE_ADDITIONAL_COUNTRIES.filter(
    (c) => !currentEuropeCountries.includes(c)
  );
  if (missingEuropeCountries.length) {
    logger.info(`Adding ${missingEuropeCountries.join(", ")} to the Europe/EUR region...`);
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: europeRegion.id },
        update: { countries: [...currentEuropeCountries, ...missingEuropeCountries] },
      },
    });
  }

  // --- 3. Create tax regions for every new country --------------------------

  const allNewCountries = NEW_CURRENCY_REGIONS.flatMap((r) => r.countries);
  const existingTaxRegions = await container
    .resolve(Modules.TAX)
    .listTaxRegions({ country_code: allNewCountries });
  const existingTaxCountries = new Set(existingTaxRegions.map((r) => r.country_code));
  const countriesNeedingTaxRegions = allNewCountries.filter(
    (c) => !existingTaxCountries.has(c)
  );

  if (countriesNeedingTaxRegions.length) {
    logger.info(`Seeding tax regions for ${countriesNeedingTaxRegions.length} new countries...`);
    await createTaxRegionsWorkflow(container).run({
      input: countriesNeedingTaxRegions.map((country_code) => ({
        country_code,
        provider_id: "tp_system",
      })),
    });
  }

  // --- 4. One fulfillment service zone per new region, on the existing ------
  //        fulfillment set (already linked to the single global warehouse
  //        from seed.ts — adding a zone here doesn't need a new location
  //        link, the set's existing link covers every zone on it).

  const existingZoneNames = new Set((fulfillmentSet.service_zones ?? []).map((z) => z.name));

  for (const region of NEW_CURRENCY_REGIONS) {
    if (existingZoneNames.has(region.regionName)) {
      continue; // already set up on a previous run
    }
    logger.info(
      `Creating fulfillment zone + shipping options for ${region.regionName} (${region.currencyCode.toUpperCase()})...`
    );

    const zone = await fulfillmentModuleService.createServiceZones({
      fulfillment_set_id: fulfillmentSet.id,
      name: region.regionName,
      geo_zones: region.countries.map((country_code) => ({
        country_code,
        type: "country" as const,
      })),
    });

    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Standard Shipping",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: zone.id,
          shipping_profile_id: shippingProfile.id,
          type: { label: "Standard", description: "Ship in 2-3 days.", code: "standard" },
          prices: [{ currency_code: region.currencyCode, amount: region.shippingAmount }],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
        {
          name: "Express Shipping",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: zone.id,
          shipping_profile_id: shippingProfile.id,
          type: { label: "Express", description: "Ship in 24 hours.", code: "express" },
          prices: [{ currency_code: region.currencyCode, amount: region.shippingAmount }],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    });
  }

  // --- 5. Create the new currency regions ------------------------------------

  const existingCurrencyRegionNames = new Set(existingRegions.map((r) => r.name));
  const regionsToCreate = NEW_CURRENCY_REGIONS.filter(
    (r) => !existingCurrencyRegionNames.has(r.regionName)
  );

  if (regionsToCreate.length) {
    logger.info(`Creating ${regionsToCreate.length} new regions...`);
    await createRegionsWorkflow(container).run({
      input: {
        regions: regionsToCreate.map((r) => ({
          name: r.regionName,
          currency_code: r.currencyCode,
          countries: r.countries,
          payment_providers: ["pp_system_default"],
        })),
      },
    });
  }

  // --- 6. Add store-level support for every new currency ---------------------

  const currentSupported = new Set(
    (store.supported_currencies ?? []).map((c) => c.currency_code)
  );
  const newCurrencies = NEW_CURRENCY_REGIONS.map((r) => r.currencyCode).filter(
    (c) => !currentSupported.has(c)
  );
  if (newCurrencies.length) {
    logger.info(`Adding ${newCurrencies.length} currencies to the store's supported list...`);
    await storeModuleService.updateStores(store.id, {
      supported_currencies: [
        ...(store.supported_currencies ?? []).map((c) => ({
          currency_code: c.currency_code,
          is_default: c.is_default,
        })),
        ...newCurrencies.map((currency_code) => ({ currency_code, is_default: false })),
      ],
    });
  }

  // --- 7. Patch every existing product variant with a price in each new -----
  //        currency (a variant with no price in the active region's currency
  //        renders as unavailable/priceless on the storefront). `price_set.id`
  //        works as a direct nested field on product_variant — verified
  //        against the running backend, no separate link-entity query needed.

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "price_set.id", "prices.currency_code", "prices.amount"],
  });

  logger.info(`Patching prices for ${variants.length} product variants...`);

  // Inserted directly via Knex rather than pricingModuleService.addPrices():
  // that method's generic upsertWithReplace() path throws "column rules of
  // relation price does not exist" on this exact package + database
  // combination whenever no price.rules are given (verified against the
  // running backend — the `price` table genuinely has no `rules` column,
  // targeting rules live in the separate `price_rule` table via
  // `rules_count`, so this looks like an upstream framework bug rather than
  // anything fixable from the input shape). A direct insert matching the
  // real schema sidesteps it entirely — reasonable for a one-off data
  // migration script, not something to do in application runtime code.
  const now = new Date();
  const priceRows: Record<string, unknown>[] = [];

  for (const variant of variants) {
    // query.graph()'s return type only reflects the base ProductVariant
    // entity, not the extra `price_set`/`prices` fields requested above (a
    // dynamic query the type system can't see) — hence the cast.
    const v = variant as unknown as {
      price_set?: { id: string };
      prices?: { currency_code: string; amount: number }[];
    };
    const priceSetId = v.price_set?.id;
    if (!priceSetId) continue;

    const existingCurrencies = new Set((v.prices ?? []).map((p) => p.currency_code));
    // Every seeded variant so far follows the same EUR:10/USD:15 pattern, so
    // "does it already have a USD price of 15" is a reasonable signal for
    // which price tier (base vs. high) to mirror into the new currencies.
    const isHighTier = (v.prices ?? []).some(
      (p) => p.currency_code === "usd" && p.amount === 15
    );

    for (const r of NEW_CURRENCY_REGIONS) {
      if (existingCurrencies.has(r.currencyCode)) continue;
      const amount = isHighTier ? r.highAmount : r.baseAmount;
      priceRows.push({
        id: generateEntityId(undefined, "price"),
        price_set_id: priceSetId,
        currency_code: r.currencyCode,
        amount,
        raw_amount: JSON.stringify({ value: String(amount), precision: 20 }),
        rules_count: 0,
        created_at: now,
        updated_at: now,
      });
    }
  }

  if (priceRows.length) {
    logger.info(`Inserting ${priceRows.length} new price rows...`);
    // Chunked so a single batch statement can't get unreasonably large —
    // 1000 is well within Postgres's per-statement parameter limits for a
    // ~9-column table.
    for (let i = 0; i < priceRows.length; i += 1000) {
      await knex("price").insert(priceRows.slice(i, i + 1000));
    }
  }

  logger.info("Finished adding global regions, currencies, and pricing.");
}
