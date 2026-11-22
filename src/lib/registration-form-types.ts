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
  pdfFileId?: string
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
