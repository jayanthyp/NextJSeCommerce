import { forwardRef, useImperativeHandle, useMemo, useRef } from "react"

import NativeSelect, {
  NativeSelectProps,
} from "@modules/common/components/native-select"
import Input from "@modules/common/components/input"
import { getStatesForCountry } from "@lib/data/states"

type StateSelectProps = Omit<NativeSelectProps, "children"> & {
  countryCode?: string
  label?: string
  "data-testid"?: string
}

/**
 * State/province/county field for the checkout address forms. Filters its
 * options to whichever country is currently selected — countries we have no
 * subdivision data for (anything outside the ~20 seeded regions; see
 * medusa/src/scripts/add-global-regions.ts) fall back to the original plain
 * free-text input rather than showing an empty, unusable dropdown.
 *
 * Deliberately does NOT clear its own value when the country changes —
 * ShippingAddress/BillingAddress also use the same country field to restore
 * a customer's saved address (country + province set together), and a
 * country-change effect here would have no way to distinguish "the customer
 * picked a new country" from "a saved address just loaded" and could wipe
 * out the value the saved-address flow just set. If a stale value doesn't
 * match any option after a manual country change, the native select simply
 * shows nothing selected, which is enough of a prompt to reselect.
 */
const StateSelect = forwardRef<HTMLSelectElement | HTMLInputElement, StateSelectProps>(
  (
    { countryCode, label = "State / Province", placeholder, defaultValue, ...props },
    ref
  ) => {
    const innerRef = useRef<HTMLSelectElement & HTMLInputElement>(null)

    useImperativeHandle(ref, () => innerRef.current)

    const stateOptions = useMemo(() => getStatesForCountry(countryCode), [countryCode])

    if (!stateOptions.length) {
      return (
        <Input
          ref={innerRef as React.Ref<HTMLInputElement>}
          label={label}
          {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )
    }

    return (
      <NativeSelect
        ref={innerRef as React.Ref<HTMLSelectElement>}
        placeholder={placeholder ?? label}
        defaultValue={defaultValue}
        {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)}
      >
        {stateOptions.map(({ code, name }) => (
          <option key={code} value={name}>
            {name}
          </option>
        ))}
      </NativeSelect>
    )
  }
)

StateSelect.displayName = "StateSelect"

export default StateSelect
