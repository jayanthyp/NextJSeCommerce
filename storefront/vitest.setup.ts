import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
})

// jsdom doesn't implement ResizeObserver, which @headlessui/react's
// floating-ui-based positioning (ListboxOptions' `anchor` prop) relies on —
// without a stub it throws asynchronously after the interaction that
// triggered it, failing the run even when every assertion passed.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
