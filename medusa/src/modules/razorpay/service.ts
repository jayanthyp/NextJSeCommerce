import { AbstractPaymentProvider, BigNumber } from "@medusajs/framework/utils";
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
import { RAZORPAY_CONFIG_MODULE } from "../razorpay-config";

type Options = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

type InjectedDependencies = {
  logger: Logger;
};

type RazorpayConfigService = {
  getActiveCredentials(): Promise<Options | null>;
};

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/**
 * Razorpay integration (see issue #7). Order creation + signature
 * verification happen here; the actual Checkout modal lives in the
 * storefront (tracked as a separate follow-up issue, since that part can't
 * be verified without a live Razorpay test account regardless of how this
 * work is split).
 *
 * Orders are created with `payment_capture: 1` (auto-capture) -- Razorpay
 * captures the payment itself the moment the customer completes Checkout,
 * so capturePayment/cancelPayment/deletePayment below have nothing to call
 * on Razorpay's side; they just pass through the existing `data`.
 */
class RazorpayProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "razorpay";

  protected logger_: Logger;
  protected options_: Options;

  static validateOptions(options: Record<string, unknown>) {
    if (!options.keyId || !options.keySecret || !options.webhookSecret) {
      throw new Error(
        "Razorpay's keyId, keySecret, and webhookSecret are all required in the provider's options."
      );
    }
  }

  constructor(container: InjectedDependencies, options: Options) {
    super(container, options);
    this.logger_ = container.logger;
    this.options_ = options;
  }

  /**
   * Admin-configured test/live credentials (see ../razorpay-config) take
   * priority over the static medusa-config.ts options whenever a full set
   * is stored -- this is what lets switching active_mode in Admin take
   * effect immediately, no redeploy. Falls back to the static options
   * (this.options_, from RAZORPAY_KEY_ID etc.) if nothing's configured
   * there yet, or if the config module can't be reached for some reason.
   */
  private async getCredentials(): Promise<Options> {
    try {
      const configService = this.container[RAZORPAY_CONFIG_MODULE] as
        | RazorpayConfigService
        | undefined;
      const stored = await configService?.getActiveCredentials();
      if (stored) {
        return stored;
      }
    } catch (e) {
      this.logger_.error(
        `Failed to read Razorpay credentials from the admin config module, falling back to static options: ${e}`
      );
    }
    return this.options_;
  }

  private async razorpayFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const credentials = await this.getCredentials();
    const token = Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64");

    const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${token}`,
        ...init?.headers,
      },
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        `Razorpay request to ${path} failed: ${body?.error?.description || response.statusText}`
      );
    }

    return body as T;
  }

  // Razorpay expects amounts in the currency's smallest unit (paise for
  // INR) -- Medusa passes amounts in major units (e.g. 1350 for ₹1350).
  private toMinorUnits(amount: number | string): number {
    return Math.round(Number(amount) * 100);
  }

  private verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const { amount, currency_code } = input;

    const order = await this.razorpayFetch<{ id: string; status: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: this.toMinorUnits(amount as number),
        currency: currency_code.toUpperCase(),
        payment_capture: 1,
      }),
    });

    return {
      id: order.id,
      data: { ...order },
    };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = input.data ?? {};
    const orderId = data.id as string;
    const paymentId = data.razorpay_payment_id as string | undefined;
    const signature = data.razorpay_signature as string | undefined;

    // The storefront attaches razorpay_payment_id/razorpay_signature to the
    // payment session's data once the customer completes the Checkout
    // modal -- until then, there's nothing to authorize yet.
    if (!paymentId || !signature) {
      return { status: "pending_authorization", data };
    }

    const credentials = await this.getCredentials();
    const isValid = this.verifySignature(
      `${orderId}|${paymentId}`,
      signature,
      credentials.keySecret
    );

    if (!isValid) {
      throw new Error("Razorpay payment signature verification failed.");
    }

    return {
      status: "authorized",
      data: { ...data, razorpay_payment_id: paymentId },
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    // An uncaptured Razorpay order/payment simply expires on its own --
    // there's no explicit cancel endpoint to call for that state.
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // Razorpay orders can't be amount-updated after creation -- Medusa
    // re-initiates a new payment session when the cart total changes for
    // providers that can't support this.
    return { data: input.data };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = input.data ?? {};
    const paymentId = data.razorpay_payment_id as string | undefined;
    if (!paymentId) {
      throw new Error("Cannot refund a Razorpay payment that was never captured.");
    }

    const refund = await this.razorpayFetch(`/payments/${paymentId}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount: this.toMinorUnits(input.amount as number) }),
    });

    return { data: { ...data, last_refund: refund } };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const data = input.data ?? {};
    const paymentId = data.razorpay_payment_id as string | undefined;
    if (!paymentId) {
      return { data };
    }

    const payment = await this.razorpayFetch<Record<string, unknown>>(`/payments/${paymentId}`);
    return { data: { ...data, ...payment } };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = input.data ?? {};
    const paymentId = data.razorpay_payment_id as string | undefined;

    if (!paymentId) {
      return { status: "pending" };
    }

    const payment = await this.razorpayFetch<{ status: string }>(`/payments/${paymentId}`);

    switch (payment.status) {
      case "authorized":
        return { status: "authorized" };
      case "captured":
        return { status: "captured" };
      case "failed":
        return { status: "error" };
      case "refunded":
        return { status: "canceled" };
      default:
        return { status: "pending" };
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data, rawData, headers } = payload;
    const signature = headers["x-razorpay-signature"] as string | undefined;
    const rawBody = typeof rawData === "string" ? rawData : rawData.toString("utf8");
    const credentials = await this.getCredentials();

    if (!signature || !this.verifySignature(rawBody, signature, credentials.webhookSecret)) {
      throw new Error("Razorpay webhook signature verification failed.");
    }

    const event = data.event as string;
    const paymentEntity = (data.payload as Record<string, any>)?.payment?.entity;

    switch (event) {
      case "payment.captured":
        return {
          action: "captured",
          data: {
            session_id: paymentEntity?.order_id,
            amount: new BigNumber((paymentEntity?.amount ?? 0) / 100),
          },
        };
      case "payment.failed":
        return {
          action: "failed",
          data: {
            session_id: paymentEntity?.order_id,
            amount: new BigNumber((paymentEntity?.amount ?? 0) / 100),
          },
        };
      default:
        return { action: "not_supported" };
    }
  }
}

export default RazorpayProviderService;
