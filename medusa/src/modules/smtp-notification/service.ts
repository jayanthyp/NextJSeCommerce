import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import nodemailer, { type Transporter } from "nodemailer"

type InjectedDependencies = {
  logger: Logger
}

export type SmtpNotificationOptions = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from?: string
  channels?: string[]
}

/**
 * Minimal SMTP notification provider built on nodemailer.
 *
 * Configured for Gmail by default (smtp.gmail.com:587 + STARTTLS), but every
 * connection value comes from options, so pointing it at Resend, Mailgun, SES
 * or a self-hosted MTA later is a .env change rather than a code change.
 *
 * Gmail specifics worth remembering:
 *   - `pass` must be a 16-character App Password; account passwords were
 *     disabled for SMTP in May 2022. A wrong one surfaces as `535-5.7.8`.
 *   - Google rewrites the From header to the authenticated address, so mail
 *     cannot appear to come from orders@yourdomain.com.
 *   - Roughly 500 recipients per day.
 */
class SmtpNotificationService extends AbstractNotificationProviderService {
  static identifier = "smtp"

  protected readonly logger_: Logger
  protected readonly options_: SmtpNotificationOptions
  protected readonly transporter_: Transporter

  static validateOptions(options: Record<string, unknown>): void {
    for (const key of ["host", "port", "user", "pass"]) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `SMTP notification provider requires the "${key}" option.`
        )
      }
    }
  }

  constructor({ logger }: InjectedDependencies, options: SmtpNotificationOptions) {
    super()

    this.logger_ = logger
    this.options_ = options

    this.transporter_ = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      // Port 465 is implicit TLS; 587 upgrades via STARTTLS, which is what
      // Gmail expects and what `secure: false` means here.
      secure: options.secure,
      auth: { user: options.user, pass: options.pass },
      // The stack is memory-constrained and email volume is low; a small pool
      // avoids holding open connections that Gmail would drop anyway.
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
    })
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    if (!notification.to) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No recipient address supplied to the SMTP notification provider."
      )
    }

    const { subject, html, text } = this.render_(notification)

    try {
      const info = await this.transporter_.sendMail({
        from: this.options_.from || this.options_.user,
        to: notification.to,
        subject,
        html,
        text,
        attachments: notification.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          encoding: "base64",
          contentType: attachment.content_type,
        })),
      })

      this.logger_.info(
        `[smtp] sent "${notification.template}" to ${notification.to} (${info.messageId})`
      )

      return { id: info.messageId }
    } catch (error) {
      this.logger_.error(
        `[smtp] failed to send "${notification.template}" to ${notification.to}: ${
          (error as Error).message
        }`
      )
      throw error
    }
  }

  /**
   * Turns a notification into a subject/body.
   *
   * `notification.content` wins when a caller supplies fully-rendered copy;
   * otherwise we fall back to the small built-in templates below. Swap this
   * for React Email or Handlebars when the store needs designed emails.
   */
  private render_(notification: ProviderSendNotificationDTO): {
    subject: string
    html: string
    text: string
  } {
    if (notification.content?.html || notification.content?.text) {
      return {
        subject: notification.content.subject || "Notification",
        html: notification.content.html || "",
        text: notification.content.text || "",
      }
    }

    const data = (notification.data ?? {}) as Record<string, any>

    switch (notification.template) {
      case "order-placed": {
        const ref = data.display_id ? `#${data.display_id}` : data.order_id
        const lines: string[] = Array.isArray(data.items)
          ? data.items.map(
              (item: any) => `${item.quantity} x ${item.title}`
            )
          : []

        const subject = `Order ${ref} confirmed`
        const text = [
          `Thanks for your order!`,
          ``,
          `Order: ${ref}`,
          ...(lines.length ? ["", "Items:", ...lines.map((l) => `  - ${l}`)] : []),
          ...(data.total ? ["", `Total: ${data.total} ${data.currency_code ?? ""}`] : []),
        ].join("\n")

        const html = `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px">
            <h2 style="margin:0 0 16px">Thanks for your order!</h2>
            <p style="margin:0 0 8px">Order <strong>${ref}</strong> is confirmed.</p>
            ${
              lines.length
                ? `<ul style="padding-left:18px">${lines
                    .map((l) => `<li>${l}</li>`)
                    .join("")}</ul>`
                : ""
            }
            ${
              data.total
                ? `<p style="margin:16px 0 0"><strong>Total:</strong> ${data.total} ${
                    data.currency_code ?? ""
                  }</p>`
                : ""
            }
          </div>
        `.trim()

        return { subject, html, text }
      }

      default: {
        const subject = `Notification: ${notification.template}`
        const text = JSON.stringify(data, null, 2)
        return {
          subject,
          html: `<pre style="font-family:ui-monospace,monospace">${text}</pre>`,
          text,
        }
      }
    }
  }
}

export default SmtpNotificationService
