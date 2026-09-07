import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMessages } from './messages.js'

export default function useMessagePages(slug, enabled) {
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const cursor = useRef(null)
  const generation = useRef(0)
  const busy = useRef(false)
  const fetchPage = useCallback(async (reset = false) => {
    if (!enabled || busy.current) return
    busy.current = true
    const version = ++generation.current
    setLoading(true)
    setError('')
    try {
      const page = await loadMessages(slug, { afterId: reset ? null : cursor.current })
      if (version !== generation.current) return
      setMessages((previous) => {
        const items = reset ? page.items : [...previous, ...page.items]
        return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => a.id - b.id)
      })
      cursor.current = page.nextCursor
      setHasMore(page.hasMore)
    } catch {
      if (version === generation.current) setError('No se pudieron cargar los mensajes. Intenta de nuevo.')
    } finally {
      if (version === generation.current) { busy.current = false; setLoading(false) }
    }
  }, [slug, enabled])
  useEffect(() => {
    cursor.current = null
    busy.current = false
    setMessages([])
    setHasMore(false)
    setError('')
    if (enabled) fetchPage(true)
    return () => { generation.current++; busy.current = false }
  }, [fetchPage, enabled])
  const add = (message) => setMessages((previous) => [...new Map([...previous, message].map((item) => [item.id, item])).values()].sort((a, b) => a.id - b.id))
  return { messages, hasMore, loading, error, refresh: () => fetchPage(true), loadMore: () => fetchPage(false), add }
}
