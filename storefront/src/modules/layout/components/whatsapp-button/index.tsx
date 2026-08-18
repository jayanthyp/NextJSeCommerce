"use client"

const buildWhatsAppLink = (rawNumber: string) => {
  const digitsOnly = rawNumber.replace(/\D/g, "")
  const message = encodeURIComponent(
    "Hi! I have a question about an order/product."
  )

  return `https://wa.me/${digitsOnly}?text=${message}`
}

export default function WhatsAppButton() {
  const supportNumber = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER

  if (!supportNumber) {
    return null
  }

  return (
    <a
      href={buildWhatsAppLink(supportNumber)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      data-testid="whatsapp-button"
      data-testid="whatsapp-button"
      className="fixed bottom-20 right-4 small:bottom-6 small:right-6 z-[1000] h-14 w-14 rounded-circle bg-[#25D366] flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#25D366]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-7 w-7 fill-white"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12.004 2C6.478 2 2 6.477 2 12c0 1.876.507 3.638 1.393 5.153L2 22l4.977-1.361A9.953 9.953 0 0 0 12.004 22C17.53 22 22 17.523 22 12S17.53 2 12.004 2zm0 18.2a8.14 8.14 0 0 1-4.412-1.288l-.316-.188-3.11.851.836-3.03-.206-.312A8.15 8.15 0 0 1 3.8 12c0-4.53 3.673-8.2 8.204-8.2 4.53 0 8.2 3.67 8.2 8.2 0 4.53-3.67 8.2-8.2 8.2z" />
      </svg>
    </a>
  )
}
