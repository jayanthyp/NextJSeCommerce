/**
 * Fixed values tied to the official Medusa seed script
 * (medusa/src/scripts/seed.ts, run once via
 * `npx medusa exec ./src/scripts/seed.js`).
 *
 * The seed creates exactly one "Europe" region covering
 * de/dk/es/fr/gb/it/se — no "us" — and four demo products including a
 * "Medusa T-Shirt" at handle "t-shirt". If you reseed with different data,
 * update PRODUCT_HANDLE / COUNTRY_CODE here rather than in the specs.
 */
export const COUNTRY_CODE = "de"

export const PRODUCT_HANDLE = "t-shirt"

export const DELIVERY_METHOD_NAME = "Standard Shipping"

export const PAYMENT_METHOD_NAME = "Manual Payment"

export function uniqueTestCustomer() {
  const stamp = Date.now()
  return {
    firstName: "Jane",
    lastName: "Doe",
    address: "123 Test Street",
    postalCode: "10115",
    city: "Berlin",
    countryCode: COUNTRY_CODE,
    // Unique per run so repeated test runs don't collide on the same
    // customer/order history in Admin.
    email: `e2e-${stamp}@example.com`,
  }
}
