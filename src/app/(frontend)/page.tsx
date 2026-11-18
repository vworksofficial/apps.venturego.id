'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { discardDriveUploads, submitFinancingApplication, type ApplicationInput } from './actions'
import { FINANCING_OPTIONS, formatRupiah } from '@/lib/financing-plan'
import {
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_DEFINITIONS,
  MAX_DOCUMENT_SIZE_BYTES,
  getKtpDocumentIndex,
} from '@/lib/documents'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { onAuthStateChanged } from 'firebase/auth'
import {
  ensureApplicantAccount,
  isAppAccount,
  preloadGoogleSignIn,
  resolveUserDestination,
  signInWithDemoAccount,
  signInWithGoogleAccount,
} from '@/lib/auth-client'
import { uploadToDrive } from '@/lib/upload-client'
import { OrbitMark, RocketLoader } from './_components/orbit-mark'

// Efek riak (ripple) ala Material/Google: lingkaran menyebar dari titik sentuh.
const triggerRipple = (event: React.PointerEvent<HTMLElement>) => {
  const element = event.currentTarget
  const rect = element.getBoundingClientRect()
  element.style.setProperty('--ripple-x', `${event.clientX - rect.left}px`)
  element.style.setProperty('--ripple-y', `${event.clientY - rect.top}px`)
  element.style.setProperty('--ripple-size', `${Math.hypot(rect.width, rect.height) * 2}px`)
  element.removeAttribute('data-ripple')
  void element.offsetWidth // mulai ulang animasi bila ditekan berulang
  element.setAttribute('data-ripple', '')
}

type Product = ApplicationInput['product']

const formatAmountInput = (value: string) =>
  value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const isIndonesianDate = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (!match) return false
  const months: Record<string, number> = {
    januari: 0,
    februari: 1,
    maret: 2,
    april: 3,
    mei: 4,
    juni: 5,
    juli: 6,
    agustus: 7,
    september: 8,
    oktober: 9,
    november: 10,
    desember: 11,
  }
  const month = months[match[2].toLowerCase()]
  if (month === undefined) return false
  const date = new Date(Number(match[3]), month, Number(match[1]))
  return (
    date.getFullYear() === Number(match[3]) &&
    date.getMonth() === month &&
    date.getDate() === Number(match[1])
  )
}
const formatIndonesianDate = (date: Date) =>
  `${date.getDate()} ${date.toLocaleDateString('id-ID', { month: 'long' })} ${date.getFullYear()}`
const formatIsoDateIndonesian = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? formatIndonesianDate(date)
    : ''
}
const parseIndonesianDateToIso = (value: string) => {
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (!match) return ''
  const months: Record<string, number> = {
    januari: 1,
    februari: 2,
    maret: 3,
    april: 4,
    mei: 5,
    juni: 6,
    juli: 7,
    agustus: 8,
    september: 9,
    oktober: 10,
    november: 11,
    desember: 12,
  }
  const month = months[match[2].toLowerCase()]
  if (!month) return ''
  const day = Number(match[1])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : ''
}

