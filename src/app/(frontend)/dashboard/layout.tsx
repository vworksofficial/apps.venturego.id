'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { isAppAccount, resolveUserDestination } from '@/lib/auth-client'
import { DashboardBottomNav, type PrimaryRoute } from './_components/dashboard-ui'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const matchesRoute = (route: string) => pathname === route || pathname.startsWith(`${route}/`)
  const activeRoute: PrimaryRoute | null = matchesRoute('/dashboard/angsuran')
    ? 'angsuran'
    : matchesRoute('/dashboard/riwayat')
      ? 'riwayat'
      : matchesRoute('/dashboard/unggah-berkas')
        ? 'berkas'
        : matchesRoute('/dashboard/profil') || matchesRoute('/dashboard/dokumen')
          ? 'profil'
          : pathname === '/dashboard' || pathname === '/dashboard/'
            ? 'home'
            : null

  useEffect(() => {
    // Keep browser scroll restoration from carrying a horizontal offset between dashboard routes.
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY)
  }, [pathname])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
        if (!active) return
        if (!isAppAccount(user)) {
          router.replace('/')
          return
        }
        const destination = await resolveUserDestination(user)
        if (!active) return
        if (destination === '/admin') {
          router.replace('/admin')
          return
        }
      })
    } catch {
      router.replace('/')
    }
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [router])

  return (
    <>
      <div className="dashboard-route-shell">{children}</div>
      <DashboardBottomNav active={activeRoute} />
    </>
  )
}
