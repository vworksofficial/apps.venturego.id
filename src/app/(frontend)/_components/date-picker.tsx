'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const formatIndonesianDate = (date: Date) =>
  `${date.getDate()} ${date.toLocaleDateString('id-ID', { month: 'long' })} ${date.getFullYear()}`
export function BirthDatePicker({
  value,
  onChange,
  mode = 'past',
  futureLabel = 'tanggal keberangkatan',
  valueFormat = 'indonesian',
}: {
  value: string
  onChange: (value: string) => void
  mode?: 'past' | 'future' | 'any'
  futureLabel?: string
  valueFormat?: 'indonesian' | 'iso'
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'calendar' | 'months' | 'years'>('calendar')
  const selectedDate = (() => {
    if (valueFormat === 'iso') {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!match) return null
      const year = Number(match[1])
      const month = Number(match[2]) - 1
      const day = Number(match[3])
      const date = new Date(year, month, day)
      return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
        ? date
        : null
    }
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
    visible: boolean
  }>({ top: 0, left: 0, width: 320, maxHeight: 400, visible: false })
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
  const displayValue =
    valueFormat === 'iso' && selectedDate ? formatIndonesianDate(selectedDate) : value

  useEffect(() => {
    if (selectedDate)
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [value])

  useEffect(() => {
    if (!open) return
    const updateMenuPosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const viewportPadding = 8
      const width = Math.min(320, window.innerWidth - viewportPadding * 2)
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - width - viewportPadding),
      )
      const naturalHeight = menuRef.current?.scrollHeight ?? 380
      const below = window.innerHeight - rect.bottom - viewportPadding - 6
      const above = rect.top - viewportPadding - 6
      const placeAbove = below < naturalHeight && above > below
      const maxHeight = Math.max(150, Math.min(naturalHeight, placeAbove ? above : below))
      const top = placeAbove
        ? Math.max(viewportPadding, rect.top - maxHeight - 6)
        : Math.min(rect.bottom + 6, window.innerHeight - maxHeight - viewportPadding)
      setMenuPosition({ top, left, width, maxHeight, visible: true })
    }
    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
        setView('calendar')
      }
    }
    window.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      window.removeEventListener('pointerdown', closeOnOutsideClick)
    }
  }, [open])

  const chooseDay = (day: number) => {
    const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
    onChange(
      valueFormat === 'iso'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        : formatIndonesianDate(date),
    )
    setOpen(false)
    setView('calendar')
  }

  const calendarMenu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="date-picker-menu"
            role="dialog"
            aria-label={`Pilih ${pickerLabel}`}
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              minWidth: Math.min(280, menuPosition.width),
              maxHeight: menuPosition.maxHeight,
              overflowY: 'auto',
              visibility: menuPosition.visible ? 'visible' : 'hidden',
              zIndex: 10000,
            }}
          >
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
          </div>,
          document.body,
        )
      : null

  return (
    <div className={`form-select${open ? ' date-picker-open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        aria-label={displayValue ? `Tanggal: ${displayValue}` : `Pilih ${pickerLabel}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`form-select-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
        type="button"
      >
        <span className={displayValue ? '' : 'placeholder'}>
          {displayValue || `Pilih ${pickerLabel}`}
        </span>
        <svg aria-hidden="true" className={open ? 'rotate' : ''} viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      </button>
      {calendarMenu}
    </div>
  )
}
