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
import { useEffect, useState } from "react"
import RichTextEditor from "../../components/rich-text-editor"

type CmsPage = {
  id: string
  title: string
  slug: string
  content: string
  footer_section: "support" | "policies" | null
  rank: number
  is_active: boolean
}

type FormState = {
  id: string | null
  title: string
  slug: string
  content: string
  footer_section: "" | "support" | "policies"
  rank: number
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  slug: "",
  content: "",
  footer_section: "",
  rank: 0,
  is_active: true,
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const PagesAdminPage = () => {
  const [pages, setPages] = useState<CmsPage[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchPages = async () => {
    setLoading(true)
    try {
      const res = await fetch("/admin/pages", { credentials: "include" })
      const data = await res.json()
      setPages(data.pages ?? [])
    } catch {
      toast.error("Failed to load pages")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPages()
  }, [])

  const isEditing = form.id !== null

  const openCreateForm = () => {
    setForm(EMPTY_FORM)
    setSlugTouched(false)
    setShowForm(true)
  }

  const openEditForm = (page: CmsPage) => {
    setForm({
      id: page.id,
      title: page.title,
      slug: page.slug,
      content: page.content,
      footer_section: page.footer_section ?? "",
      rank: page.rank,
      is_active: page.is_active,
    })
    setSlugTouched(true)
    setShowForm(true)
  }

  const handleTitleChange = (title: string) => {
    setForm((f) => ({
      ...f,
      title,
      slug: slugTouched ? f.slug : slugify(title),
    }))
  }

  const handleSave = async () => {
    if (!form.title || !form.slug || !form.content) {
      toast.error("Title, slug, and content are required")
      return
    }

    setSaving(true)
    const body = {
      title: form.title,
      slug: form.slug,
      content: form.content,
      footer_section: form.footer_section || null,
      rank: form.rank,
      is_active: form.is_active,
    }

    try {
      const url = isEditing ? `/admin/pages/${form.id}` : "/admin/pages"
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || "Failed to save page")
      }

      toast.success(isEditing ? "Page updated" : "Page created")
      setShowForm(false)
      fetchPages()
    } catch (e: any) {
      toast.error(e.message || "Failed to save page")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (page: CmsPage) => {
    if (!confirm(`Delete "${page.title}"? This cannot be undone.`)) {
      return
    }
    try {
      const res = await fetch(`/admin/pages/${page.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to delete page")
      toast.success("Page deleted")
      fetchPages()
    } catch {
      toast.error("Failed to delete page")
    }
  }

  const toggleActive = async (page: CmsPage) => {
    try {
      await fetch(`/admin/pages/${page.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !page.is_active }),
      })
      fetchPages()
    } catch {
      toast.error("Failed to update page")
    }
  }

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Pages</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            General-purpose content pages. Assign a page to Support or
            Policies to have it appear as a footer link, or leave unassigned
            for a standalone page reachable only at its own URL.
          </Text>
        </div>
        <Button variant="primary" onClick={openCreateForm}>
          Add Page
        </Button>
      </div>

      {showForm && (
        <div className="border-t border-ui-border-base px-6 py-6 flex flex-col gap-y-4 max-w-2xl">
          <Heading level="h2">{isEditing ? "Edit Page" : "New Page"}</Heading>

          <div className="flex flex-col gap-y-2">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>Slug (URL: /pages/&lt;slug&gt;)</Label>
            <Input
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true)
                setForm((f) => ({ ...f, slug: slugify(e.target.value) }))
              }}
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>Content</Label>
            <RichTextEditor
              key={form.id ?? "new"}
              value={form.content}
              onChange={(html) => setForm((f) => ({ ...f, content: html }))}
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>Footer section</Label>
            <select
              className="border border-ui-border-base rounded-md p-2 text-ui-fg-base bg-ui-bg-base"
              value={form.footer_section}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  footer_section: e.target.value as FormState["footer_section"],
                }))
              }
            >
              <option value="">None (standalone page)</option>
              <option value="support">Support</option>
              <option value="policies">Policies</option>
            </select>
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>Rank (lower shows first within its section)</Label>
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
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, is_active: checked }))
              }
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
            <Table.HeaderCell>Title</Table.HeaderCell>
            <Table.HeaderCell>Slug</Table.HeaderCell>
            <Table.HeaderCell>Section</Table.HeaderCell>
            <Table.HeaderCell>Active</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {!loading && pages.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={5}>
                <Text className="text-ui-fg-subtle">No pages yet.</Text>
              </Table.Cell>
            </Table.Row>
          )}
          {pages.map((page) => (
            <Table.Row key={page.id}>
              <Table.Cell>{page.title}</Table.Cell>
              <Table.Cell>/pages/{page.slug}</Table.Cell>
              <Table.Cell className="capitalize">
                {page.footer_section ?? "—"}
              </Table.Cell>
              <Table.Cell>
                <Switch
                  checked={page.is_active}
                  onCheckedChange={() => toggleActive(page)}
                />
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-x-2 justify-end">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => openEditForm(page)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => handleDelete(page)}
                  >
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
  label: "Pages",
})

export default PagesAdminPage
