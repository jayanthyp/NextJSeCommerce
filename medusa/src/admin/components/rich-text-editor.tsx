import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import { Button } from "@medusajs/ui"
import { useEffect } from "react"

type RichTextEditorProps = {
  value: string
  onChange: (html: string) => void
}

// Minimal WYSIWYG editor for CMS page content. Output is plain HTML —
// sanitized again on the storefront before render (isomorphic-dompurify),
// this editor is not itself a security boundary.
const RichTextEditor = ({ value, onChange }: RichTextEditorProps) => {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[220px] border border-ui-border-base rounded-b-md p-3 focus:outline-none",
      },
    },
  })

  // Keep the editor in sync when switching between pages being edited
  // (the form re-mounts with a new `value` from the selected page).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  if (!editor) {
    return null
  }

  return (
    <div>
      <div className="flex gap-x-1 border border-b-0 border-ui-border-base rounded-t-md p-2 bg-ui-bg-subtle">
        <Button
          type="button"
          variant={editor.isActive("bold") ? "primary" : "secondary"}
          size="small"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Bold
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "primary" : "secondary"}
          size="small"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Italic
        </Button>
        <Button
          type="button"
          variant={editor.isActive("heading", { level: 2 }) ? "primary" : "secondary"}
          size="small"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          Heading
        </Button>
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "primary" : "secondary"}
          size="small"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          List
        </Button>
        <Button
          type="button"
          variant={editor.isActive("link") ? "primary" : "secondary"}
          size="small"
          onClick={() => {
            const url = window.prompt("Link URL")
            if (url) {
              editor.chain().focus().setLink({ href: url }).run()
            }
          }}
        >
          Link
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export default RichTextEditor
