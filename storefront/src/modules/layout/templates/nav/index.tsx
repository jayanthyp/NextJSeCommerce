import { Suspense } from "react"

import { listRegions } from "@lib/data/regions"
import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import CountrySelect from "@modules/layout/components/country-select"
import SearchBar from "@modules/layout/components/search-bar"
import SideMenu from "@modules/layout/components/side-menu"
import ThemeToggle from "@modules/layout/components/theme-toggle"
import { SITE_NAME } from "@lib/constants"

export default async function Nav() {
  const [regions, locales, currentLocale] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
  ])

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-16 mx-auto border-b duration-200 bg-white dark:bg-ui-bg-base border-ui-border-base">
        <nav className="content-container txt-xsmall-plus text-ui-fg-subtle flex items-center justify-between w-full h-full text-small-regular">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full">
              <SideMenu locales={locales} currentLocale={currentLocale} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="txt-compact-xlarge-plus hover:text-ui-fg-base uppercase"
              data-testid="nav-store-link"
            >
              {SITE_NAME}
            </LocalizedClientLink>
          </div>

          <div className="flex items-center h-full flex-1 basis-0 justify-end">
            {/* Below `small`, the four utility items pack into a compact
                2x2 grid instead of wrapping/overflowing a single row --
                at `small` and up this reverts to the original inline row. */}
            <div
              data-testid="nav-utilities"
              className="grid grid-cols-2 grid-rows-2 gap-x-3 gap-y-1 place-items-center small:flex small:grid-cols-none small:grid-rows-none small:gap-x-6 small:gap-y-0 small:items-center h-full"
            >
              <div className="flex items-center h-full">
                <SearchBar />
              </div>
              <div className="flex items-center h-full">
                <ThemeToggle />
              </div>
              {regions && (
                <div className="flex items-center h-full">
                  <CountrySelect regions={regions} />
                </div>
              )}
              <Suspense
                fallback={
                  <LocalizedClientLink
                    className="hover:text-ui-fg-base flex gap-2"
                    href="/cart"
                    data-testid="nav-cart-link"
                  >
                    Cart (0)
                  </LocalizedClientLink>
                }
              >
                <CartButton />
              </Suspense>
            </div>
            <div className="hidden small:flex items-center gap-x-6 h-full ml-6">
              <LocalizedClientLink
                className="hover:text-ui-fg-base"
                href="/account"
                data-testid="nav-account-link"
              >
                Account
              </LocalizedClientLink>
            </div>
          </div>
        </nav>
      </header>
    </div>
  )
}