function BirthDatePicker({
  value,
  onChange,
  mode = 'past',
  futureLabel = 'tanggal keberangkatan',
}: {
  value: string
  onChange: (value: string) => void
  mode?: 'past' | 'future' | 'any'
  futureLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'calendar' | 'months' | 'years'>('calendar')
  const selectedDate = (() => {
    const match = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
    if (!match) return null
    const monthNames = [
      'januari',
      'februari',
      'maret',
      'april',
      'mei',
      'juni',
      'juli',
      'agustus',
      'september',
      'oktober',
      'november',
      'desember',
    ]
    const month = monthNames.indexOf(match[2].toLowerCase())
    if (month < 0) return null
    const date = new Date(Number(match[3]), month, Number(match[1]))
    return date.getFullYear() === Number(match[3]) &&
      date.getMonth() === month &&
      date.getDate() === Number(match[1])
      ? date
      : null
  })()
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date()
    return selectedDate ?? new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const today = new Date()
  const monthNames = Array.from({ length: 12 }, (_, month) =>
    new Date(2024, month, 1).toLocaleDateString('id-ID', { month: 'long' }),
  )
  const weekDays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay()
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
  const years =
    mode === 'past'
      ? Array.from(
          { length: today.getFullYear() - 1940 + 1 },
          (_, index) => today.getFullYear() - index,
        )
      : mode === 'future'
        ? Array.from({ length: 11 }, (_, index) => today.getFullYear() + index)
        : Array.from({ length: 91 }, (_, index) => today.getFullYear() + 10 - index)
  const pickerLabel = mode === 'past' ? 'tanggal lahir' : futureLabel

  useEffect(() => {
    if (selectedDate)
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [value])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setView('calendar')
      }
    }
    window.addEventListener('pointerdown', closeOnOutsideClick)
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  const chooseDay = (day: number) => {
    onChange(
      formatIndonesianDate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)),
    )
    setOpen(false)
    setView('calendar')
  }

  return (
    <div className="form-select" ref={rootRef}>
      <button
        aria-label={value ? `Tanggal: ${value}` : `Pilih ${pickerLabel}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`form-select-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
        type="button"
      >
        <span className={value ? '' : 'placeholder'}>{value || `Pilih ${pickerLabel}`}</span>
        <svg aria-hidden="true" className={open ? 'rotate' : ''} viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      </button>
      {open && (
        <div className="date-picker-menu" role="dialog" aria-label={`Pilih ${pickerLabel}`}>
          <div className="date-picker-header">
            <button
              aria-label="Bulan sebelumnya"
              className="date-picker-nav"
              disabled={
                mode === 'future' &&
                visibleMonth.getFullYear() === today.getFullYear() &&
                visibleMonth.getMonth() <= today.getMonth()
              }
              onClick={() =>
                setVisibleMonth(
                  new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
                )
              }
              type="button"
            >
              ‹
            </button>
            <div className="date-picker-heading">
              <button
                onClick={() => setView(view === 'months' ? 'calendar' : 'months')}
                type="button"
              >
                {monthNames[visibleMonth.getMonth()]}
              </button>
              <button
                onClick={() => setView(view === 'years' ? 'calendar' : 'years')}
                type="button"
              >
                {visibleMonth.getFullYear()}
              </button>
            </div>
            <button
              aria-label="Bulan berikutnya"
              className="date-picker-nav"
              disabled={
                mode === 'past' &&
                visibleMonth.getFullYear() === today.getFullYear() &&
                visibleMonth.getMonth() >= today.getMonth()
              }
              onClick={() =>
                setVisibleMonth(
                  new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
                )
              }
              type="button"
            >
              ›
            </button>
          </div>
          {view === 'calendar' && (
            <>
              <div className="date-picker-grid date-picker-weekdays">
                {weekDays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="date-picker-grid">
                {Array.from({ length: firstDay }, (_, index) => (
                  <span aria-hidden="true" key={`blank-${index}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const day = index + 1
                  const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
                  const isSelected = selectedDate?.getTime() === date.getTime()
                  const isDisabled =
                    mode === 'past'
                      ? date > today
                      : date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`date-picker-day${isSelected ? ' selected' : ''}`}
                      disabled={isDisabled}
                      key={day}
                      onClick={() => chooseDay(day)}
                      type="button"
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {view === 'months' && (
            <div className="date-picker-months">
              {monthNames.map((month, index) => (
                <button
                  className={index === visibleMonth.getMonth() ? 'selected' : ''}
                  key={month}
                  onClick={() => {
                    setVisibleMonth(new Date(visibleMonth.getFullYear(), index, 1))
                    setView('calendar')
                  }}
                  type="button"
                >
                  {month}
                </button>
              ))}
            </div>
          )}
          {view === 'years' && (
            <div className="date-picker-years">
              {years.map((year) => (
                <button
                  className={year === visibleMonth.getFullYear() ? 'selected' : ''}
                  key={year}
                  onClick={() => {
                    setVisibleMonth(new Date(year, visibleMonth.getMonth(), 1))
                    setView('calendar')
                  }}
                  type="button"
                >
                  {year}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const FULL_COVER_NEEDS = [
  ['MEDICAL', 'Biaya pendaftaran & MCU'],
  ['LANGUAGE_TRAINING', 'Biaya Pelatihan tahap 1 (Pelatihan bahasa)'],
  ['LANGUAGE_ALLOWANCE', 'Uang saku Pelatihan tahap 1 (Pelatihan bahasa)'],
  ['SKILL_TRAINING', 'Biaya Pelatihan tahap 2 (Pelatihan keterampilan)'],
  ['SKILL_ALLOWANCE', 'Uang saku Pelatihan tahap 2 (Pelatihan keterampilan)'],
  ['DOCUMENT', 'Biaya pengurusan dokumen keberangkatan'],
  ['ALLOWANCE', 'Biaya uang saku keberangkatan'],
] as const

const initialForm: ApplicationInput = {
  product: 'FULL_COVER',
  applicantName: '',
  guardianName: '',
  phone: '',
  lpkName: '',
  personalBankName: '',
  personalBankAccountNumber: '',
  personalBankAccountName: '',
  lpkBankName: '',
  lpkBankAccountNumber: '',
  lpkBankAccountName: '',
  birthPlace: '',
  birthDate: '',
  idCardNumber: '',
  gender: 'MALE',
  religion: 'ISLAM',
  idCardAddress: '',
  domicileSameAsIdCard: false,
  domicileAddress: '',
  domicilePostalCode: '',
  destination: 'JAPAN',
  trainingStarted: false,
  trainingCompleted: false,
  hasPassport: false,
  hasWorkContract: false,
  guardianApproval: false,
  placementPassed: false,
  coeStatus: 'NOT_STARTED',
  visaStatus: 'NOT_STARTED',
  languageLevel: 'NOT_STARTED',
  trainingStartDate: '',
  languageTrainingMonths: '',
  skillTrainingMonths: '',
  fullCoverInvoiceAmount: '',
  requiresTrainingAllowance: false,
  requiresAccommodation: false,
  estimatedDeparture: '',
  outstandingLPKAmount: '',
  financingAmount: '',
  selectedNeeds: [],
  understandsWakalah: false,
  acceptsDataProcessing: false,
}

const APPLICATION_DRAFT_KEY = 'venturego.application-draft.v1'
const applicationSteps = [
  { step: 1, label: 'Program' },
  { step: 2, label: 'Kesiapan' },
  { step: 3, label: 'Data diri' },
  { step: 4, label: 'Kebutuhan' },
  { step: 5, label: 'Rekening' },
  { step: 6, label: 'Tinjau' },
]

function GoogleIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 6-1.08 8-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.12 1.16-3.17 0-5.86-2.14-6.82-5.03H1.14v3.15C3.15 21.32 7.28 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.18 14.17c-.24-.72-.38-1.49-.38-2.17s.14-1.45.38-2.17V6.68H1.14C.41 8.13 0 9.77 0 12s.41 3.87 1.14 5.32l4.04-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.28 0 3.15 2.68 1.14 6.68l4.04 3.15c.96-2.89 3.65-5.08 6.82-5.08Z"
      />
    </svg>
  )
}

function FormSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; destination?: 'JAPAN' | 'TURKEY' }[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', closeOnOutsideClick)
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  return (
    <div className="form-select" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`form-select-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        type="button"
      >
        <span className={`form-select-value${selected ? '' : ' placeholder'}`}>
          {selected?.destination && <FormDestinationFlag destination={selected.destination} />}
          {selected?.label ?? placeholder}
        </span>
        <svg aria-hidden="true" className={open ? 'rotate' : ''} viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="form-select-menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`form-select-option${option.value === value ? ' selected' : ''}`}
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              role="option"
              type="button"
            >
              <span className="form-select-value">
                {option.destination && <FormDestinationFlag destination={option.destination} />}
                {option.label}
              </span>
              {option.value === value && <span className="form-select-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FormDestinationFlag({ destination }: { destination: 'JAPAN' | 'TURKEY' }) {
  return (
    <svg aria-hidden="true" className="form-destination-flag" viewBox="0 0 24 24">
      {destination === 'JAPAN' ? (
        <>
          <rect fill="#fff" height="24" width="24" />
          <circle cx="12" cy="12" r="6" fill="#bc002d" />
        </>
      ) : (
        <>
          <rect fill="#e30a17" height="24" width="24" />
          <path
            d="M15.2 12a5.2 5.2 0 1 1-2.2-4.3A4.2 4.2 0 1 0 16.4 13"
            fill="#fff"
            stroke="#fff"
            strokeLinejoin="round"
            strokeWidth=".6"
          />
          <path
            d="m16.8 10.2 2.9.85-1.85 2.35.02-2.92 2.86.9-2.87.88.03 2.92-1.87-2.35z"
            fill="#fff"
          />
        </>
      )}
      <rect x=".5" y=".5" width="23" height="23" rx="2" fill="none" stroke="#cbd5e1" />
    </svg>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [documentFiles, setDocumentFiles] = useState<Record<string, File | null>>({})
  const [ktpFile, setKtpFile] = useState<File | null>(null)
  const [step3Error, setStep3Error] = useState('')
  const [result, setResult] = useState<{ id?: string; error?: string }>({})
  const [isPending, startTransition] = useTransition()
  const [pendingSignIn, setPendingSignIn] = useState<'user' | 'admin' | 'google' | ''>('')
  const [signInError, setSignInError] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [stepError, setStepError] = useState('')

  useEffect(() => {
    if (window.location.hostname === '127.0.0.1') {
      const nextUrl = new URL(window.location.href)
      nextUrl.hostname = 'localhost'
      window.location.replace(nextUrl.toString())
      return
    }
    preloadGoogleSignIn()?.catch(() => {})
    const params = new URLSearchParams(window.location.search)
    const requestedStep = Number(params.get('step'))
    const returnToLogin = params.get('login') === 'true'
    const hasFormIntent =
      returnToLogin ||
      params.has('step') ||
      params.get('apply') === 'true' ||
      params.get('baru') === 'true'
    if (returnToLogin) {
      setStep(0)
      try {
        sessionStorage.removeItem(APPLICATION_DRAFT_KEY)
      } catch {
        // Ignore unavailable storage.
      }
    } else if (requestedStep >= 1 && requestedStep <= 6) {
      setStep(requestedStep)
    } else if (params.get('apply') === 'true' || params.get('baru') === 'true') {
      setStep(1)
    } else if (!hasFormIntent) {
      try {
        const saved = sessionStorage.getItem(APPLICATION_DRAFT_KEY)
        if (saved) {
          const draft = JSON.parse(saved) as { form?: Partial<ApplicationInput>; step?: number }
          if (draft.form && typeof draft.form === 'object') {
            setForm({
              ...initialForm,
              ...draft.form,
              personalBankName: '',
              personalBankAccountNumber: '',
              personalBankAccountName: '',
              lpkBankName: '',
              lpkBankAccountNumber: '',
              lpkBankAccountName: '',
            })
            const savedStep =
              draft.step && draft.step >= 5
                ? 5
                : applicationSteps.some((item) => item.step === draft.step)
                  ? draft.step!
                  : 1
            setStep(savedStep)
          }
        }
      } catch {
        try {
          sessionStorage.removeItem(APPLICATION_DRAFT_KEY)
        } catch {
          // Ignore unavailable storage.
        }
      }
    }
    setDraftReady(true)
  }, [])

  useEffect(() => {
    if (!draftReady || step === 0) return
    try {
      sessionStorage.setItem(
        APPLICATION_DRAFT_KEY,
        JSON.stringify({
          form: {
            ...form,
            personalBankName: '',
            personalBankAccountNumber: '',
            personalBankAccountName: '',
            lpkBankName: '',
            lpkBankAccountNumber: '',
            lpkBankAccountName: '',
          },
          step,
        }),
      )
    } catch {
      // Storage may be unavailable or full; the in-memory form remains usable.
    }
  }, [draftReady, form, step])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
        if (!active || !isAppAccount(user)) return
        const params = new URLSearchParams(window.location.search)
        const hasFormIntent =
          params.has('step') || params.get('apply') === 'true' || params.get('baru') === 'true'
        if (!hasFormIntent) setRedirecting(true)
        const destination = await resolveUserDestination(user)
        if (hasFormIntent && destination !== '/admin') return
        if (!active) return
        setRedirecting(true)
        router.replace(destination)
      })
    } catch {
      return
    }
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [router])

  const signInAs = async (role: 'user' | 'admin' | 'google') => {
    setSignInError('')
    setPendingSignIn(role)
    try {
      const user =
        role === 'google' ? await signInWithGoogleAccount() : await signInWithDemoAccount(role)
      const destination = await resolveUserDestination(user)
      router.push(destination)
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'gis/popup_closed' || code === 'auth/popup-closed-by-user') {
        setPendingSignIn('') // pengguna menutup popup sendiri; bukan galat
        return
      }
      setSignInError(
        role === 'google'
          ? code === 'auth/unauthorized-domain'
            ? 'Gunakan alamat http://localhost:3000 agar login Google diizinkan sistem.'
            : code === 'gis/popup_failed_to_open'
              ? 'Popup login diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.'
              : 'Tidak dapat masuk dengan Google. Silakan coba lagi.'
          : `Tidak dapat masuk sebagai ${role === 'admin' ? 'admin' : 'user'} demo. Silakan coba lagi.`,
      )
      setPendingSignIn('')
    }
  }
  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) => {
    setStepError('')
    setForm((current) => ({ ...current, [key]: value }))
  }
  const isDeparture = form.product === 'DEPARTURE_BRIDGING'
  const requestedFinancingAmount = Number(form.financingAmount)
  const estimatedMonthlyUjrah =
    Number.isSafeInteger(requestedFinancingAmount) && requestedFinancingAmount > 0
      ? Math.round(requestedFinancingAmount * 0.024)
      : null
  const estimatedTotalUjrah = estimatedMonthlyUjrah === null ? null : estimatedMonthlyUjrah * 12
  const estimatedAdminFee =
    Number.isSafeInteger(requestedFinancingAmount) && requestedFinancingAmount > 0
      ? Math.round(requestedFinancingAmount * 0.05)
      : null
  const estimatedCashDisbursed =
    estimatedAdminFee === null ? null : requestedFinancingAmount - estimatedAdminFee
  const estimatedFinancingTotal =
    estimatedTotalUjrah === null ? null : requestedFinancingAmount + estimatedTotalUjrah
  const visibleSteps = applicationSteps.map((item) => item.step)
  const currentStep = Math.max(1, visibleSteps.indexOf(step) + 1)
  const toggleNeed = (need: string) =>
    set(
      'selectedNeeds',
      form.selectedNeeds.includes(need)
        ? form.selectedNeeds.filter((item) => item !== need)
        : [...form.selectedNeeds, need],
    )

  const ktpIndex = getKtpDocumentIndex(form.product)
  const ktpLabel =
    ktpIndex >= 0 ? (DOCUMENT_DEFINITIONS[form.product][ktpIndex]?.label ?? 'Scan KTP') : 'Scan KTP'

  const handleKtpChange = (file: File | undefined) => {
    if (!file) return
    setStep3Error('')
    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type as (typeof ACCEPTED_DOCUMENT_TYPES)[number])) {
      setKtpFile(null)
      setStep3Error('Gunakan berkas PDF, JPG, atau PNG untuk scan KTP.')
      return
    }
    if (file.size <= 0 || file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setKtpFile(null)
      setStep3Error('Ukuran scan KTP maksimal 10 MB.')
      return
    }
    setKtpFile(file)
  }

  const submit = () => {
    setResult({})
    const selectedBytes =
      Object.values(documentFiles).reduce((total, file) => total + (file?.size ?? 0), 0) +
      (ktpFile?.size ?? 0)
    if (selectedBytes > 60 * 1024 * 1024) {
      setResult({ error: 'Ukuran seluruh dokumen tidak boleh melebihi 60 MB.' })
      return
    }
    if (!form.applicantName.trim() || !form.lpkName.trim()) {
      setResult({ error: 'Lengkapi nama pemohon dan nama LPK sebelum mengirim.' })
      return
    }
    if (ktpIndex >= 0 && !ktpFile) {
      setResult({ error: `Dokumen ${ktpLabel} wajib diunggah.` })
      return
    }
    startTransition(async () => {
      let uploadToken = ''
      const uploaded: { index: number; fileId: string }[] = []
      try {
        const user = await ensureApplicantAccount()
        uploadToken = await user.getIdToken()
        for (const [index, document] of DOCUMENT_DEFINITIONS[form.product].entries()) {
          const file = index === ktpIndex ? ktpFile : documentFiles[document.label]
          if (!file) continue
          const result = await uploadToDrive({
            token: uploadToken,
            file,
            documentIndex: index,
            product: form.product,
            folderName: form.applicantName,
            lpkName: form.lpkName,
          })
          uploaded.push({ index, fileId: result.fileId })
        }
        const request = new FormData()
        request.set('application', JSON.stringify(form))
        request.set('uploads', JSON.stringify(uploaded))
        request.set('uploadToken', uploadToken)
        const response = await submitFinancingApplication(request)
        if (response.ok) {
          sessionStorage.removeItem(APPLICATION_DRAFT_KEY)
          router.replace('/dashboard?applicationSubmitted=1')
        } else {
          await discardDriveUploads(
            uploadToken,
            uploaded.map((item) => item.fileId),
          )
          setResult({ error: response.message })
        }
      } catch (error) {
        if (uploadToken && uploaded.length) {
          await discardDriveUploads(
            uploadToken,
            uploaded.map((item) => item.fileId),
          )
        }
        setResult({
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Pengajuan belum dapat dikirim. Periksa koneksi lalu coba lagi.',
        })
      }
    })
  }

  return (
    <main className="app-canvas">
      <section
        className={`mobile-shell application-form ${step === 0 ? 'welcome-step' : step === 1 ? 'choice-step' : ''}`}
      >
        {step === 0 ? (
          <header className="welcome-hero">
            <OrbitMark label="VentureGo" />
            <div className="welcome-brand">
              <h1>Vworks Student Venture</h1>
              <span>by venturego.id</span>
            </div>
          </header>
        ) : (
          <header className="wizard-header">
            <div>
              <h1>Vworks Student Venture</h1>
              <span className="brand-caption">by venturego.id</span>
            </div>
          </header>
        )}

        <div className={`wizard-body ${step === 0 ? 'welcome-body' : ''}`}>
          {step > 0 && stepError && (
            <p className="error-message" role="alert">
              {stepError}
            </p>
          )}
          {step === 0 && (
            <div className="welcome-copy">
              <h2>Selamat datang!</h2>
              <p>
                Persiapkan perjalananmu bersama kami. Mulai pengajuan pembiayaan dengan langkah yang
                mudah dan terarah.
              </p>
              <div className="welcome-actions">
                <button
                  className="primary-button welcome-primary"
                  disabled={pendingSignIn !== ''}
                  onClick={() => signInAs('google')}
                  onPointerDown={triggerRipple}
                  type="button"
                >
                  <span className="google-badge" aria-hidden="true">
                    <GoogleIcon />
                  </span>
                  <span>
                    {pendingSignIn === 'google' ? 'Menghubungkan…' : 'Masuk dengan Google'}
                  </span>
                </button>
              </div>
              {signInError && (
                <p className="error-message" role="alert">
                  {signInError}
                </p>
              )}
              <p className="welcome-note">
                Akun baru akan dibuat secara otomatis saat pertama kali masuk.
              </p>
              <p className="welcome-legal">
                Dengan masuk, kamu menyetujui <a href="/syarat-layanan">Syarat Layanan</a> dan{' '}
                <a href="/kebijakan-privasi">Kebijakan Privasi</a> VentureGo.
              </p>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="intro intro-choice">
                <h2>Pilih pembiayaan yang sesuai</h2>
                <p>
                  Setiap tahap persiapan memiliki kebutuhan yang berbeda. Pilih opsi yang paling
                  sesuai dengan kondisi Anda saat ini.
                </p>
              </div>
              <button
                aria-pressed={!isDeparture}
                className={`product-option ${!isDeparture ? 'selected' : ''}`}
                onClick={() => {
                  set('product', 'FULL_COVER')
                  setDocumentFiles({})
                }}
              >
                <span className="selection-box" aria-hidden="true">
                  {!isDeparture && <span>✓</span>}
                </span>
                <span className="product-copy">
                  <span className="product-tag">Persiapan lengkap</span>
                  <strong>VSV Full Cover</strong>
                  <p>Pelatihan bahasa, keterampilan, dokumen, dan kebutuhan keberangkatan.</p>
                  <small>Cocok jika Anda baru memulai proses di LPK.</small>
                </span>
              </button>
              <button
                aria-pressed={isDeparture}
                className={`product-option ${isDeparture ? 'selected' : ''}`}
                onClick={() => {
                  set('product', 'DEPARTURE_BRIDGING')
                  setDocumentFiles({})
                }}
              >
                <span className="selection-box" aria-hidden="true">
                  {isDeparture && <span>✓</span>}
                </span>
                <span className="product-copy">
                  <span className="product-tag">Tahap akhir</span>
                  <strong>VSV Dana Keberangkatan</strong>
                  <p>Pembayaran LPK, dokumen akhir, dan uang saku keberangkatan.</p>
                  <small>Cocok jika pelatihan sudah selesai atau COE sedang diproses.</small>
                </span>
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="intro intro-choice">
                <h2>
                  {isDeparture
                    ? 'Periksa kesiapan keberangkatan'
                    : 'Ceritakan kesiapan program Anda'}
                </h2>
                <p>
                  {isDeparture
                    ? 'Dana Keberangkatan ditujukan bagi siswa yang telah menyelesaikan sebagian besar proses pelatihan.'
                    : 'Informasi ini membantu VSV menyusun kebutuhan pelatihan dan pembiayaan persiapan Anda.'}
                </p>
              </div>
              <div className="choice-list">
                {(isDeparture
                  ? [
                      ['trainingCompleted', 'Pelatihan sudah selesai'],
                      ['placementPassed', 'Saya sudah lulus seleksi penempatan'],
                      ['hasPassport', 'Saya sudah memiliki paspor'],
                      ['hasWorkContract', 'Saya sudah memiliki kontrak kerja'],
                    ]
                  : [
                      ['trainingStarted', 'Pelatihan bahasa sudah dimulai'],
                      ['hasPassport', 'Saya sudah memiliki paspor'],
                      ['guardianApproval', 'Orang tua atau wali sudah menyetujui'],
                    ]
                ).map(([key, label]) => (
                  <label className="check-row" key={key}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(form[key as keyof ApplicationInput])}
                      onChange={(e) =>
                        set(key as keyof ApplicationInput, e.target.checked as never)
                      }
                    />
                  </label>
                ))}
              </div>
              {isDeparture ? (
                <>
                  <label className="field">
                    <span>Status COE</span>
                    <FormSelect
                      value={form.coeStatus}
                      onChange={(value) => set('coeStatus', value as ApplicationInput['coeStatus'])}
                      options={[
                        { value: 'NOT_STARTED', label: 'Belum diproses' },
                        { value: 'IN_PROGRESS', label: 'Sedang diproses' },
                        { value: 'ISSUED', label: 'Sudah terbit' },
                      ]}
                    />
                  </label>
                  <label className="field">
                    <span>Status visa</span>
                    <FormSelect
                      value={form.visaStatus}
                      onChange={(value) =>
                        set('visaStatus', value as ApplicationInput['visaStatus'])
                      }
                      options={[
                        { value: 'NOT_STARTED', label: 'Belum diproses' },
                        { value: 'IN_PROGRESS', label: 'Sedang diproses' },
                        { value: 'ISSUED', label: 'Sudah terbit' },
                      ]}
                    />
                  </label>
                </>
              ) : (
                <label className="field">
                  <span>Level bahasa Jepang saat ini</span>
                  <FormSelect
                    value={form.languageLevel}
                    onChange={(value) =>
                      set('languageLevel', value as ApplicationInput['languageLevel'])
                    }
                    options={[
                      { value: 'NOT_STARTED', label: 'Belum mulai' },
                      { value: 'BASIC_N5', label: 'N5 dasar' },
                      { value: 'N5', label: 'N5' },
                      { value: 'N4', label: 'N4' },
                      { value: 'N3_PLUS', label: 'N3 atau lebih tinggi' },
                    ]}
                  />
                </label>
              )}
              {isDeparture && !form.trainingCompleted && (
                <div className="soft-note">
                  Dana Keberangkatan biasanya diberikan setelah pelatihan selesai. Tim VSV akan
                  memeriksa kelayakan Anda.
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="intro intro-choice">
                <h2>Data diri pemohon</h2>
                <p>Gunakan data yang sama dengan dokumen identitas resmi Anda.</p>
              </div>
              <div className="field">
                <span>{ktpLabel} (wajib)</span>
                <div className={`ktp-upload-row${ktpFile ? ' has-file' : ''}`}>
                  <div className="ktp-upload-preview">
                    {ktpFile ? (
                      <>
                        <strong title={ktpFile.name}>{ktpFile.name}</strong>
                        <small>
                          {(ktpFile.size / (1024 * 1024)).toFixed(2)} MB · dikirim bersama pengajuan
                        </small>
                      </>
                    ) : (
                      <small>PDF, JPG, atau PNG · maksimal 10 MB</small>
                    )}
                  </div>
                  <label className="ktp-upload-button">
                    <input
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      type="file"
                      onChange={(event) => {
                        handleKtpChange(event.target.files?.[0])
                        event.target.value = ''
                      }}
                    />
                    {ktpFile ? 'Ganti' : 'Unggah'}
                  </label>
                </div>
                <label className="field mt-3">
                  <span>NIK (Nomor Induk Kependudukan)</span>
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={20}
                    onChange={(event) =>
                      set('idCardNumber', event.target.value.replace(/\D/g, '').slice(0, 20))
                    }
                    placeholder="Masukkan NIK sesuai KTP (opsional)"
                    value={form.idCardNumber}
                  />
                  <small>Isi sesuai KTP, maksimal 20 digit.</small>
                </label>
                {step3Error && (
                  <p className="error-message" role="alert">
                    {step3Error}
                  </p>
                )}
              </div>
              <label className="field">
                <span>Nama lengkap (wajib)</span>
                <input
                  value={form.applicantName}
                  onChange={(e) => set('applicantName', e.target.value)}
                  placeholder="Sesuai KTP"
                />
              </label>
              <label className="field">
                <span>Nama orang tua/wali</span>
                <input
                  value={form.guardianName}
                  onChange={(e) => set('guardianName', e.target.value)}
                  placeholder="Nama yang tercantum di bagian wali akad"
                  required
                />
              </label>
              <label className="field">
                <span>Nomor WhatsApp (wajib)</span>
                <input
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="08xxxxxxxxxx"
                />
              </label>
              <label className="field">
                <span>Agama</span>
                <FormSelect
                  value={form.religion}
                  onChange={(value) => set('religion', value as ApplicationInput['religion'])}
                  options={[
                    { value: 'ISLAM', label: 'Islam' },
                    { value: 'PROTESTANT', label: 'Kristen Protestan' },
                    { value: 'CATHOLIC', label: 'Katolik' },
                    { value: 'HINDU', label: 'Hindu' },
                    { value: 'BUDDHIST', label: 'Buddha' },
                    { value: 'CONFUCIAN', label: 'Konghucu' },
                  ]}
                />
              </label>
              <label className="field">
                <span>Tempat lahir (wajib)</span>
                <input
                  value={form.birthPlace}
                  onChange={(e) => set('birthPlace', e.target.value)}
                  placeholder="Kota / kabupaten"
                />
              </label>
              <div className="field">
                <span>Tanggal lahir (wajib)</span>
                <BirthDatePicker
                  value={form.birthDate}
                  onChange={(value) => set('birthDate', value)}
                />
              </div>
              <label className="field">
                <span>Jenis kelamin</span>
                <FormSelect
                  value={form.gender}
                  onChange={(value) => set('gender', value as ApplicationInput['gender'])}
                  options={[
                    { value: 'MALE', label: 'Laki-laki' },
                    { value: 'FEMALE', label: 'Perempuan' },
                  ]}
                />
              </label>
              <label className="field">
                <span>Alamat sesuai KTP</span>
                <textarea
                  value={form.idCardAddress}
                  onChange={(e) => {
                    const value = e.target.value
                    setForm((current) => ({
                      ...current,
                      idCardAddress: value,
                      ...(current.domicileSameAsIdCard ? { domicileAddress: value } : {}),
                    }))
                  }}
                  placeholder="Jl., RT, RW, Kel., Kec., Kab., Prov."
                  rows={4}
                />
              </label>
              <label className="switch-row">
                <span>
                  <strong>Alamat korespondensi sama dengan KTP</strong>
                  <small>
                    Aktifkan jika surat menyurat dikirim ke alamat yang sama dengan KTP.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={form.domicileSameAsIdCard}
                  onChange={(e) => {
                    const same = e.target.checked
                    setForm((current) => ({
                      ...current,
                      domicileSameAsIdCard: same,
                      ...(same ? { domicileAddress: current.idCardAddress } : {}),
                    }))
                  }}
                />
              </label>
              <label className="field">
                <span>Alamat korespondensi (untuk surat menyurat)</span>
                <textarea
                  value={form.domicileSameAsIdCard ? form.idCardAddress : form.domicileAddress}
                  onChange={(e) => set('domicileAddress', e.target.value)}
                  placeholder={
                    form.domicileSameAsIdCard
                      ? 'Mengikuti alamat sesuai KTP'
                      : 'Jl., RT, RW, Kel., Kec., Kab., Prov.'
                  }
                  readOnly={form.domicileSameAsIdCard}
                  rows={4}
                />
              </label>
              <label className="field">
                <span>Kode pos alamat korespondensi</span>
                <input
                  inputMode="numeric"
                  maxLength={5}
                  value={form.domicilePostalCode}
                  onChange={(e) =>
                    set('domicilePostalCode', e.target.value.replace(/\D/g, '').slice(0, 5))
                  }
                  placeholder="Contoh: 56351"
                />
              </label>
            </>
          )}

          {step === 4 && (
            <>
              <div className="intro intro-choice">
                <h2>{isDeparture ? 'Rincian kebutuhan dana talang' : 'Rencana program Anda'}</h2>
                <p>
                  {isDeparture
                    ? 'Lengkapi waktu keberangkatan dan kewajiban yang masih perlu diselesaikan.'
                    : 'Lengkapi informasi program dan kebutuhan yang akan dibiayai.'}
                </p>
              </div>
              {isDeparture ? (
                <>
                  <label className="field">
                    <span>Nama LPK</span>
                    <input
                      value={form.lpkName}
                      onChange={(e) => set('lpkName', e.target.value)}
                      placeholder="Contoh: LPK Sakura"
                    />
                  </label>
                  <label className="field">
                    <span>Negara tujuan</span>
                    <FormSelect
                      value={form.destination}
                      onChange={(value) =>
                        set('destination', value as ApplicationInput['destination'])
                      }
                      options={[
                        { value: 'JAPAN', label: 'Jepang', destination: 'JAPAN' },
                        { value: 'TURKEY', label: 'Turki', destination: 'TURKEY' },
                      ]}
                    />
                  </label>
                  <label className="field">
                    <span>Perkiraan tanggal keberangkatan</span>
                    <BirthDatePicker
                      mode="future"
                      value={form.estimatedDeparture}
                      onChange={(value) => set('estimatedDeparture', value)}
                    />
                  </label>
                  <label className="field">
                    <span>Sisa kewajiban kepada LPK</span>
                    <div className="currency-input">
                      <span>Rp</span>
                      <input
                        inputMode="numeric"
                        value={formatAmountInput(form.outstandingLPKAmount)}
                        onChange={(e) =>
                          set('outstandingLPKAmount', e.target.value.replace(/\D/g, ''))
                        }
                        placeholder="0"
                      />
                    </div>
                  </label>
                  <div className="need-section">
                    <label className="field">
                      <span>Nilai pembiayaan sebelum biaya jasa administrasi</span>
                      <FormSelect
                        value={form.financingAmount}
                        onChange={(value) => set('financingAmount', value)}
                        placeholder="Pilih nilai pembiayaan"
                        options={FINANCING_OPTIONS.map((option) => ({
                          value: String(option.amount),
                          label: option.label,
                        }))}
                      />
                    </label>
                    {estimatedMonthlyUjrah !== null &&
                      estimatedTotalUjrah !== null &&
                      estimatedAdminFee !== null &&
                      estimatedCashDisbursed !== null &&
                      estimatedFinancingTotal !== null && (
                        <div className="finance-grid mt-3">
                          <div className="wide finance-highlight">
                            <span>Estimasi dana cair</span>
                            <strong>{formatRupiah(estimatedCashDisbursed)}</strong>
                            <small>Nilai pengajuan setelah dikurang jasa administrasi 5%</small>
                          </div>
                          <div>
                            <span>Total Ujrah</span>
                            <strong>{formatRupiah(estimatedTotalUjrah)}</strong>
                          </div>
                          <div>
                            <span>Jasa administrasi (5%)</span>
                            <strong>{formatRupiah(estimatedAdminFee)}</strong>
                          </div>
                          <div className="finance-highlight">
                            <span>Total kewajiban (simulasi)</span>
                            <strong>{formatRupiah(estimatedFinancingTotal)}</strong>
                            <small>Nilai pembiayaan + total Ujrah 12 bulan</small>
                          </div>
                          <div className="finance-highlight finance-installment">
                            <span>Angsuran per bulan</span>
                            <strong>{formatRupiah(estimatedFinancingTotal / 12)}</strong>
                            <small>
                              12 kali angsuran (simulasi 12 bulan), mulai dibayar ketika sudah
                              bekerja
                            </small>
                          </div>
                        </div>
                      )}
                    <div className="soft-note space-y-2 mt-4">
                      <p className="font-semibold text-slate-800">
                        Mengenal akad Wakalah bil Ujrah
                      </p>
                      <ul className="list-disc space-y-1 pl-5">
                        <li>
                          Anda memberi kuasa kepada VentureGo sebagai wakil untuk membantu mengurus
                          kebutuhan keberangkatan yang disepakati.
                        </li>
                        <li>
                          Dana digunakan untuk kebutuhan yang disetujui; rincian dan bukti
                          pengeluaran diverifikasi sebelum akad final.
                        </li>
                        <li>
                          Ujrah adalah imbalan jasa yang besarannya dan cara pembayarannya harus
                          tercantum jelas dalam akad.
                        </li>
                        <li>
                          Simulasi dana cair, Ujrah, total kewajiban, dan angsuran di atas belum
                          menjadi ketentuan final sebelum diverifikasi dan disepakati.
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Nama Lembaga Pelatihan Kerja</span>
                    <input
                      value={form.lpkName}
                      onChange={(e) => set('lpkName', e.target.value)}
                      placeholder="Contoh: LPK Sakura"
                    />
                  </label>
                  <label className="field">
                    <span>Negara tujuan</span>
                    <FormSelect
                      value={form.destination}
                      onChange={(value) =>
                        set('destination', value as ApplicationInput['destination'])
                      }
                      options={[
                        { value: 'JAPAN', label: 'Jepang', destination: 'JAPAN' },
                        { value: 'TURKEY', label: 'Turki', destination: 'TURKEY' },
                      ]}
                    />
                  </label>
                  <label className="field">
                    <span>Perkiraan tanggal mulai</span>
                    <BirthDatePicker
                      futureLabel="tanggal mulai pelatihan"
                      mode="any"
                      value={formatIsoDateIndonesian(form.trainingStartDate)}
                      onChange={(value) =>
                        set('trainingStartDate', parseIndonesianDateToIso(value))
                      }
                    />
                  </label>
                  <div className="field-grid">
                    <label className="field">
                      <span>
                        Pelatihan tahap 1
                        <br />
                        (Pelatihan bahasa)
                      </span>
                      <div className="currency-input duration-input">
                        <input
                          inputMode="numeric"
                          min="1"
                          max="60"
                          required
                          value={form.languageTrainingMonths}
                          onChange={(e) =>
                            set('languageTrainingMonths', e.target.value.replace(/\D/g, ''))
                          }
                          placeholder="3"
                        />
                        <span>bulan</span>
                      </div>
                    </label>
                    <label className="field">
                      <span>
                        Pelatihan tahap 2
                        <br />
                        (Pelatihan keterampilan)
                      </span>
                      <div className="currency-input duration-input">
                        <input
                          inputMode="numeric"
                          min="1"
                          max="60"
                          required
                          value={form.skillTrainingMonths}
                          onChange={(e) =>
                            set('skillTrainingMonths', e.target.value.replace(/\D/g, ''))
                          }
                          placeholder="3"
                        />
                        <span>bulan</span>
                      </div>
                    </label>
                  </div>
                  <label className="field">
                    <span>Estimasi invoice/tagihan LPK untuk program ini</span>
                    <div className="currency-input">
                      <span>Rp</span>
                      <input
                        inputMode="numeric"
                        value={formatAmountInput(form.fullCoverInvoiceAmount)}
                        onChange={(event) =>
                          set('fullCoverInvoiceAmount', event.target.value.replace(/\D/g, ''))
                        }
                        placeholder="Masukkan sesuai invoice LPK"
                        required
                      />
                    </div>
                    <small>Nilai ini menjadi acuan awal verifikasi biaya oleh admin.</small>
                  </label>
                  <div className="need-section">
                    <strong>Kebutuhan yang diajukan</strong>
                    <div className="choice-list need-checkbox-list">
                      {FULL_COVER_NEEDS.map(([value, label]) => (
                        <label
                          className={`check-row need-checkbox-row ${
                            form.selectedNeeds.includes(value) ? 'selected' : ''
                          }`}
                          key={value}
                        >
                          <span>{label}</span>
                          <input
                            type="checkbox"
                            checked={form.selectedNeeds.includes(value)}
                            onChange={() => toggleNeed(value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <div className="intro intro-choice">
                <h2>Informasi rekening</h2>
                <p>Masukkan rekening pribadi dan rekening LPK mitra yang diajukan.</p>
              </div>
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Rekening pribadi</h3>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Gunakan rekening atas nama Anda untuk keperluan pencatatan pengajuan.
                  </p>
                </div>
                <label className="field">
                  <span>Nama bank pribadi (wajib)</span>
                  <input
                    autoComplete="off"
                    maxLength={60}
                    value={form.personalBankName ?? ''}
                    onChange={(event) => set('personalBankName', event.target.value)}
                    placeholder="Contoh: BCA"
                  />
                </label>
                <label className="field">
                  <span>Nomor rekening pribadi (wajib)</span>
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={30}
                    value={form.personalBankAccountNumber ?? ''}
                    onChange={(event) =>
                      set(
                        'personalBankAccountNumber',
                        event.target.value.replace(/\D/g, '').slice(0, 30),
                      )
                    }
                    placeholder="Masukkan 6–30 digit"
                  />
                </label>
                <label className="field">
                  <span>Nama pemilik rekening pribadi (wajib)</span>
                  <input
                    autoComplete="off"
                    maxLength={120}
                    value={form.personalBankAccountName ?? ''}
                    onChange={(event) => set('personalBankAccountName', event.target.value)}
                    placeholder="Sesuai buku rekening"
                  />
                </label>
              </section>
              <section className="space-y-3 border-t border-slate-200 pt-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Rekening LPK mitra</h3>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Pastikan informasi ini telah dikonfirmasi kepada LPK mitra.
                  </p>
                </div>
                <label className="field">
                  <span>Nama bank LPK (wajib)</span>
                  <input
                    autoComplete="off"
                    maxLength={60}
                    value={form.lpkBankName ?? ''}
                    onChange={(event) => set('lpkBankName', event.target.value)}
                    placeholder="Contoh: BRI"
                  />
                </label>
                <label className="field">
                  <span>Nomor rekening LPK (wajib)</span>
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={30}
                    value={form.lpkBankAccountNumber ?? ''}
                    onChange={(event) =>
                      set(
                        'lpkBankAccountNumber',
                        event.target.value.replace(/\D/g, '').slice(0, 30),
                      )
                    }
                    placeholder="Masukkan 6–30 digit"
                  />
                </label>
                <label className="field">
                  <span>Nama pemilik rekening LPK (wajib)</span>
                  <input
                    autoComplete="off"
                    maxLength={120}
                    value={form.lpkBankAccountName ?? ''}
                    onChange={(event) => set('lpkBankAccountName', event.target.value)}
                    placeholder="Sesuai buku rekening LPK"
                  />
                </label>
              </section>
            </>
          )}

          {step === 6 && (
            <>
              <div className="intro intro-choice">
                <h2>
                  {isDeparture ? 'Periksa kebutuhan keberangkatan' : 'Periksa rencana Full Cover'}
                </h2>
                <p>Nominal final mengikuti verifikasi kebutuhan dan akad yang Anda setujui.</p>
              </div>
              <section className="summary-hero">
                <span>{isDeparture ? 'VSV Dana Keberangkatan' : 'VSV Full Cover'}</span>
                <strong>Wakalah bil Ujrah</strong>
                <small>
                  Anda memberi kuasa kepada VSV untuk mengurus dan membayarkan kebutuhan yang
                  disepakati.
                </small>
              </section>
              <div className="review-list compact-review-list">
                <div>
                  <span>Nama</span>
                  <strong>{form.applicantName || 'Belum diisi'}</strong>
                </div>
                <div>
                  <span>LPK</span>
                  <strong>{form.lpkName || 'Belum diisi'}</strong>
                </div>
                <div>
                  <span>Rekening pribadi</span>
                  <strong>
                    {form.personalBankName ?? ''} · {form.personalBankAccountNumber ?? ''} ·{' '}
                    {form.personalBankAccountName ?? ''}
                  </strong>
                </div>
                <div>
                  <span>Rekening LPK</span>
                  <strong>
                    {form.lpkBankName ?? ''} · {form.lpkBankAccountNumber ?? ''} ·{' '}
                    {form.lpkBankAccountName ?? ''}
                  </strong>
                </div>
                <div>
                  <span>Tujuan</span>
                  <strong>{form.destination === 'JAPAN' ? 'Jepang' : 'Turki'}</strong>
                </div>
                {!isDeparture && (
                  <>
                    <div>
                      <span>Estimasi invoice/tagihan LPK</span>
                      <strong>
                        {form.fullCoverInvoiceAmount
                          ? formatRupiah(Number(form.fullCoverInvoiceAmount))
                          : 'Belum diisi'}
                      </strong>
                    </div>
                  </>
                )}
                {isDeparture && (
                  <>
                    <div>
                      <span>Nominal diajukan</span>
                      <strong>
                        {requestedFinancingAmount > 0
                          ? formatRupiah(requestedFinancingAmount)
                          : 'Belum diisi'}
                      </strong>
                    </div>
                    <div>
                      <span>Estimasi dana cair (setelah admin 5%)</span>
                      <strong>
                        {estimatedCashDisbursed !== null
                          ? formatRupiah(estimatedCashDisbursed)
                          : 'Belum diisi'}
                      </strong>
                    </div>
                    {estimatedMonthlyUjrah !== null &&
                      estimatedTotalUjrah !== null &&
                      estimatedAdminFee !== null &&
                      estimatedCashDisbursed !== null &&
                      estimatedFinancingTotal !== null && (
                        <>
                          <div>
                            <span>Total Ujrah</span>
                            <strong>{formatRupiah(estimatedTotalUjrah)}</strong>
                          </div>
                          <div>
                            <span>Jasa administrasi (5%)</span>
                            <strong>{formatRupiah(estimatedAdminFee)}</strong>
                          </div>
                          <div className="finance-review-total">
                            <span>Total kewajiban (simulasi)</span>
                            <strong>{formatRupiah(estimatedFinancingTotal)}</strong>
                          </div>
                          <div className="finance-review-total">
                            <span>Angsuran per bulan</span>
                            <strong>{formatRupiah(estimatedFinancingTotal / 12)}</strong>
                          </div>
                        </>
                      )}
                  </>
                )}
                <div>
                  <span>Tempat, tanggal lahir</span>
                  <strong>
                    {`${form.birthPlace || 'Belum diisi'}${form.birthDate ? `, ${form.birthDate}` : ''}`}
                  </strong>
                </div>
                {!isDeparture && (
                  <div className="review-needs-list">
                    <span>Kebutuhan yang diajukan</span>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-4 text-slate-700">
                      {FULL_COVER_NEEDS.filter(([value]) => form.selectedNeeds.includes(value)).map(
                        ([value, label]) => (
                          <li key={value}>{label}</li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </div>
              {!isDeparture && (
                <div className="soft-note mt-3 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Rincian biaya Full Cover</h3>
                    <p className="mt-1">
                      Tim VentureGo akan mengisi dan memverifikasi nilainya sebelum akad disepakati.
                    </p>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <h4 className="text-xs font-bold text-slate-800">Komponen akad</h4>
                    <ul className="mt-2 space-y-2">
                      <li>
                        <strong>Nafaqah</strong> — biaya nyata untuk kebutuhan yang disetujui,
                        didukung bukti pengeluaran.
                      </li>
                      <li>
                        <strong>Ujrah</strong> — imbalan jasa yang besar dan cara pembayarannya
                        dicantumkan dalam akad.
                      </li>
                      <li>
                        <strong>Ju&apos;alah</strong> — untuk Jepang berlaku jika COE atas nama Anda
                        terbit; negara lain perlu dikonfirmasi dalam akad final.
                      </li>
                    </ul>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <h4 className="text-xs font-bold text-slate-800">Pengelolaan dana</h4>
                    <p className="mt-1">
                      VentureGo bertindak sebagai wakil terbatas untuk kebutuhan yang disetujui.
                      Dokumen administrasi digunakan untuk verifikasi, bukan sebagai jaminan.
                    </p>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <h4 className="text-xs font-bold text-slate-800">
                      Pembayaran dan perlindungan
                    </h4>
                    <ul className="mt-2 space-y-2">
                      <li>
                        Total, tenor, angsuran, dan waktu mulai pembayaran ditetapkan dalam akad
                        final. Untuk Jepang, contoh jadwal dimulai pada bulan setelah keberangkatan;
                        tanggal pastinya mengikuti akad.
                      </li>
                      <li>
                        Jika COE tidak terbit atau pengajuan dihentikan, perhitungan mengikuti akad
                        final dan biaya aktual yang dapat dibuktikan. Tidak ada biaya komitmen
                        otomatis.
                      </li>
                      <li>
                        Contoh akad mencantumkan total tetap setelah ditandatangani, pelunasan
                        dipercepat tanpa penalti, dan biaya penagihan sebatas biaya aktual yang
                        terbukti. Ketentuan yang berlaku harus tertulis dalam akad final.
                      </li>
                    </ul>
                  </div>
                </div>
              )}
              {isDeparture && (
                <div className="soft-note review-simulation-note">
                  Nilai dana cair, total Ujrah, total kewajiban, dan angsuran di atas hanya
                  simulasi. Rincian final menunggu verifikasi admin dan LPK mitra.
                </div>
              )}
              <label className="consent">
                <input
                  type="checkbox"
                  checked={form.understandsWakalah}
                  onChange={(e) => set('understandsWakalah', e.target.checked)}
                />
                <span>
                  {isDeparture
                    ? 'Saya memahami bahwa total kewajiban terdiri dari pengeluaran riil (Nafaqah) dan Ujrah jasa VSV.'
                    : form.destination === 'JAPAN'
                      ? 'Saya memahami bahwa Nafaqah dan Ujrah akan diverifikasi serta Ju’alah hanya berlaku jika COE terbit; rincian final akan dicantumkan dalam akad.'
                      : 'Saya memahami bahwa Nafaqah, Ujrah, dan ketentuan Ju’alah untuk negara tujuan akan dikonfirmasi serta dicantumkan dalam akad final.'}
                </span>
              </label>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={form.acceptsDataProcessing}
                  onChange={(e) => set('acceptsDataProcessing', e.target.checked)}
                />
                <span>
                  Saya menyetujui pemrosesan data pengajuan dan verifikasi rekening yang saya
                  cantumkan.
                </span>
              </label>
              {result.error && <p className="error-message">{result.error}</p>}
            </>
          )}
        </div>

        {step > 0 && step < 7 && (
          <footer className="wizard-footer">
            <div
              className="step-dots"
              aria-label={`Langkah ${currentStep} dari ${visibleSteps.length}`}
            >
              {applicationSteps.map(({ step: visibleStep }, index) => (
                <span
                  className={`step-item ${visibleStep === step ? 'active' : visibleStep < step ? 'completed' : ''}`}
                  aria-current={visibleStep === step ? 'step' : undefined}
                  key={visibleStep}
                >
                  <span className="step-number">{index + 1}</span>
                </span>
              ))}
            </div>
            {step === 1 ? (
              <Link className="back-button" href="/dashboard">
                Kembali
              </Link>
            ) : (
              <button
                className="back-button"
                onClick={() => {
                  setStepError('')
                  setStep3Error('')
                  setResult({})
                  setStep(step - 1)
                }}
                type="button"
              >
                Kembali
              </button>
            )}
            <button
              className="primary-button"
              disabled={isPending}
              onClick={() => {
                setStepError('')
                if (step === 6) {
                  if (
                    !form.personalBankName?.trim() ||
                    !form.personalBankAccountName?.trim() ||
                    !/^\d{6,30}$/.test(form.personalBankAccountNumber ?? '') ||
                    !form.lpkBankName?.trim() ||
                    !form.lpkBankAccountName?.trim() ||
                    !/^\d{6,30}$/.test(form.lpkBankAccountNumber ?? '')
                  ) {
                    setStepError('Lengkapi kembali informasi rekening pribadi dan LPK.')
                    setStep(5)
                    return
                  }
                  if (!form.understandsWakalah || !form.acceptsDataProcessing) {
                    setStepError('Centang persetujuan akad dan pemrosesan data sebelum mengirim.')
                    return
                  }
                  submit()
                  return
                }
                if (step === 2 && isDeparture && !form.trainingCompleted) {
                  setStepError('Program Dana Keberangkatan mensyaratkan pelatihan sudah selesai.')
                  return
                }
                if (step === 3) {
                  const missing = [
                    ['Nama lengkap', form.applicantName.trim()],
                    ['Nama orang tua/wali', form.guardianName.trim()],
                    ['Nomor WhatsApp', form.phone.trim()],
                    ['Tempat lahir', form.birthPlace.trim()],
                    ['Tanggal lahir', form.birthDate.trim()],
                    ['Alamat sesuai KTP', form.idCardAddress.trim()],
                    [
                      'Alamat korespondensi',
                      (form.domicileSameAsIdCard
                        ? form.idCardAddress
                        : form.domicileAddress
                      ).trim(),
                    ],
                  ]
                    .filter(([, value]) => !value)
                    .map(([label]) => label)
                  if (missing.length) {
                    setStepError(`Lengkapi data berikut: ${missing.join(', ')}.`)
                    return
                  }
                  if (!/^([+]?62|0)[0-9]{8,14}$/.test(form.phone.replace(/[\s-]/g, ''))) {
                    setStepError(
                      'Masukkan nomor WhatsApp Indonesia yang valid, misalnya 08xxxxxxxxxx.',
                    )
                    return
                  }
                  if (!isIndonesianDate(form.birthDate)) {
                    setStepError(
                      'Isi tanggal lahir dengan tanggal yang valid, misalnya 12 Februari 2000.',
                    )
                    return
                  }
                  if (ktpIndex >= 0 && !ktpFile) {
                    setStep3Error('Scan KTP wajib diunggah sebelum melanjutkan.')
                    setStepError('Unggah scan KTP untuk melanjutkan.')
                    return
                  }
                  setStep3Error('')
                }
                if (step === 4) {
                  if (!form.lpkName.trim()) {
                    setStepError('Isi nama LPK terlebih dahulu.')
                    return
                  }
                  if (isDeparture && (!form.financingAmount || Number(form.financingAmount) <= 0)) {
                    setStepError('Pilih nilai pembiayaan yang diajukan.')
                    return
                  }
                  if (
                    !isDeparture &&
                    (!form.fullCoverInvoiceAmount || Number(form.fullCoverInvoiceAmount) <= 0)
                  ) {
                    setStepError('Isi estimasi invoice/tagihan LPK dengan nominal yang valid.')
                    return
                  }
                  if (
                    !isDeparture &&
                    ![form.languageTrainingMonths, form.skillTrainingMonths].every(
                      (value) =>
                        /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 60,
                    )
                  ) {
                    setStepError(
                      'Isi durasi pelatihan bahasa dan keterampilan antara 1 sampai 60 bulan.',
                    )
                    return
                  }
                }
                if (step === 5) {
                  const missing = [
                    ['nama bank pribadi', form.personalBankName?.trim() ?? ''],
                    ['nama pemilik rekening pribadi', form.personalBankAccountName?.trim() ?? ''],
                    ['nama bank LPK', form.lpkBankName?.trim() ?? ''],
                    ['nama pemilik rekening LPK', form.lpkBankAccountName?.trim() ?? ''],
                  ]
                    .filter(([, value]) => !value)
                    .map(([label]) => label)
                  if (missing.length) {
                    setStepError(`Lengkapi ${missing.join(', ')}.`)
                    return
                  }
                  if (!/^\d{6,30}$/.test(form.personalBankAccountNumber ?? '')) {
                    setStepError('Nomor rekening pribadi harus terdiri dari 6 sampai 30 digit.')
                    return
                  }
                  if (!/^\d{6,30}$/.test(form.lpkBankAccountNumber ?? '')) {
                    setStepError('Nomor rekening LPK harus terdiri dari 6 sampai 30 digit.')
                    return
                  }
                }
                setStep3Error('')
                setStep(step + 1)
              }}
            >
              {isPending ? 'Mengirim…' : step === 6 ? 'Kirim pengajuan' : 'Lanjut'}
            </button>
          </footer>
        )}
      </section>
      {(pendingSignIn !== '' || redirecting || isPending) && (
        <RocketLoader
          className={isPending ? 'rocket-loader--submission' : ''}
          message={
            redirecting
              ? 'Menyiapkan akunmu…'
              : isPending
                ? 'Mengirim pengajuan… Mohon tunggu.'
                : 'Menghubungkan ke Google…'
          }
        />
      )}
    </main>
  )
}
