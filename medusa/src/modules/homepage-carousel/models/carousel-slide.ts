import { model } from "@medusajs/framework/utils"

const CarouselSlide = model.define("carousel_slide", {
  id: model.id().primaryKey(),
  image_url: model.text(),
  headline: model.text(),
  subtext: model.text().nullable(),
  cta_text: model.text().nullable(),
  cta_link: model.text().nullable(),
  rank: model.number().default(0),
  is_active: model.boolean().default(true),
})

export default CarouselSlide
