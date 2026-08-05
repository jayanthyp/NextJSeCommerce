"use client"

import { useState } from "react"
import { Button, Text } from "@medusajs/ui"

import { ConsentState, setConsent } from "@lib/data/consent"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

const updateGtagConsent = (granted: boolean) => {
  window.gtag?.("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
  })
}

export default function CookieConsentBanner({
  initialConsent,
}: {
  initialConsent: ConsentState
}) {
  const [visible, setVisible] = useState(initialConsent === "unset")

  const respond = async (granted: boolean) => {
    // Cookie must actually be persisted before we tell the UI (and any
    // caller, e.g. a reload) that consent has been recorded — setting
    // client state first raced ahead of the server action, so a reload
    // immediately after clicking could land before the Set-Cookie response
    // was processed and see no cookie at all.
    await setConsent(granted)
    updateGtagConsent(granted)
    setVisible(false)
  }

  if (!visible) {
    return null
  }

  return (
    <div
      className="fixed bottom-4 inset-x-4 small:inset-x-auto small:right-4 small:max-w-sm z-[1000] bg-white dark:bg-ui-bg-base border border-ui-border-base rounded-rounded shadow-lg p-5 flex flex-col gap-y-3"
      data-testid="cookie-consent-banner"
    >
      <Text className="text-ui-fg-subtle txt-small">
        We use cookies to understand how visitors use our site and improve
        your experience. You can accept or decline analytics cookies at any
        time.
      </Text>
      <div className="flex gap-x-2">
        <Button
          variant="primary"
          size="small"
          onClick={() => respond(true)}
          data-testid="cookie-consent-accept"
        >
          Accept
        </Button>
        <Button
          variant="secondary"
          size="small"
          onClick={() => respond(false)}
          data-testid="cookie-consent-reject"
        >
          Reject
        </Button>
      </div>
    </div>
  )
}
