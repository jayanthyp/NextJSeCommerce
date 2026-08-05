import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"

const MAX_SLIDES = 8
const RECOMMENDED_SIZE_NOTE =
  "Recommended: 1920×800px (roughly 2.4:1 wide) for a crisp full-width banner on large screens. Images will be scaled/cropped to fit; this isn't enforced automatically."

type CarouselSlide = {
  id: string
  image_url: string
  headline: string
  subtext: string | null
  cta_text: string | null
  cta_link: string | null
  rank: number
  is_active: boolean
}

type FormState = {
  id: string | null
  image_url: string
  headline: string
  subtext: string
  cta_text: string
  cta_link: string
  rank: number
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  image_url: "",
  headline: "",
  subtext: "",
  cta_text: "",
  cta_link: "",
  rank: 0,
  is_active: true,
}

const CarouselAdminPage = () => {
  const [slides, setSlides] = useState<CarouselSlide[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchSlides = async () => {
    setLoading(true)
    try {
      const res = await fetch("/admin/carousel-slides", { credentials: "include" })
      const data = await res.json()
      setSlides(data.carousel_slides ?? [])
    } catch {
      toast.error("Failed to load carousel slides")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSlides()
  }, [])

  const isEditing = form.id !== null
  const atCap = slides.length >= MAX_SLIDES

  const openCreateForm = () => {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEditForm = (slide: CarouselSlide) => {
    setForm({
      id: slide.id,
      image_url: slide.image_url,
      headline: slide.headline,
      subtext: slide.subtext ?? "",
      cta_text: slide.cta_text ?? "",
      cta_link: slide.cta_link ?? "",
      rank: slide.rank,
      is_active: slide.is_active,
    })
    setShowForm(true)
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("files", file)

      const res = await fetch("/admin/uploads", {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      if (!res.ok) {
        throw new Error("Upload failed")
      }

      const data = await res.json()
      const url = data.files?.[0]?.url
      if (!url) {
        throw new Error("Upload response missing file URL")
      }

      setForm((f) => ({ ...f, image_url: url }))
      toast.success("Image uploaded")
    } catch (e: any) {
      toast.error(e.message || "Failed to upload image")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!form.image_url || !form.headline) {
      toast.error("An image and headline are required")
      return
    }

    setSaving(true)
    const body = {
      image_url: form.image_url,
      headline: form.headline,
      subtext: form.subtext || null,
      cta_text: form.cta_text || null,
      cta_link: form.cta_link || null,
      rank: form.rank,
      is_active: form.is_active,
    }

    try {
      const url = isEditing ? `/admin/carousel-slides/${form.id}` : "/admin/carousel-slides"
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || "Failed to save slide")
      }

      toast.success(isEditing ? "Slide updated" : "Slide created")
      setShowForm(false)
      fetchSlides()
    } catch (e: any) {
      toast.error(e.message || "Failed to save slide")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (slide: CarouselSlide) => {
    if (!confirm(`Delete the "${slide.headline}" slide? This cannot be undone.`)) {
      return
    }
    try {
      const res = await fetch(`/admin/carousel-slides/${slide.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to delete slide")
      toast.success("Slide deleted")
      fetchSlides()
    } catch {
      toast.error("Failed to delete slide")
    }
  }

  const toggleActive = async (slide: CarouselSlide) => {
    try {
      await fetch(`/admin/carousel-slides/${slide.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !slide.is_active }),
      })
      fetchSlides()
    } catch {
      toast.error("Failed to update slide")
    }
  }

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Homepage Carousel</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            Up to {MAX_SLIDES} slides shown at the top of the homepage, ordered
            by rank. Inactive slides are kept but hidden from the storefront.
          </Text>
        </div>
        <Button variant="primary" onClick={openCreateForm} disabled={atCap && !isEditing}>
          {atCap ? `Maximum of ${MAX_SLIDES} slides reached` : "Add Slide"}
        </Button>
      </div>

      {showForm && (
        <div className="border-t border-ui-border-base px-6 py-6 flex flex-col gap-y-4 max-w-2xl">
          <Heading level="h2">{isEditing ? "Edit Slide" : "New Slide"}</Heading>

          <div className="flex flex-col gap-y-2">
            <Label>Image</Label>
            <Text className="text-ui-fg-subtle" size="small">
              {RECOMMENDED_SIZE_NOTE}
            </Text>
            {form.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.image_url}
                alt=""
                className="w-full max-h-48 object-cover rounded-md border border-ui-border-base"
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
              }}
            />
            {uploading && <Text size="small">Uploading…</Text>}
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>Headline</Label>
            <Input
              value={form.headline}
              onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>Subtext</Label>
            <Input
              value={form.subtext}
              onChange={(e) => setForm((f) => ({ ...f, subtext: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>CTA button text</Label>
            <Input
              value={form.cta_text}
              onChange={(e) => setForm((f) => ({ ...f, cta_text: e.target.value }))}
              placeholder="Shop Now"
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>CTA link</Label>
            <Input
              value={form.cta_link}
              onChange={(e) => setForm((f) => ({ ...f, cta_link: e.target.value }))}
              placeholder="/store or /collections/new-arrivals"
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>Rank (lower shows first)</Label>
            <Input
              type="number"
              value={form.rank}
              onChange={(e) =>
                setForm((f) => ({ ...f, rank: Number(e.target.value) || 0 }))
              }
            />
          </div>

          <div className="flex items-center gap-x-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
            />
            <Label>Active</Label>
          </div>

          <div className="flex gap-x-2">
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Preview</Table.HeaderCell>
            <Table.HeaderCell>Headline</Table.HeaderCell>
            <Table.HeaderCell>Rank</Table.HeaderCell>
            <Table.HeaderCell>Active</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {!loading && slides.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={5}>
                <Text className="text-ui-fg-subtle">No slides yet.</Text>
              </Table.Cell>
            </Table.Row>
          )}
          {slides.map((slide) => (
            <Table.Row key={slide.id}>
              <Table.Cell>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.image_url}
                  alt=""
                  className="w-20 h-10 object-cover rounded"
                />
              </Table.Cell>
              <Table.Cell>{slide.headline}</Table.Cell>
              <Table.Cell>{slide.rank}</Table.Cell>
              <Table.Cell>
                <Switch
                  checked={slide.is_active}
                  onCheckedChange={() => toggleActive(slide)}
                />
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-x-2 justify-end">
                  <Button variant="secondary" size="small" onClick={() => openEditForm(slide)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="small" onClick={() => handleDelete(slide)}>
                    Delete
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Homepage Carousel",
})

export default CarouselAdminPage
