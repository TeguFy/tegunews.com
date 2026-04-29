'use client'

/**
 * Tiptap-based rich text editor for article content.
 *
 * Output is HTML (not Markdown) — `getHTML()` on every change. The same
 * HTML is what gets stored in `post_translations.content` and what the
 * SEO analyzers count words from. Don't switch to Markdown without
 * updating extractHeadings/extractLinks in @teguns/seo.
 *
 * Toolbar is intentionally minimal. Nested formatting (italic-bold-link)
 * works through Tiptap's regular shortcuts (Cmd-B, Cmd-I, etc.) — the
 * buttons are just discoverability for editors who don't know them.
 *
 * `immediatelyRender: false` is required for SSR to not produce hydration
 * mismatches (Tiptap renders client-only).
 */
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { useCallback } from 'react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function PostEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'rounded-md' },
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none px-4 py-3 focus:outline-none min-h-[420px]',
        'data-placeholder': placeholder ?? 'Start writing…',
      },
    },
  })

  if (!editor) return <div className="h-[460px] animate-pulse rounded-md border border-zinc-200 bg-zinc-50" />

  return (
    <div className="overflow-hidden rounded-md border border-zinc-300 bg-white focus-within:ring-2 focus-within:ring-zinc-200">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const insertImage = useCallback(() => {
    const url = window.prompt('Image URL', 'https://')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }, [editor])

  return (
    <div className="flex flex-wrap gap-0.5 border-b border-zinc-200 bg-zinc-50 px-2 py-1 text-xs">
      <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</Btn>
      <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</Btn>
      <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>S</Btn>
      <Sep />
      <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
      <Sep />
      <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Btn>
      <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Btn>
      <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>“ Quote</Btn>
      <Sep />
      <Btn active={editor.isActive('link')} onClick={setLink}>Link</Btn>
      <Btn onClick={insertImage}>Image</Btn>
      <Sep />
      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↶</Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↷</Btn>
    </div>
  )
}

function Btn({
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={`rounded px-2 py-1 font-medium transition-colors disabled:opacity-40 ${
        active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="mx-1 self-center text-zinc-300">|</span>
}
