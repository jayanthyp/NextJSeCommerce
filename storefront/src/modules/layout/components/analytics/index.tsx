"use client"

import Script from "next/script"

import { ConsentState } from "@lib/data/consent"

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

const GA4_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID

// Google Consent Mode v2: gtag.js must load unconditionally for consent
// signals to work at all, but no analytics data is actually collected until
// the cookie-consent banner grants it — the GDPR-correct approach, not
// "don't load the script until consent" (which breaks Consent Mode).
export default function Analytics({ consent }: { consent: ConsentState }) {
  if (!GA4_ID) {
    return null
  }

  const granted = consent === "granted"

  return (
    <>
      <Script
        id="ga4-consent-default"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('consent', 'default', {
              'analytics_storage': '${granted ? "granted" : "denied"}',
              'ad_storage': 'denied',
              'ad_user_data': 'denied',
              'ad_personalization': 'denied'
            });
          `,
        }}
      />
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga4-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `gtag('js', new Date()); gtag('config', '${GA4_ID}');`,
        }}
      />
    </>
  )
}
