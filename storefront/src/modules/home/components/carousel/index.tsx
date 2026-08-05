import { listCarouselSlides } from "@lib/data/carousel"
import CarouselClient from "./carousel-client"

// Server component: fetches slide content, hands it to the client component
// that owns the interactive Embla instance — same server/client split used
// by CartButton/CartDropdown in the header.
export default async function Carousel() {
  const slides = await listCarouselSlides()

  if (!slides.length) {
    return null
  }

  return <CarouselClient slides={slides.slice(0, 8)} />
}
