"use client"

import { useRef, useState } from "react"
import { clx } from "@medusajs/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Divider from "@modules/common/components/divider"
import ChevronDown from "@modules/common/icons/chevron-down"
import { GIFT_NAV } from "@lib/constants"

// Delay before closing on mouse-out so moving the cursor from the trigger
// to the panel (or between triggers) doesn't flicker the menu shut.
const CLOSE_DELAY_MS = 150

const GiftNav = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const openMenu = (index: number) => {
    clearCloseTimer()
    setOpenIndex(index)
  }

  const scheduleClose = () => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpenIndex(null), CLOSE_DELAY_MS)
  }

  const closeMenu = () => {
    clearCloseTimer()
    setOpenIndex(null)
  }

  return (
    <div className="hidden small:flex items-center gap-x-6 h-full">
      {GIFT_NAV.map((category, index) => {
        const isOpen = openIndex === index
        const lastItem = category.items[category.items.length - 1]
        const leadingItems = category.items.slice(0, -1)

        return (
          <div
            key={category.label}
            className="relative h-full flex items-center"
            onMouseEnter={() => openMenu(index)}
            onMouseLeave={scheduleClose}
          >
            <button
              type="button"
              className="flex items-center gap-x-1 hover:text-ui-fg-base txt-compact-small-plus text-ui-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-fg-interactive focus-visible:ring-offset-2"
              aria-expanded={isOpen}
              aria-haspopup="true"
              data-testid={`gift-nav-trigger-${index}`}
              onFocus={() => openMenu(index)}
              onBlur={scheduleClose}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeMenu()
                }
              }}
            >
              {category.label}
              <ChevronDown
                className={clx(
                  "transition-transform duration-150",
                  isOpen ? "rotate-180" : ""
                )}
              />
            </button>

            {isOpen && (
              <div
                className="absolute top-full left-0 mt-2 w-max min-w-40 p-4 bg-white dark:bg-ui-bg-base border border-ui-border-base rounded-rounded shadow-lg z-[60]"
                data-testid={`gift-nav-panel-${index}`}
                onMouseEnter={() => openMenu(index)}
                onMouseLeave={scheduleClose}
              >
                <div className="flex flex-col gap-y-1">
                  {leadingItems.map((item) => (
                    <LocalizedClientLink
                      key={item.href}
                      href={item.href}
                      className="block px-3 py-2 rounded-rounded hover:bg-ui-bg-base-hover txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                      onClick={closeMenu}
                    >
                      {item.label}
                    </LocalizedClientLink>
                  ))}
                </div>
                <Divider />
                <LocalizedClientLink
                  href={lastItem.href}
                  className="block px-3 py-2 rounded-rounded hover:bg-ui-bg-base-hover txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                  onClick={closeMenu}
                >
                  {lastItem.label}
                </LocalizedClientLink>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default GiftNav
