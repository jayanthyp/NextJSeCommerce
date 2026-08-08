import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

type MaskedCredentialSet = {
  key_id: string | null
  key_secret_masked: string | null
  webhook_secret_masked: string | null
  configured: boolean
}

type ConfigResponse = {
  active_mode: string
  test: MaskedCredentialSet
  live: MaskedCredentialSet
}

type CredentialFormState = {
  keyId: string
  keySecret: string
  webhookSecret: string
}

const EMPTY_FORM: CredentialFormState = { keyId: "", keySecret: "", webhookSecret: "" }

/**
 * Editing a mode's credentials is "write-only" from this page's point of
 * view: the masked GET response never carries enough to prefill a secret
 * field (by design -- see razorpay-config/crypto.ts's maskSecret), so
 * these inputs always start blank. Leaving a field blank on save keeps
 * whatever's already stored (see service.ts's updateConfig) rather than
 * clearing it -- only a non-empty value overwrites.
 */
const CredentialModeSection = ({
  label,
  masked,
  onSave,
  saving,
}: {
  label: string
  masked: MaskedCredentialSet
  onSave: (form: CredentialFormState) => void
  saving: boolean
}) => {
  const [form, setForm] = useState<CredentialFormState>(EMPTY_FORM)

  return (
    <div className="flex flex-col gap-y-4 border border-ui-border-base rounded-md p-4">
      <div className="flex items-center justify-between">
        <Heading level="h3">{label}</Heading>
        <Badge color={masked.configured ? "green" : "grey"}>
          {masked.configured ? "Configured" : "Not configured"}
        </Badge>
      </div>

      {masked.configured && (
        <Text className="text-ui-fg-subtle" size="small">
          Key ID: {masked.key_id} · Key secret: {masked.key_secret_masked} · Webhook
          secret: {masked.webhook_secret_masked}
        </Text>
      )}

      <div className="flex flex-col gap-y-2">
        <Label>Key ID</Label>
        <Input
          value={form.keyId}
          onChange={(e) => setForm((f) => ({ ...f, keyId: e.target.value }))}
          placeholder={masked.key_id ?? "rzp_test_..."}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label>Key secret</Label>
        <Input
          type="password"
          value={form.keySecret}
          onChange={(e) => setForm((f) => ({ ...f, keySecret: e.target.value }))}
          placeholder={masked.key_secret_masked ?? "Leave blank to keep the current value"}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label>Webhook secret</Label>
        <Input
          type="password"
          value={form.webhookSecret}
          onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))}
          placeholder={masked.webhook_secret_masked ?? "Leave blank to keep the current value"}
        />
      </div>

      <div>
        <Button
          variant="secondary"
          size="small"
          isLoading={saving}
          onClick={() => {
            onSave(form)
            setForm(EMPTY_FORM)
          }}
        >
          Save {label} credentials
        </Button>
      </div>
    </div>
  )
}

const RazorpayConfigAdminPage = () => {
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [switchingMode, setSwitchingMode] = useState(false)

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch("/admin/razorpay-config", { credentials: "include" })
      if (!res.ok) throw new Error()
      setConfig(await res.json())
    } catch {
      toast.error("Failed to load Razorpay configuration")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const saveCredentials = async (mode: "test" | "live", form: CredentialFormState) => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        [mode]: {
          ...(form.keyId ? { keyId: form.keyId } : {}),
          ...(form.keySecret ? { keySecret: form.keySecret } : {}),
          ...(form.webhookSecret ? { webhookSecret: form.webhookSecret } : {}),
        },
      }
      const res = await fetch("/admin/razorpay-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setConfig(await res.json())
      toast.success(`${mode === "test" ? "Test" : "Live"} credentials saved`)
    } catch {
      toast.error("Failed to save credentials")
    } finally {
      setSaving(false)
    }
  }

  const switchMode = async (mode: "test" | "live") => {
    if (mode === "live" && !config?.live.configured) {
      toast.error("Save live credentials before switching to live mode.")
      return
    }
    setSwitchingMode(true)
    try {
      const res = await fetch("/admin/razorpay-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_mode: mode }),
      })
      if (!res.ok) throw new Error()
      setConfig(await res.json())
      toast.success(`Switched to ${mode} mode`)
    } catch {
      toast.error("Failed to switch mode")
    } finally {
      setSwitchingMode(false)
    }
  }

  if (loading || !config) {
    return (
      <Container className="p-6">
        <Text>Loading…</Text>
      </Container>
    )
  }

  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Razorpay configuration</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          Both a test and a live credential set can be stored at once -- only one is
          active at a time. Switching modes here takes effect immediately, no restart
          needed. Secrets are encrypted at rest and never shown in full once saved.
        </Text>
      </div>

      <div className="px-6 pb-4 flex items-center gap-x-3">
        <Text className="font-medium">Active mode:</Text>
        <Badge color={config.active_mode === "live" ? "red" : "orange"}>
          {config.active_mode}
        </Badge>
        <Button
          variant="secondary"
          size="small"
          isLoading={switchingMode}
          disabled={config.active_mode === "test"}
          onClick={() => switchMode("test")}
        >
          Switch to test
        </Button>
        <Button
          variant="secondary"
          size="small"
          isLoading={switchingMode}
          disabled={config.active_mode === "live"}
          onClick={() => switchMode("live")}
        >
          Switch to live
        </Button>
      </div>

      <div className="px-6 pb-6 flex flex-col gap-y-4 max-w-2xl">
        <CredentialModeSection
          label="Test"
          masked={config.test}
          saving={saving}
          onSave={(form) => saveCredentials("test", form)}
        />
        <CredentialModeSection
          label="Live"
          masked={config.live}
          saving={saving}
          onSave={(form) => saveCredentials("live", form)}
        />
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Razorpay",
})

export default RazorpayConfigAdminPage
