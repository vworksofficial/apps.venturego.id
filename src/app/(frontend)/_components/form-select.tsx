'use client'

import { useEffect, useRef, useState } from 'react'

export function FormSelect({
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
