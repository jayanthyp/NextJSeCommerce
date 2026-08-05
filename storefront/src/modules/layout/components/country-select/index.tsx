"use client"

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react"
import { useEffect, useMemo, useState } from "react"
import ReactCountryFlag from "react-country-flag"

import { useParams, usePathname } from "next/navigation"
import { updateRegion } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"

type CountryOption = {
  country: string
  region: string
  label: string
}

type CountrySelectProps = {
  regions: HttpTypes.StoreRegion[]
}

const CountrySelect = ({ regions }: CountrySelectProps) => {
  const [current, setCurrent] = useState<
    | { country: string | undefined; region: string; label: string | undefined }
    | undefined
  >(undefined)

  const { countryCode } = useParams()
  const currentPath = usePathname().split(`/${countryCode}`)[1]

  const options = useMemo(() => {
    return regions
      ?.map((r) => {
        return r.countries?.map((c) => ({
          country: c.iso_2,
          region: r.id,
          label: c.display_name,
        }))
      })
      .flat()
      .sort((a, b) => (a?.label ?? "").localeCompare(b?.label ?? ""))
  }, [regions])

  useEffect(() => {
    if (countryCode) {
      const option = options?.find((o) => o?.country === countryCode)
      setCurrent(option)
    }
  }, [options, countryCode])

  const handleChange = (option: CountryOption) => {
    updateRegion(option.country, currentPath)
  }

  return (
    <Listbox
      as="div"
      className="relative"
      onChange={handleChange}
      defaultValue={
        countryCode
          ? options?.find((o) => o?.country === countryCode)
          : undefined
      }
    >
      <ListboxButton
        className="hover:text-ui-fg-base flex items-center gap-x-2"
        data-testid="region-switcher-button"
      >
        {current && (
          <>
            {/* @ts-ignore */}
            <ReactCountryFlag
              svg
              style={{
                width: "16px",
                height: "16px",
              }}
              countryCode={current.country ?? ""}
            />
            <span className="txt-compact-small">{current.label}</span>
          </>
        )}
      </ListboxButton>
      <ListboxOptions
        transition
        anchor="bottom end"
        className="max-h-[442px] overflow-y-scroll z-[900] bg-white drop-shadow-md text-small-regular text-black no-scrollbar rounded-rounded min-w-[280px] mt-2 transition duration-150 ease-in data-[closed]:opacity-0 data-[closed]:-translate-y-1"
        data-testid="region-switcher-options"
      >
        {options?.map((o, index) => {
          return (
            <ListboxOption
              key={index}
              value={o}
              className="py-2 hover:bg-gray-200 px-3 cursor-pointer flex items-center gap-x-2"
            >
              {/* @ts-ignore */}
              <ReactCountryFlag
                svg
                style={{
                  width: "16px",
                  height: "16px",
                }}
                countryCode={o?.country ?? ""}
              />{" "}
              {o?.label}
            </ListboxOption>
          )
        })}
      </ListboxOptions>
    </Listbox>
  )
}

export default CountrySelect
