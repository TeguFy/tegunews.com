'use client'

/**
 * Threaded comments island.
 *
 * Loads approved comments via the public API (`GET /api/comments?postId=...`)
 * and renders them as a tree. New submissions go through `POST /api/comments`
 * — the server applies the moderation policy and may return `pending`, in
 * which case the comment shows a "awaiting moderation" notice instead of
 * appearing in the visible list.
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
      .catch(() => { /* RSC already rendered initialCount; leave list empty on failure */ })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [postId])

  function handleSubmitted(comment: CommentNode, status: string) {
    if (status === 'approved') {
      setItems((prev) => [...prev, comment])
      setCount((c) => c + 1)
      setPendingNotice(false)
    } else {
      // 'pending' or 'spam' — show pending notice. Don't tell the user it
      // was flagged as spam (don't tip off the bot).
      setPendingNotice(true)
    }
    setReplyingTo(null)
  }

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
        {loading && (
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-4">
                <div className="flex gap-3">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && tree.length === 0 && (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {t('count', { count: 0 })}
          </p>
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
