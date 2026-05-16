import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2, Users, User, Server, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/services/api'

export function CmdPalette({ open, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ users: [], groups: [], services: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const resultsRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults({ users: [], groups: [], services: [] })
      setError(null)
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults({ users: [], groups: [], services: [] })
      return
    }

    setLoading(true)
    setError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiClient.searchAll(query.trim())
        setResults(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  const flatResults = [
    ...results.users.map(r => ({ ...r, _category: 'users' })),
    ...results.groups.map(r => ({ ...r, _category: 'groups' })),
    ...results.services.map(r => ({ ...r, _category: 'services' })),
  ]

  const totalCount = flatResults.length

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, totalCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
      e.preventDefault()
      handleSelect(flatResults[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [totalCount, flatResults, selectedIndex, onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (resultsRef.current && flatResults[selectedIndex]) {
      const el = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, flatResults])

  const handleSelect = (item) => {
    if (item._category === 'user') {
      onSelect({ type: 'user', id: item.id, username: item.username })
    } else if (item._category === 'group') {
      onSelect({ type: 'group', id: item.id, name: item.name })
    } else if (item._category === 'service') {
      onSelect({ type: 'service', name: item.service_name })
    }
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-lg bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-tertiary shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search users, groups, services..."
            className="border-0 p-0 h-auto shadow-none focus-visible:ring-0 text-sm"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-tertiary shrink-0" />}
        </div>

        <div ref={resultsRef} className="max-h-[360px] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/20">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && query.trim() && totalCount === 0 && (
            <div className="px-4 py-8 text-center text-sm text-tertiary">
              No results for '{query}'
            </div>
          )}

          {results.users.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[11px] font-semibold text-tertiary uppercase tracking-wider bg-subtle">
                Users ({results.users.length})
              </div>
              {results.users.map((item, i) => (
                <button
                  key={item.id}
                  data-index={i}
                  onClick={() => handleSelect({ ...item, _category: 'user' })}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors hover:bg-subtle ${
                    selectedIndex === i ? 'bg-accent/10' : ''
                  }`}
                >
                  <User className="h-4 w-4 text-tertiary shrink-0" />
                  <span className="font-medium">{item.name || item.username}</span>
                  <span className="text-tertiary ml-auto">{item.username}</span>
                </button>
              ))}
            </div>
          )}

          {results.groups.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[11px] font-semibold text-tertiary uppercase tracking-wider bg-subtle">
                Groups ({results.groups.length})
              </div>
              {results.groups.map((item, i) => {
                const idx = results.users.length + i
                return (
                  <button
                    key={item.id}
                    data-index={idx}
                    onClick={() => handleSelect({ ...item, _category: 'group' })}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors hover:bg-subtle ${
                      selectedIndex === idx ? 'bg-accent/10' : ''
                    }`}
                  >
                    <Users className="h-4 w-4 text-tertiary shrink-0" />
                    <span className="font-medium">{item.name}</span>
                    {item.description && (
                      <span className="text-tertiary truncate ml-auto">{item.description}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {results.services.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[11px] font-semibold text-tertiary uppercase tracking-wider bg-subtle">
                Services ({results.services.length})
              </div>
              {results.services.map((item, i) => {
                const offset = results.users.length + results.groups.length
                const idx = offset + i
                return (
                  <button
                    key={item.service_name}
                    data-index={idx}
                    onClick={() => handleSelect({ ...item, _category: 'service' })}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors hover:bg-subtle ${
                      selectedIndex === idx ? 'bg-accent/10' : ''
                    }`}
                  >
                    <Server className="h-4 w-4 text-tertiary shrink-0" />
                    <span className="font-medium">{item.service_name}</span>
                    <span className="text-tertiary text-xs ml-auto">{item.service_type}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2 flex gap-4 text-[11px] text-tertiary">
          <span><kbd className="px-1 py-0.5 rounded bg-subtle border border-border text-[10px]">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1 py-0.5 rounded bg-subtle border border-border text-[10px]">Enter</kbd> Select</span>
          <span><kbd className="px-1 py-0.5 rounded bg-subtle border border-border text-[10px]">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  )
}
