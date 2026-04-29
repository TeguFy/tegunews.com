'use client'

/**
 * Better Auth browser client. The empty `baseURL` defaults to the current
 * origin — admin.tegunews.com when on prod. Single instance shared across
 * client components.
 */
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()
export const { signIn, signOut, useSession } = authClient
