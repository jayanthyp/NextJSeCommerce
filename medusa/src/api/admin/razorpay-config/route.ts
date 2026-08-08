import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { RAZORPAY_CONFIG_MODULE } from "../../../modules/razorpay-config"
import RazorpayConfigModuleService from "../../../modules/razorpay-config/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: RazorpayConfigModuleService = req.scope.resolve(RAZORPAY_CONFIG_MODULE)
  const config = await service.getMaskedConfig()
  res.json(config)
}

// Partial update -- see service.ts's updateConfig for the field-by-field
// "only touch what's provided" semantics (so e.g. flipping active_mode
// doesn't require resending secrets).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: RazorpayConfigModuleService = req.scope.resolve(RAZORPAY_CONFIG_MODULE)
  const body = req.body as {
    active_mode?: "test" | "live"
    test?: { keyId?: string; keySecret?: string; webhookSecret?: string }
    live?: { keyId?: string; keySecret?: string; webhookSecret?: string }
  }

  if (body.active_mode && body.active_mode !== "test" && body.active_mode !== "live") {
    res.status(400).json({ message: "active_mode must be 'test' or 'live'." })
    return
  }

  await service.updateConfig(body)
  const config = await service.getMaskedConfig()
  res.json(config)
}
