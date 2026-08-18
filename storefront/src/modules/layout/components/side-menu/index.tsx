"use client"

import { Popover, PopoverPanel, Transition } from "@headlessui/react"
import { ArrowRightMini, BarsThree, XMark } from "@medusajs/icons"
import { Text, clx, useToggleState } from "@medusajs/ui"
import { Fragment, useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import LanguageSelect from "../language-select"
import { Locale } from "@lib/data/locales"
import { GIFT_NAV, SITE_NAME } from "@lib/constants"

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

const SideMenu = ({ locales, currentLocale }: SideMenuProps) => {
  const languageToggleState = useToggleState()
  const [openGiftSections, setOpenGiftSections] = useState<number[]>([])

  const toggleGiftSection = (index: number) => {
    setOpenGiftSections((current) =>
      current.includes(index)
        ? current.filter((openIndex) => openIndex !== index)
        : [...current, index]
    )
  }

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <div className="relative flex h-full">
                <Popover.Button
                  data-testid="nav-menu-button"
                  aria-label="Menu"
                  className="relative h-full flex items-center transition-all ease-out duration-200 focus:outline-none hover:text-ui-fg-base"
                >
                  {/* Hamburger icon below the `small` breakpoint (viewports
                      most likely to overflow with the full-word button);
                      the familiar text label is kept at `small` and up. */}
                  <span className="small:hidden">
                    <BarsThree />
                  </span>
                  <span className="hidden small:inline">Menu</span>
                </Popover.Button>
              </div>

              {open && (
                <div
                  className="fixed inset-0 z-[50] bg-black/0 pointer-events-auto"
                  onClick={close}
                  data-testid="side-menu-backdrop"
                />
              )}

              <Transition
                show={open}
                as={Fragment}
                enter="transition ease-out duration-150"
                enterFrom="opacity-0"
                enterTo="opacity-100 backdrop-blur-2xl"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 backdrop-blur-2xl"
                leaveTo="opacity-0"
              >
                <PopoverPanel className="flex flex-col absolute w-full pr-4 sm:pr-0 sm:w-1/3 2xl:w-1/4 sm:min-w-min h-[calc(100vh-1rem)] z-[51] inset-x-0 text-sm text-ui-fg-on-color m-2 backdrop-blur-2xl">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex flex-col h-full bg-[rgba(3,7,18,0.5)] rounded-rounded justify-between p-6 overflow-y-auto"
                  >
                    <div className="flex justify-end" id="xmark">
                      <button data-testid="close-menu-button" onClick={close}>
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
                    <ul className="flex flex-col gap-y-4 items-start justify-start small:hidden">
                      {GIFT_NAV.map((category, index) => {
                        const isOpen = openGiftSections.includes(index)
                        return (
                          <li key={category.label} className="w-full">
                            <button
                              type="button"
                              className="flex items-center justify-between w-full text-3xl leading-10 hover:text-ui-fg-disabled"
                              aria-expanded={isOpen}
                              data-testid={`gift-nav-mobile-toggle-${index}`}
                              onClick={() => toggleGiftSection(index)}
                            >
                              {category.label}
                              <ArrowRightMini
                                className={clx(
                                  "transition-transform duration-150",
                                  isOpen ? "-rotate-90" : ""
                                )}
                              />
                            </button>
                            {isOpen && (
                              <div className="flex flex-col gap-y-2 pl-4 pt-2">
                                {category.items.map((item) => (
                                  <LocalizedClientLink
                                    key={item.href}
                                    href={item.href}
                                    className="text-xl leading-8 hover:text-ui-fg-disabled"
                                    onClick={close}
                                  >
                                    {item.label}
                                  </LocalizedClientLink>
                                ))}
                              </div>
                            )}
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
                  </div>
                </PopoverPanel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}

export default SideMenu
