/**
 * Fixed values tied to the official Medusa seed script
 * (medusa/src/scripts/seed.ts, run once via
 * `npx medusa exec ./src/scripts/seed.js`) plus later data-migration
 * scripts run against this environment (see medusa/src/scripts/).
 *
 * COUNTRY_CODE is "au" rather than the original seed's "de" (Germany)
 * because issue #15 restricted the storefront's country-select controls to
 * only India and Australia -- "de" is no longer a selectable option in the
 * checkout address form's country dropdown, so a test that tried to select
 * it would fail outright. Australia over India specifically to avoid
 * interacting with India's GST-inclusive-pricing behavior (issue #8),
 * which is unrelated to what these checkout specs are testing.
 *
 * PRODUCT_HANDLE ties to one of four demo products seeded with a "Medusa
 * T-Shirt" title. If you reseed with different data, update
 * PRODUCT_HANDLE / COUNTRY_CODE here rather than in the specs.
 */
export const COUNTRY_CODE = "au"

/** Display name matching COUNTRY_CODE, for specs asserting on the
 * region-switcher's visible/aria-label text rather than the raw code. */
export const COUNTRY_NAME = "Australia"

export const PRODUCT_HANDLE = "t-shirt"

export const DELIVERY_METHOD_NAME = "Standard Shipping"

export const PAYMENT_METHOD_NAME = "Manual Payment"

export function uniqueTestCustomer() {
  const stamp = Date.now()
  return {
    firstName: "Jane",
    lastName: "Doe",
    address: "123 Test Street",
    postalCode: "2000",
    city: "Sydney",
    countryCode: COUNTRY_CODE,
    province: "New South Wales",
    // Unique per run so repeated test runs don't collide on the same
    // customer/order history in Admin.
    email: `e2e-${stamp}@example.com`,
  }
}

/** For specs that register+sign in a customer account (wishlist, reviews)
 * rather than running the full checkout flow. */
export function uniqueTestAccount() {
  const stamp = Date.now()
  return {
    firstName: "Ada",
    lastName: "Tester",
    email: `e2e-account-${stamp}@example.com`,
    password: "SuperSecret123!",
  }
}
