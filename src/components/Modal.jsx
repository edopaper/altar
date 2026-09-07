import { useEffect, useRef } from 'react'

export default function Modal({ onClose, label, className, children }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement
    const panel = ref.current
    const inactive = []
    let branch = panel.parentElement
    while (branch && branch !== document.body) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && !sibling.inert) { sibling.inert = true; inactive.push(sibling) }
      }
      branch = branch.parentElement
    }
    const focusable = () => [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter((el) => el.getClientRects().length)
    ;(focusable()[0] ?? panel).focus()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0] ?? panel
      const last = items.at(-1) ?? panel
      if (!items.length || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
    panel.addEventListener('keydown', onKey)
    return () => { panel.removeEventListener('keydown', onKey); inactive.forEach((el) => { el.inert = false }); if (previous?.isConnected) previous.focus() }
  }, [])
  return (
    <div className="message-overlay" onClick={onClose}>
      <div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
