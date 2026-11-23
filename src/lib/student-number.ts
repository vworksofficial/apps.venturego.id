import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseFirestore } from './firebase-admin'

export type StudentNumberCountryCode = 'JPN' | 'TUR'

export const STUDENT_NUMBER_PATTERN = /^VSV-(\d{4,})-(20\d{2})-(JPN|TUR)$/

const getJakartaYear = (date: Date = new Date()) =>
  new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(date)

export const studentNumberCountryCode = (value: unknown): StudentNumberCountryCode | null => {
  const normalized = String(value ?? '')
    .trim()
    .toLocaleUpperCase('id-ID')
  if (['JAPAN', 'JEPANG', 'JPN'].includes(normalized)) return 'JPN'
  if (['TURKEY', 'TURKIYE', 'TÜRKİYE', 'TURKI', 'TUR'].includes(normalized)) return 'TUR'
  return null
}

const studentNumberYear = (value: unknown) => {
  let date: Date | null = null
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    date = value
  } else if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const parsed = (value as { toDate: () => Date }).toDate()
    if (parsed instanceof Date && Number.isFinite(parsed.getTime())) date = parsed
  } else if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (Number.isFinite(parsed.getTime())) date = parsed
  }
  return date ? getJakartaYear(date) : getJakartaYear()
}

const buildStudentNumber = (sequence: number, year: string, country: StudentNumberCountryCode) =>
  `VSV-${String(sequence).padStart(4, '0')}-${year}-${country}`

export const studentNumberSequence = (studentNumber: string): string | null => {
  const match = STUDENT_NUMBER_PATTERN.exec(studentNumber)
  return match ? match[1] : null
}

const isStudentNumberForCountry = (value: unknown, country: StudentNumberCountryCode) =>
  typeof value === 'string' &&
  STUDENT_NUMBER_PATTERN.test(value) &&
  studentNumberCountryCode(value.slice(-3)) === country

export const getExistingStudentNumber = async (
  uid: string,
  destination?: unknown,
): Promise<string | null> => {
  if (typeof uid !== 'string' || !uid || uid.length > 128) return null
  try {
    const profile = await getFirebaseFirestore().collection('studentProfiles').doc(uid).get()
    const data = profile.data()
    const country = studentNumberCountryCode(destination)
    const countryNumbers = data?.studentNumbersByCountry
    const countryNumber =
      country && countryNumbers && typeof countryNumbers === 'object'
        ? (countryNumbers as Record<string, unknown>)[country]
        : null
    if (country && isStudentNumberForCountry(countryNumber, country)) {
      return countryNumber as string
    }
    const value = data?.studentNumber
    if (country) {
      return isStudentNumberForCountry(value, country) ? (value as string) : null
    }
    return typeof value === 'string' && STUDENT_NUMBER_PATTERN.test(value) ? value : null
  } catch {
    return null
  }
}

export const peekNextStudentNumber = async (
  destination: unknown,
  applicationDate?: unknown,
): Promise<string | null> => {
  const country = studentNumberCountryCode(destination)
  if (!country) return null
  try {
    const counter = await getFirebaseFirestore()
      .collection('systemCounters')
      .doc(`student-numbers-${country}`)
      .get()
    const previous = counter.data()?.lastIssued
    const nextSequence =
      typeof previous === 'number' && Number.isSafeInteger(previous) && previous >= 0
        ? previous + 1
        : 1
    return buildStudentNumber(nextSequence, studentNumberYear(applicationDate), country)
  } catch {
    return null
  }
}

export const ensureStudentNumber = async (params: {
  uid: string
  applicationDocId: string
  destination: unknown
}): Promise<string | null> => {
  if (
    typeof params.uid !== 'string' ||
    !params.uid ||
    params.uid.length > 128 ||
    typeof params.applicationDocId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(params.applicationDocId)
  ) {
    return null
  }
  const country = studentNumberCountryCode(params.destination)
  if (!country) return null

  try {
    const firestore = getFirebaseFirestore()
    const applicationRef = firestore.collection('applications').doc(params.applicationDocId)
    const profileRef = firestore.collection('studentProfiles').doc(params.uid)
    const counterRef = firestore.collection('systemCounters').doc(`student-numbers-${country}`)

    return await firestore.runTransaction(async (transaction) => {
      const [application, profile, counter] = await Promise.all([
        transaction.get(applicationRef),
        transaction.get(profileRef),
        transaction.get(counterRef),
      ])
      if (
        !application.exists ||
        application.data()?.ownerFirebaseUid !== params.uid ||
        studentNumberCountryCode(application.data()?.destination) !== country
      ) {
        return null
      }

      const applicationData = application.data() ?? {}
      const existingApplicationNumber = applicationData.studentNumber
      if (isStudentNumberForCountry(existingApplicationNumber, country)) {
        return existingApplicationNumber as string
      }

      const profileData = profile.data() ?? {}
      const studentNumbersByCountry =
        profileData.studentNumbersByCountry &&
        typeof profileData.studentNumbersByCountry === 'object'
          ? (profileData.studentNumbersByCountry as Record<string, unknown>)
          : {}
      const existingCountryNumber = studentNumbersByCountry[country]
      if (isStudentNumberForCountry(existingCountryNumber, country)) {
        transaction.update(applicationRef, { studentNumber: existingCountryNumber })
        return existingCountryNumber as string
      }

      const previous = counter.data()?.lastIssued
      const nextSequence =
        typeof previous === 'number' && Number.isSafeInteger(previous) && previous >= 0
          ? previous + 1
          : 1
      const nextNumber = buildStudentNumber(
        nextSequence,
        studentNumberYear(applicationData.createdAt),
        country,
      )

      transaction.set(
        counterRef,
        {
          country,
          lastIssued: nextSequence,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      transaction.set(
        profileRef,
        {
          ownerFirebaseUid: params.uid,
          studentNumber: nextNumber,
          studentNumbersByCountry: { [country]: nextNumber },
          issuedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      transaction.update(applicationRef, { studentNumber: nextNumber })

      return nextNumber
    })
  } catch {
    return null
  }
}
