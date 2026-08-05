"use client"

import { useEffect, useRef, useState } from "react"
import useEmblaCarousel from "embla-carousel-react"
import Autoplay from "embla-carousel-autoplay"
import Image from "next/image"
import { Button, Heading, Text } from "@medusajs/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { CarouselSlide } from "@lib/data/carousel"

const CtaLink = ({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) => {
  const isExternal = /^https?:\/\//.test(href)

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }

  return <LocalizedClientLink href={href}>{children}</LocalizedClientLink>
}

export default function CarouselClient({ slides }: { slides: CarouselSlide[] }) {
  const autoplay = useRef(
    Autoplay({ delay: 5000, stopOnMouseEnter: true, stopOnInteraction: false })
  )
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  }, [])

  const [emblaRef] = useEmblaCarousel(
    { loop: true },
    reducedMotion ? [] : [autoplay.current]
  )

  return (
    <div className="w-full border-b border-ui-border-base overflow-hidden" ref={emblaRef}>
      <div className="flex">
        {slides.map((slide) => (
          <div
            key={slide.id}
            className="relative flex-[0_0_100%] h-[60vh] small:h-[75vh] bg-ui-bg-subtle"
          >
            <Image
              src={slide.image_url}
              alt={slide.headline}
              fill
              priority
              className="object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:p-32 gap-4 bg-black/20">
              <Heading
                level="h1"
                className="text-3xl leading-10 text-white font-normal"
              >
                {slide.headline}
              </Heading>
              {slide.subtext && (
                <Text className="text-white text-large-regular max-w-lg">
                  {slide.subtext}
                </Text>
              )}
              {slide.cta_text && slide.cta_link && (
                <CtaLink href={slide.cta_link}>
                  <Button variant="secondary">{slide.cta_text}</Button>
                </CtaLink>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
