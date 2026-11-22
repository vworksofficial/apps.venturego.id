export type RegistrationFormData = {
  // === Data Pemohon ===
  fullName: string
  idCardNumber: string
  motherMaidenName: string
  npwp?: string
  address: string
  rt: string
  rw: string
  kelurahan: string
  kecamatan: string
  city: string
  postalCode: string
  homePhone?: string
  mobilePhone: string
  contactHourStart: string // e.g. "08.00"
  contactHourEnd: string // e.g. "17.00"
  contactTimeZone: string // "WIB" or "Waktu Jepang"
  email: string
  birthPlace: string
  birthDate?: string // DD/MM/YYYY
  gender: 'LAKI_LAKI' | 'PEREMPUAN'
  religion: 'ISLAM' | 'PROTESTAN' | 'KATHOLIK' | 'HINDU' | 'BUDHA' | 'KONG_HU_CHU' | 'LAINNYA'
  dependentsCount: number
  lastEducation: 'SD' | 'SMP' | 'SMA_SEDERAJAT' | 'D1' | 'D2' | 'D3' | 'D4' | 'S1' | 'S2' | 'S3'
  destinationCountry: string // "JEPANG" or "TURKIYE" or other
  companyName: string
  companyBusiness: string
  companyRole: string
  companyAddress: string
  companyCity: string
  companyPhone?: string
  workStartDate: string // e.g. "01/10/2026"
  employmentStatus: 'MAGANG' | 'KONTRAK' | 'LAINNYA'
  employmentStatusOther?: string
  contractDurationYears?: string
  monthlyIncome: number

  // === Kontak Emergency ===
  emergencyName: string
  emergencyRelation:
    | 'ORANG_TUA'
    | 'ANAK'
    | 'SAUDARA_KANDUNG'
    | 'SAUDARA_KANDUNG_ORANG_TUA'
    | 'LAINNYA'
  emergencyRelationOther?: string
  emergencyPhone?: string
  emergencyMobile: string
  emergencyGender: 'LAKI_LAKI' | 'PEREMPUAN'
  emergencyAddress: string
  emergencyRt: string
  emergencyRw: string
  emergencyKelurahan: string
  emergencyKecamatan: string
  emergencyCity: string
  emergencyPostalCode: string
  emergencyCohabitation: 'TINGGAL_SERUMAH' | 'TIDAK_TINGGAL_SERUMAH'
  emergencyContactHourStart: string
  emergencyContactHourEnd: string
  emergencyContactTimeZone: string

  // Metadata
  completedAt?: string
  jobDetailsCompletedAt?: string
  pdfFileId?: string
}

const MONTH_NAMES_ID: Record<string, string> = {
  '01': 'Januari',
  '02': 'Februari',
  '03': 'Maret',
  '04': 'April',
  '05': 'Mei',
  '06': 'Juni',
  '07': 'Juli',
  '08': 'Agustus',
  '09': 'September',
  '10': 'Oktober',
  '11': 'November',
  '12': 'Desember',
}

export function formatIndonesianDate(value: string | undefined | null): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  // If already formatted with month name (contains letters), return as is
  if (/[a-zA-Z]/.test(trimmed)) return trimmed

  // Match YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch
    const monthKey = month.padStart(2, '0')
    const monthName = MONTH_NAMES_ID[monthKey] ?? month
    return `${parseInt(day, 10)} ${monthName} ${year}`
  }

  // Match DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch
    const monthKey = month.padStart(2, '0')
    const monthName = MONTH_NAMES_ID[monthKey] ?? month
    return `${parseInt(day, 10)} ${monthName} ${year}`
  }

  const date = new Date(trimmed)
  if (!isNaN(date.getTime())) {
    const d = date.getUTCDate()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const y = date.getUTCFullYear()
    const monthName = MONTH_NAMES_ID[m] ?? m
    return `${d} ${monthName} ${y}`
  }

  return trimmed
}

export const EMPTY_REGISTRATION_FORM_DATA: RegistrationFormData = {
  fullName: '',
  idCardNumber: '',
  motherMaidenName: '',
  npwp: '',
  address: '',
  rt: '',
  rw: '',
  kelurahan: '',
  kecamatan: '',
  city: '',
  postalCode: '',
  homePhone: '',
  mobilePhone: '',
  contactHourStart: '08.00',
  contactHourEnd: '17.00',
  contactTimeZone: 'WIB',
  email: '',
  birthPlace: '',
  birthDate: '',
  gender: 'LAKI_LAKI',
  religion: 'ISLAM',
  dependentsCount: 0,
  lastEducation: 'SMA_SEDERAJAT',
  destinationCountry: 'JEPANG',
  companyName: '',
  companyBusiness: '',
  companyRole: '',
  companyAddress: '',
  companyCity: '',
  companyPhone: '',
  workStartDate: '',
  employmentStatus: 'MAGANG',
  employmentStatusOther: '',
  contractDurationYears: '',
  monthlyIncome: 0,

  emergencyName: '',
  emergencyRelation: 'ORANG_TUA',
  emergencyRelationOther: '',
  emergencyPhone: '',
  emergencyMobile: '',
  emergencyGender: 'LAKI_LAKI',
  emergencyAddress: '',
  emergencyRt: '',
  emergencyRw: '',
  emergencyKelurahan: '',
  emergencyKecamatan: '',
  emergencyCity: '',
  emergencyPostalCode: '',
  emergencyCohabitation: 'TINGGAL_SERUMAH',
  emergencyContactHourStart: '08.00',
  emergencyContactHourEnd: '17.00',
  emergencyContactTimeZone: 'WIB',
}
