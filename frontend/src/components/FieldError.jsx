import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Field highlight for validation messages: a screen calls
// fail(fieldName, message) -- the message goes to its error toast, the
// named <Field name=...> gets data-invalid (red border + red-50, index.css)
// and focus. Editing that field clears the highlight.
const FieldErrorContext = createContext(null)

export function FieldErrorProvider({ value, children }) {
  return <FieldErrorContext.Provider value={value}>{children}</FieldErrorContext.Provider>
}

export function useFieldErrorContext() {
  return useContext(FieldErrorContext)
}

const CONTROL = 'input:not([type=hidden]), select, textarea, [role=combobox]'

/** `error` / `setError` are the screen's own error state (its Banner shows
 * it); the highlight also clears whenever the screen clears that error. */
export function useFieldError(error, setError) {
  const [invalidField, setInvalidField] = useState(null)
  const [focusTick, setFocusTick] = useState(0)

  const fail = useCallback(
    (field, message) => {
      setError(message)
      setInvalidField(field ?? null)
      setFocusTick((n) => n + 1)
    },
    [setError]
  )
  const clearField = useCallback(() => setInvalidField(null), [])
  if (!error && invalidField) setInvalidField(null)

  useEffect(() => {
    if (!invalidField) return
    const field = [...document.querySelectorAll('[data-field]')].find((el) => el.dataset.field === invalidField)
    const control = field?.querySelector(CONTROL)
    if (!control) return
    control.focus?.({ preventScroll: true })
    control.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [invalidField, focusTick])

  return { invalidField, fail, clearField }
}
