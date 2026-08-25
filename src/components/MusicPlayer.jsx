import { useEffect, useRef, useState } from 'react'

// Descubre dinámicamente los .mp3 en /public/music/ (misma técnica que los
// modelos: la clave del glob trae el prefijo /public, que se recorta).
const globbed = import.meta.glob('/public/music/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
})

const TRACKS = Object.keys(globbed)
  .map((key) => {
    const path = key.replace(/^\/public/, '')
    const name = key.split('/').pop().replace(/\.mp3$/, '').replace(/[-_]/g, ' ')
    return { path, name }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const DEFAULT_VOLUME = 0.6
const VOLUME_KEY = 'altar-music-volume-v1'
const TRACK_KEY = 'altar-music-track-v1'

/**
 * Reproductor flotante sobre el canvas: reproduce todas las pistas de
 * /public/music/ en orden y en bucle infinito, con control de volumen.
 */
export default function MusicPlayer() {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  // No se persiste si estaba sonando: los navegadores bloquean el
  // autoplay sin gesto del usuario, así que igual habría que tocar play.
  const [trackIndex, setTrackIndex] = useState(() => {
    const savedPath = localStorage.getItem(TRACK_KEY)
    const i = TRACKS.findIndex((t) => t.path === savedPath)
    return i >= 0 ? i : 0
  })
  const [volume, setVolume] = useState(() => {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw === null) return DEFAULT_VOLUME
    const saved = Number(raw)
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : DEFAULT_VOLUME
  })

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
    localStorage.setItem(VOLUME_KEY, String(volume))
  }, [volume])

  useEffect(() => {
    if (TRACKS[trackIndex]) localStorage.setItem(TRACK_KEY, TRACKS[trackIndex].path)
  }, [trackIndex])

  // Cuando cambia la pista (React ya actualizó el src), se relanza el play.
  const playingRef = useRef(false)
  playingRef.current = playing
  useEffect(() => {
    if (!playingRef.current) return
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.play().catch(() => setPlaying(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIndex])

  if (TRACKS.length === 0) return null

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.volume = volume
      audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false), // el navegador bloqueó la reproducción
      )
    }
  }

  // Al terminar una pista pasa a la siguiente; tras la última vuelve a la
  // primera, así toda la carpeta suena en bucle infinito.
  const nextTrack = () => {
    const audio = audioRef.current
    if (TRACKS.length === 1) {
      // Única pista: el índice no cambia, se reinicia directamente
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(() => setPlaying(false))
      }
      return
    }
    setTrackIndex((i) => (i + 1) % TRACKS.length)
  }

  return (
    <div className="music-player">
      <audio ref={audioRef} src={TRACKS[trackIndex].path} onEnded={nextTrack} preload="none" />

      {playing && (
        <div className="music-info">
          <div className="music-track" title={TRACKS[trackIndex].name}>
            ♪ {TRACKS[trackIndex].name}
          </div>
          <input
            className="music-volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volumen"
          />
        </div>
      )}

      <button
        className={`music-btn ${playing ? 'music-btn--on' : ''}`}
        onClick={toggle}
        title={playing ? 'Desactivar música' : 'Activar música'}
        aria-label={playing ? 'Desactivar música' : 'Activar música'}
      >
        {playing ? (
          // Bocina con ondas
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        ) : (
          // Bocina tachada
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        )}
      </button>
    </div>
  )
}
