import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import crypto from "crypto";

type Options = Record<string, never>;

type InjectedDependencies = {
  logger: Logger;
};

/**
 * Cash on Delivery payment provider (see issue #64).
 *
 * COD never calls a payment gateway — the shopper pays on delivery — so
 * there is no online capture to initiate or verify. The provider deliberately
 * mirrors Medusa's built-in "system" (manual) provider semantics:
 * `initiatePayment` just mints a local session id, `authorizePayment`
 * immediately authorizes (so the order can be placed without a capture), and
 * nothing is auto-captured. The order's payment therefore stays `authorized`
 * (awaiting collection on delivery) until the merchant captures it via
 * `capturePayment` once the order is delivered and payment is collected.
 *
 * Per-region enable/disable is handled by Medusa's native region
 * `payment_providers` relation (attach/detach `pp_cod_cod` on a region) — the
 * storefront already lists only the providers attached to the cart's region,
 * so toggling COD on a region is all that's needed to show/hide it there.
 */
class CodProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "cod";

  protected logger_: Logger;
  protected options_: Options;

  constructor(container: InjectedDependencies, options: Options) {
    super(container, options);
    this.logger_ = container.logger;
    this.options_ = options;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    // No gateway call — just mint a local session id so Medusa can track
    // this payment collection. Preserve any incoming data (e.g. cart refs).
    return { id: crypto.randomUUID(), data: input.data ?? {} };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    // Authorize immediately — there's no card/gateway to wait on — but never
    // auto-capture: payment is collected on delivery.
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.data ?? {} };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    // Called by the merchant once the order is delivered and payment is
    // collected. Nothing external to call — Medusa flips the payment to
    // `captured` from this return.
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    // A delivered-and-collected COD payment can be refunded by the merchant;
    // there is no external gateway call involved.
    return { data: input.data };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    // No external source of truth — a COD payment stays `authorized`
    // (awaiting collection on delivery) until the merchant captures it.
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.data };
  }

  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // COD has no payment gateway and therefore no webhooks — there's nothing
    // to map from an external event.
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default CodProviderService;
