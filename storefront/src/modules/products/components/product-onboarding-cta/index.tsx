import { Button, Container, Text } from "@medusajs/ui"
import { cookies as nextCookies } from "next/headers"

async function ProductOnboardingCta() {
  // Unlike every other cookie read in this app (see src/lib/data/cookies.ts),
  // this one isn't wrapped in try/catch upstream. Product pages have
  // generateStaticParams, so Next attempts to serve them from the static
  // build cache; an unguarded dynamic API call in that path throws
  // DYNAMIC_SERVER_USAGE and 500s the whole page instead of just skipping
  // this banner, which is irrelevant outside Medusa's interactive
  // `create-medusa-app` onboarding flow anyway (this Docker deployment never
  // sets `_medusa_onboarding`).
  let isOnboarding = false
  try {
    const cookies = await nextCookies()
    isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"
  } catch {
    isOnboarding = false
  }

  if (!isOnboarding) {
    return null
  }

  return (
    <Container className="max-w-4xl h-full bg-ui-bg-subtle w-full p-8">
      <div className="flex flex-col gap-y-4 center">
        <Text className="text-ui-fg-base text-xl">
          Your demo product was successfully created! 🎉
        </Text>
        <Text className="text-ui-fg-subtle text-small-regular">
          You can now continue setting up your store in the admin.
        </Text>
        <a href="http://localhost:7001/a/orders?onboarding_step=create_order_nextjs">
          <Button className="w-full">Continue setup in admin</Button>
        </a>
      </div>
    </Container>
  )
}

export default ProductOnboardingCta
