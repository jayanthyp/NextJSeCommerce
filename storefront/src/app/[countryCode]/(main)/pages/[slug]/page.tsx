import { Metadata } from "next"
import { notFound } from "next/navigation"
import DOMPurify from "isomorphic-dompurify"
import { Heading } from "@medusajs/ui"

import { getPageBySlug } from "@lib/data/pages"
import { SITE_NAME } from "@lib/constants"

type Params = {
  params: Promise<{ countryCode: string; slug: string }>
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { slug } = await props.params
  const page = await getPageBySlug(slug)

  if (!page) {
    return { title: `Not found | ${SITE_NAME}` }
  }

  return { title: `${page.title} | ${SITE_NAME}` }
}

export default async function CmsPage(props: Params) {
  const { slug } = await props.params
  const page = await getPageBySlug(slug)

  if (!page) {
    notFound()
  }

  // Admin-authored rich text is sanitized before render — this content is
  // publicly served to every visitor, so it can't be trusted as-is even
  // though only admins can author it.
  const safeContent = DOMPurify.sanitize(page.content)

  return (
    <div className="content-container py-12">
      <Heading level="h1" className="text-2xl-semi mb-8">
        {page.title}
      </Heading>
      <div
        className="prose max-w-none txt-medium text-ui-fg-subtle"
        dangerouslySetInnerHTML={{ __html: safeContent }}
      />
    </div>
  )
}
