// Root layout — required by Next.js. The locale-scoped layout under
// `[locale]/layout.tsx` injects the `<html>` shell, so this stub just
// passes children through untouched.
import type { ReactNode } from 'react'
import './globals.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
