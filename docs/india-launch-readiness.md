# India launch readiness — gap audit

Findings from a direct audit of this repo (database state, `medusa-config.ts`, storefront
components, CMS pages) against what's typically required to launch an e-commerce store in India.
Scope is identification only — no fixes are implemented here; several items already have their own
tracking issue, noted inline.

## Blocking gaps

### 1. No real payment gateway — only Medusa's manual/system provider

`medusa-config.ts` configures no payment providers, so every region (including India) falls back to
`pp_system_default`, Medusa's built-in manual/mark-as-paid provider. There is no UPI, card, netbanking,
or wallet support, which for an India launch is close to a hard blocker — UPI alone accounts for the
majority of Indian online payment volume.

Already tracked: **#7** (Razorpay integration), currently blocked pending test-mode credentials and a
decision on scope. Whatever gateway is chosen, note the RBI Payment Aggregator/Payment Gateway (PA-PG)
data-localization requirement — payment data has to be stored in India — as a vendor/config
consideration, not something this repo's code can satisfy on its own.

### 2. No Cash on Delivery (COD) option

Distinct from #1: COD is a widely-used payment method in Indian e-commerce, especially outside metro
areas, and isn't just "another card gateway" — it needs its own provider/flow (order placed
unpaid/pending, captured on delivery, different UI copy and risk handling from a real-time gateway).
Nothing in the codebase represents this today; confirmed via a search across
`storefront/src/modules/checkout` and `medusa/src` for any COD-specific provider or copy.

### 3. India's tax region has zero tax rates configured

Confirmed directly against the database:

```sql
SELECT tr.id, trr.rate, trr.name, trr.code FROM tax_region tr
LEFT JOIN tax_rate trr ON trr.tax_region_id = tr.id WHERE tr.country_code = 'in';
```

Returns one `tax_region` row (`provider_id: tp_system`) with `rate`/`name`/`code` all `NULL` — every
order to an Indian address currently computes 0% tax. GST (5/12/18/28% depending on HSN/SAC
classification, split as CGST+SGST for intra-state or IGST for inter-state) isn't configured at all.
This is a compliance gap, not just a revenue one.

### 4. No GST-compliant invoicing

No `invoice`/`GSTIN`/`HSN` references anywhere in `medusa/src` or `storefront/src` (confirmed via
repo-wide search). There's no invoice generation (PDF or otherwise) at all currently, let alone one
carrying GSTIN, HSN/SAC codes, or a CGST/SGST/IGST breakdown — expected for Indian retail and required
for B2B customers who need GST-compliant invoices to claim input tax credit.

## Non-blocking but expected for launch

### 5. Missing legally-required policy pages

India's Consumer Protection (E-Commerce) Rules, 2020 require specific disclosures (return/refund/
cancellation policy, terms of usage, privacy policy, and grievance-officer contact details). Current
CMS pages (`page` table): only `returns-policy` and `contact-us`. Missing: Privacy Policy, Terms &
Conditions/Terms of Use, Shipping/Delivery Policy, and an explicit Grievance Officer
name/email/phone (rule 5(1) requires the grievance officer be named, not just a generic contact form).

No code change needed to add these — the footer (`storefront/src/modules/layout/templates/footer`)
already links every CMS page dynamically via `/pages/${slug}`, so this is purely a content-creation
task via Admin, not a development one.

## Confirmed already in place (not gaps)

- **INR currency + India region**: exist (`add-global-regions.ts`), verified in the database.
- **Indian states**: fully populated in `storefront/src/lib/data/states.ts` (all states/UTs, used by
  the checkout address form's state dropdown).
- **India shipping**: Standard/Express flat-rate options exist for the India service zone.
- **Cookie/consent banner**: exists and isn't geo-gated to the EU, so it also covers DPDP Act 2023
  (India's data-protection law) consent expectations at a basic level — not audited in depth for
  DPDP-specific requirements beyond "a consent mechanism exists."

## Suggested priority order

1. Payment: resolve #7 (gateway) and scope a COD option (#2 above) — together these are the actual
   go/no-go blocker.
2. GST tax rates (#3) — needed before any real order can be legally invoiced.
3. GST-compliant invoicing (#4) — depends on #3 being resolved first.
4. Policy pages (#5) — content task, can happen in parallel with the above, no dependency.
