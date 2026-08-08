"use client"

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react"
import { ArrowRightMini, BarsThree, XMark } from "@medusajs/icons"
import { Text, clx, useToggleState } from "@medusajs/ui"
import { useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import LanguageSelect from "../language-select"
import { Locale } from "@lib/data/locales"
import { SITE_NAME } from "@lib/constants"

const SideMenuItems = {
  Home: "/",
  Store: "/store",
  Account: "/account",
  Cart: "/cart",
}

type SideMenuProps = {
  locales: Locale[] | null
  currentLocale: string | null
}

/**
 * Partial off-canvas drawer, not a full-screen takeover (see issue #21) --
 * built on Headless UI's Dialog rather than Popover specifically because
 * Dialog provides focus trapping, Escape-to-close, and the role="dialog"
 * aria-modal="true" pairing natively. Popover (the previous implementation)
 * doesn't -- those would otherwise have to be hand-rolled.
 */
const SideMenu = ({ locales, currentLocale }: SideMenuProps) => {
  const [open, setOpen] = useState(false)
  const languageToggleState = useToggleState()
  const close = () => setOpen(false)

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <button
          type="button"
          data-testid="nav-menu-button"
          aria-label="Menu"
          onClick={() => setOpen(true)}
          className="relative h-full flex items-center transition-all ease-out duration-200 focus:outline-none hover:text-ui-fg-base"
        >
          {/* Hamburger icon below the `small` breakpoint (viewports most
              likely to overflow with the full-word button); the familiar
              text label is kept at `small` and up. */}
          <span className="small:hidden">
            <BarsThree />
          </span>
          <span className="hidden small:inline">Menu</span>
        </button>
      </div>

      <Dialog open={open} onClose={close} className="relative z-[51]">
        <DialogBackdrop
          transition
          data-testid="side-menu-backdrop"
          className="fixed inset-0 bg-black/40 transition-opacity duration-150 data-[closed]:opacity-0"
        />

        {/* Covers a limited width -- 80% on narrow phones, capped at 360px
            on larger ones -- rather than the full viewport. */}
        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            data-testid="nav-menu-popup"
            className="flex flex-col h-full w-[80%] max-w-[360px] bg-[rgba(3,7,18,0.9)] backdrop-blur-2xl text-sm text-ui-fg-on-color p-6 justify-between transition duration-150 ease-out data-[closed]:-translate-x-full"
          >
            <DialogTitle className="sr-only">Site navigation</DialogTitle>
            <div className="flex justify-end" id="xmark">
              <button
                data-testid="close-menu-button"
                aria-label="Close menu"
                onClick={close}
              >
                <XMark />
              </button>
            </div>
            <ul className="flex flex-col gap-6 items-start justify-start">
              {Object.entries(SideMenuItems).map(([name, href]) => {
                return (
                  <li key={name}>
                    <LocalizedClientLink
                      href={href}
                      className="text-3xl leading-10 hover:text-ui-fg-disabled"
                      onClick={close}
                      data-testid={`${name.toLowerCase()}-link`}
                    >
                      {name}
                    </LocalizedClientLink>
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-col gap-y-6">
              {!!locales?.length && (
                <div
                  className="flex justify-between"
                  onMouseEnter={languageToggleState.open}
                  onMouseLeave={languageToggleState.close}
                >
                  <LanguageSelect
                    toggleState={languageToggleState}
                    locales={locales}
                    currentLocale={currentLocale}
                  />
                  <ArrowRightMini
                    className={clx(
                      "transition-transform duration-150",
                      languageToggleState.state ? "-rotate-90" : ""
                    )}
                  />
                </div>
              )}
              <Text className="flex justify-between txt-compact-small">
                © {new Date().getFullYear()} {SITE_NAME}. All rights
                reserved.
              </Text>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  )
}

export default SideMenu
