import { model } from "@medusajs/framework/utils"

const Page = model.define("page", {
  id: model.id().primaryKey(),
  title: model.text(),
  slug: model.text().unique(),
  content: model.text(),
  // "support" | "policies" | null — null means the page stands alone and
  // isn't surfaced in any footer column, just reachable at /pages/<slug>.
  footer_section: model.text().nullable(),
  rank: model.number().default(0),
  is_active: model.boolean().default(true),
})

export default Page
