"use server"

import { sdk } from "@lib/config"
import { getCacheOptions } from "./cookies"

export type CarouselSlide = {
  id: string
  image_url: string
  headline: string
  subtext: string | null
  cta_text: string | null
  cta_link: string | null
  rank: number
  is_active: boolean
}

export const listCarouselSlides = async (): Promise<CarouselSlide[]> => {
  const next = {
    ...(await getCacheOptions("carousel-slides")),
  }

  return sdk.client
    .fetch<{ carousel_slides: CarouselSlide[] }>(`/store/carousel-slides`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .then(({ carousel_slides }) => carousel_slides)
    // The homepage should never 500 just because the carousel content
    // couldn't be fetched — render with no slides instead.
    .catch(() => [])
}
