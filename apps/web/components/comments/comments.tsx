'use client'

/**
 * Threaded comments island.
 *
 * Loads approved comments via the public API (`GET /api/comments?postId=...`)
 * and renders them as a tree. New submissions go through `POST /api/comments`
 * — the server applies the moderation policy and may return `pending`, in
 * which case the comment is shown with a "awaiting moderation" notice instead
 * of being added to the visible list.
 */
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CommentForm } from './comment-form'
import { CommentItem } from './comment-item'

export interface CommentNode {
  id: string
  postId: string
  parentId: string | null
  authorName: string
  authorWebsite: string | null
  authorEmailHash: string | null
  bodyHtml: string
  createdAt: string
  upvotes: number
}

interface Props {
  postId: string
  locale: string
  commentsEnabled: boolean
  initialCount: number
}

export function Comments({ postId, locale, commentsEnabled, initialCount }: Props) {
  const t = useTranslations('comments')
  const [items, setItems] = useState<CommentNode[]>([])
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [pendingNotice, setPendingNotice] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/comments?postId=${encodeURIComponent(postId)}`)
      .then((r) => r.json())
      .then((d: { items: CommentNode[]; total: number }) => {
        if (cancelled) return
        setItems(d.items)
        setCount(d.total)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [postId])

  function handleSubmitted(comment: CommentNode, status: string) {
    if (status === 'approved') {
      setItems((prev) => [...prev, comment])
      setCount((c) => c + 1)
    } else {
      setPendingNotice(true)
    }
    setReplyingTo(null)
  }

  // Build a tree from the flat list.
  const tree = buildTree(items)

  return (
    <section aria-label={t('title')}>
      <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('count', { count })}</p>

      {!commentsEnabled ? (
        <p className="mt-6 rounded-md border border-border bg-muted/40 p-4 text-sm">{t('closed')}</p>
      ) : (
        <div className="mt-6">
          <CommentForm postId={postId} parentId={null} locale={locale} onSubmitted={handleSubmitted} />
          {pendingNotice && (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {t('pendingNotice')}
            </p>
          )}
        </div>
      )}

      <div className="mt-8 space-y-6">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && tree.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('count', { count: 0 })}</p>
        )}
        {tree.map((node) => (
          <CommentItem
            key={node.comment.id}
            node={node}
            depth={0}
            onReply={setReplyingTo}
            replyingTo={replyingTo}
            postId={postId}
            locale={locale}
            onSubmitted={handleSubmitted}
          />
        ))}
      </div>
    </section>
  )
}

interface TreeNode {
  comment: CommentNode
  children: TreeNode[]
}

function buildTree(items: CommentNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  const roots: TreeNode[] = []
  for (const c of items) byId.set(c.id, { comment: c, children: [] })
  for (const c of items) {
    const node = byId.get(c.id)!
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}
