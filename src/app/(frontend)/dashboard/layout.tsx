'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { isAppAccount, resolveUserDestination } from '@/lib/auth-client'
import { RocketLoader } from '../_components/orbit-mark'
import { DashboardBottomNav } from './_components/dashboard-ui'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const activeRoute =
    pathname.startsWith('/dashboard/angsuran') || pathname.startsWith('/dashboard/pembayaran')
      ? 'angsuran'
      : pathname.startsWith('/dashboard/riwayat')
        ? 'riwayat'
        : pathname.startsWith('/dashboard/unggah-berkas')
          ? 'berkas'
          : pathname.startsWith('/dashboard/profil') || pathname.startsWith('/dashboard/dokumen')
            ? 'profil'
            : 'home'

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
        setReady(true)
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
      {ready ? children : <RocketLoader message="Menyiapkan akunmu…" />}
      <DashboardBottomNav active={activeRoute} />
    </>
  )
}
