"use client"

import { useActionState } from "react"
import { Button, Input, Text } from "@medusajs/ui"

import { subscribeToNewsletter } from "@lib/data/marketing-consent"

const NewsletterSignup = () => {
  const submit = async (_prevState: unknown, formData: FormData) => {
    const email = (formData.get("email") as string) || ""
    return subscribeToNewsletter(email)
  }

  const [state, formAction, isPending] = useActionState(submit, null)

  if (state?.success) {
    return (
      <div data-testid="newsletter-signup-success">
        <Text className="txt-small-plus txt-ui-fg-base">
          Subscribe for offers
        </Text>
        <Text className="text-ui-fg-subtle txt-small mt-2">
          {state.alreadySubscribed
            ? "You're already subscribed — thanks for sticking around!"
            : "Thanks for subscribing! Keep an eye on your inbox."}
        </Text>
      </div>
    )
  }

  return (
    <div>
      <Text className="txt-small-plus txt-ui-fg-base mb-2">
        Subscribe for offers
      </Text>
      <Text className="text-ui-fg-subtle txt-small mb-3">
        Get special offers, free giveaways, and once-in-a-lifetime deals.
      </Text>
      <form
        action={formAction}
        className="flex flex-col gap-y-2"
        data-testid="newsletter-signup-form"
      >
        <Input
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          data-testid="newsletter-email-input"
        />
        {state && !state.success && (
          <Text
            className="text-ui-fg-error txt-small"
            data-testid="newsletter-signup-error"
          >
            {state.message}
          </Text>
        )}
        <Button
          type="submit"
          isLoading={isPending}
          className="w-fit"
          data-testid="newsletter-signup-submit"
        >
          Subscribe
        </Button>
      </form>
    </div>
  )
}

export default NewsletterSignup
