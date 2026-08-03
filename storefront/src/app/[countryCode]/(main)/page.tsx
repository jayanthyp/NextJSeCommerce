import { redirect } from "next/navigation"

// The landing page IS the store: rather than duplicate StoreTemplate's
// product-grid rendering here, this route just redirects to /store. That
// keeps a single source of truth for "what does the product listing look
// like" and — importantly — means every path that lands here (the bare "/"
// redirect in middleware.ts, and the nav/footer logo links, which resolve to
// this exact route via LocalizedClientLink) consistently reaches the real
// catalog instead of only some of them.
export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  redirect(`/${countryCode}/store`)
}
