import Link from 'next/link'
import type { ReactNode } from 'react'
import { DashboardIcon } from '../dashboard/_components/dashboard-ui'

export const SERVICE_EMAIL = 'vworksofficial@gmail.com'

export type LegalSection = { title: string; body: ReactNode }

// Kerangka halaman publik Kebijakan Privasi & Syarat Layanan.
// Bisa dibuka tanpa login (dibutuhkan Google OAuth, Play Store, App Store).
export function LegalPage({
  title,
  effectiveDate,
  intro,
  sections,
  returnToProfile = false,
}: {
  title: string
  effectiveDate: string
  intro: ReactNode
  sections: LegalSection[]
  returnToProfile?: boolean
}) {
  const backHref = returnToProfile ? '/dashboard/profil' : '/'
  const profileQuery = returnToProfile ? '?from=profile' : ''

  return (
    <main className="dashboard-app min-h-screen bg-[var(--canvas)]">
      <section className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#f8f9fd] shadow-[0_0_48px_rgba(15,23,42,0.08)]">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <Link
            aria-label={returnToProfile ? 'Kembali ke Profil' : 'Kembali ke VentureGo'}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            href={backHref}
          >
            <DashboardIcon name="arrowLeft" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-0.5 text-[11px] text-slate-500">Berlaku sejak {effectiveDate}</p>
          </div>
        </header>

        <article className="legal-content flex flex-1 flex-col gap-5 px-5 py-5 pb-12">
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <div className="text-[13px] leading-5 text-slate-600">{intro}</div>
            <ol className="mt-5 space-y-5">
              {sections.map((section, index) => (
                <li key={section.title}>
                  <h2 className="text-sm font-bold text-slate-900">
                    {index + 1}. {section.title}
                  </h2>
                  <div className="mt-1.5 space-y-2 text-xs leading-5 text-slate-600">
                    {section.body}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <nav aria-label="Dokumen legal" className="flex flex-col gap-2">
            <Link
              className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs font-semibold text-[var(--primary)] shadow-sm transition hover:bg-blue-50"
              href={`/kebijakan-privasi${profileQuery}`}
            >
              Kebijakan Privasi
            </Link>
            <Link
              className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs font-semibold text-[var(--primary)] shadow-sm transition hover:bg-blue-50"
              href={`/syarat-layanan${profileQuery}`}
            >
              Syarat Layanan
            </Link>
          </nav>
          <p className="text-center text-[10px] leading-4 text-slate-400">
            VentureGo · Vworks Student Venture
          </p>
        </article>
      </section>
    </main>
  )
}
