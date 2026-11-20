import Image from 'next/image'
import packageInfo from '../../../../../../package.json'
import { DashboardCard, DashboardIcon, DashboardScaffold } from '../../_components/dashboard-ui'
import { InstallAppButton } from '../../../_components/install-app-button'

const FEATURES = [
  {
    icon: 'card' as const,
    title: 'Informasi penting dalam satu akun',
    description:
      'Lihat ringkasan program, status pengajuan, jadwal angsuran, dan riwayat pembayaran tanpa berpindah-pindah tempat.',
  },
  {
    icon: 'document' as const,
    title: 'Dokumen lebih mudah ditemukan',
    description:
      'Unggah berkas persyaratan, buka dokumen akad yang sudah tersedia, dan unduh salinannya langsung dari akun Anda.',
  },
  {
    icon: 'calculator' as const,
    title: 'Simulasi sebelum mengajukan',
    description:
      'Lihat perkiraan pembiayaan dan angsuran lebih awal. Nilai simulasi membantu memberi gambaran dan bukan keputusan akad final.',
  },
  {
    icon: 'wallet' as const,
    title: 'Pembayaran dan catatannya tersambung',
    description: 'Akses pembayaran angsuran dan periksa kembali catatan pembayaran dari dashboard.',
  },
  {
    icon: 'profile' as const,
    title: 'Nyaman dibuka lewat ponsel',
    description:
      'Tampilan menyesuaikan layar ponsel maupun komputer agar informasi tetap mudah dibaca.',
  },
]

export default function AboutPage() {
  return (
    <DashboardScaffold
      active="profil"
      backHref="/dashboard/profil"
      subtitle="Keunikan fitur dan versi aplikasi"
      title="Tentang Aplikasi"
    >
      <section aria-labelledby="about-app-title">
        <div className="brand-card relative isolate overflow-hidden rounded-3xl p-5 text-white shadow-sm">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full border border-white/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-5 -top-9 size-40 rounded-full border border-white/10"
          />
          <div className="relative flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/15">
              <Image alt="VentureGo" height={46} src="/venturego-mark.svg" width={48} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold tracking-wide text-white/80">venturego.id</p>
              <h2 className="text-base font-extrabold tracking-tight" id="about-app-title">
                Vworks Student Venture
              </h2>
            </div>
          </div>
          <p className="relative mt-4 max-w-sm text-xs leading-5 text-white/90">
            Aplikasi VentureGo yang membantu siswa mengelola informasi pembiayaan dengan jelas,
            praktis, dan dapat dipantau dari satu akun.
          </p>
        </div>
      </section>

      <section aria-labelledby="about-version-title">
        <DashboardCard className="relative overflow-hidden border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-indigo-50/70 p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-7 -top-10 size-28 rounded-full border border-blue-100/70"
          />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--primary)] shadow-sm ring-1 ring-blue-100">
              <DashboardIcon name="info" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Versi aplikasi
              </p>
              <h2
                className="mt-0.5 text-2xl font-extrabold leading-7 tracking-tight text-[var(--primary)]"
                id="about-version-title"
              >
                {packageInfo.version}
              </h2>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
              Rilis resmi
            </span>
          </div>
          <p className="relative mt-3 text-[11px] leading-5 text-slate-600">
            Nomor rilis Vworks Student Venture yang sedang Anda gunakan.
          </p>
          <div className="relative mt-4">
            <InstallAppButton />
          </div>
        </DashboardCard>
      </section>

      <section aria-labelledby="about-features-title" className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900" id="about-features-title">
            Fitur yang memudahkan Anda
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            Dirancang agar informasi dan kebutuhan pembiayaan mudah dikelola.
          </p>
        </div>
        <DashboardCard className="divide-y divide-slate-100 px-4">
          {FEATURES.map((feature) => (
            <div className="flex items-start gap-3 py-4 first:pt-4 last:pb-4" key={feature.title}>
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-[var(--primary)]">
                <DashboardIcon className="size-4" name={feature.icon} />
              </span>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-800">{feature.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{feature.description}</p>
              </div>
            </div>
          ))}
        </DashboardCard>
      </section>

      <p className="pb-2 text-center text-[10px] leading-4 text-slate-400">
        © VentureGo · Vworks Student Venture
      </p>
    </DashboardScaffold>
  )
}
