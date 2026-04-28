'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CommentForm } from './comment-form'
import type { CommentNode } from './comments'

interface TreeNode {
  comment: CommentNode
  children: TreeNode[]
}

interface Props {
  node: TreeNode
  depth: number
  postId: string
  locale: string
  replyingTo: string | null
  onReply: (id: string | null) => void
  onSubmitted: (c: CommentNode, status: string) => void
}

const MAX_VISIBLE_DEPTH = 5
/** Per-browser dedupe — prevents the same user double-tapping. Not security. */
const UPVOTE_KEY_PREFIX = 'tegunews:upvoted:'

export function CommentItem({ node, depth, postId, locale, replyingTo, onReply, onSubmitted }: Props) {
  const t = useTranslations('comments')
  const c = node.comment
  const indent = Math.min(depth, MAX_VISIBLE_DEPTH)
  const isReplying = replyingTo === c.id
  const date = new Date(c.createdAt)

  const [upvotes, setUpvotes] = useState(c.upvotes)
  const [hasUpvoted, setHasUpvoted] = useState(false)
  const [upvoting, setUpvoting] = useState(false)

  useEffect(() => {
    setHasUpvoted(typeof window !== 'undefined' && localStorage.getItem(UPVOTE_KEY_PREFIX + c.id) === '1')
  }, [c.id])

  async function handleUpvote() {
    if (hasUpvoted || upvoting) return
    setUpvoting(true)
    setUpvotes((n) => n + 1)
    setHasUpvoted(true)
    try {
      localStorage.setItem(UPVOTE_KEY_PREFIX + c.id, '1')
      const res = await fetch(`/api/comments/${c.id}/upvote`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { upvotes: number }
      setUpvotes(data.upvotes)
    } catch {
      // Roll back optimistic update on failure.
      setUpvotes((n) => n - 1)
      setHasUpvoted(false)
      localStorage.removeItem(UPVOTE_KEY_PREFIX + c.id)
    } finally {
      setUpvoting(false)
    }
  }

  const avatar = c.authorEmailHash
    ? `https://www.gravatar.com/avatar/${c.authorEmailHash}?d=mp&s=64`
    : null

  const replyCount = countDescendants(node)

  return (
    <article
      id={`comment-${c.id}`}
      className="rounded-lg border border-border bg-background p-4"
      style={{ marginLeft: `${indent * 1.25}rem` }}
    >
      <header className="flex items-center gap-3">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full bg-muted" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
            {c.authorName.slice(0, 1)}
          </span>
        )}
        <div className="leading-tight">
          <p className="text-sm font-semibold">
            {c.authorWebsite
              ? <a href={c.authorWebsite} rel="ugc nofollow noopener" target="_blank">{c.authorName}</a>
              : c.authorName}
          </p>
          <time dateTime={date.toISOString()} className="text-xs text-muted-foreground">
            {date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        </div>
      </header>

      <div
        className="prose-news mt-3 text-sm"
        dangerouslySetInnerHTML={{ __html: c.bodyHtml }}
      />

      <div className="mt-3 flex items-center gap-4 text-xs">
        <button
          type="button"
          onClick={handleUpvote}
          disabled={hasUpvoted || upvoting}
          aria-pressed={hasUpvoted}
          className={`inline-flex items-center gap-1 transition-colors ${hasUpvoted ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          title={t('upvote')}
        >
          <ChevronUp filled={hasUpvoted} />
          <span className="font-medium">{upvotes}</span>
        </button>

        <button
          type="button"
          onClick={() => onReply(isReplying ? null : c.id)}
          className="font-medium text-primary hover:underline"
        >
          {isReplying ? t('cancel') : t('reply')}
        </button>

        {replyCount > 0 && !isReplying && (
          <span className="text-muted-foreground">{t('replyCount', { count: replyCount })}</span>
        )}
      </div>

      {isReplying && (
        <div className="mt-4">
          <CommentForm postId={postId} parentId={c.id} locale={locale} onSubmitted={onSubmitted} />
        </div>
      )}

      {node.children.length > 0 && (
        <div className="mt-4 space-y-4">
          {node.children.map((child) => (
            <CommentItem
              key={child.comment.id}
              node={child}
              depth={depth + 1}
              postId={postId}
              locale={locale}
              replyingTo={replyingTo}
              onReply={onReply}
              onSubmitted={onSubmitted}
            />
          ))}
        </div>
      )}
    </article>
  )
}

function countDescendants(node: TreeNode): number {
  let n = 0
  for (const child of node.children) n += 1 + countDescendants(child)
  return n
}

function ChevronUp({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}
