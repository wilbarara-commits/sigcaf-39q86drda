/**
 * Utilitário de aviso sonoro para eventos de entrega usando Web Audio API.
 * Sem dependências externas pesadas.
 * Persistência do estado de mudo (mute) no localStorage.
 */

const STORAGE_KEY_MUTED = 'sigcaf_monitoramento_audio_muted'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass()
    }
    return audioCtx
  } catch (err) {
    console.warn('Web Audio API não suportada ou bloqueada:', err)
    return null
  }
}

/**
 * Lê o estado de mudo armazenado no localStorage
 */
export function isDeliveryAudioMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const val = localStorage.getItem(STORAGE_KEY_MUTED)
    return val === 'true'
  } catch {
    return false
  }
}

/**
 * Salva o estado de mudo no localStorage
 */
export function setDeliveryAudioMuted(muted: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_MUTED, muted ? 'true' : 'false')
  } catch {
    /* intentionally ignored */
  }
}

/**
 * Toca um bip melódico curto (dois tons ascendentes suaves) indicando entrega confirmada.
 * Respeita a flag de mudo.
 */
export function playDeliveryNotificationSound(): void {
  if (isDeliveryAudioMuted()) return

  const ctx = getAudioContext()
  if (!ctx) return

  // Tenta despausar se o navegador suspendeu o contexto de áudio
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  try {
    const now = ctx.currentTime

    // Tom 1: G5 (~784 Hz), curto
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(783.99, now)

    gain1.gain.setValueAtTime(0.001, now)
    gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    osc1.connect(gain1)
    gain1.connect(ctx.destination)

    osc1.start(now)
    osc1.stop(now + 0.13)

    // Tom 2: C6 (~1046 Hz), som ascendente amigável
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1046.5, now + 0.1)

    gain2.gain.setValueAtTime(0.001, now + 0.1)
    gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.12)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

    osc2.connect(gain2)
    gain2.connect(ctx.destination)

    osc2.start(now + 0.1)
    osc2.stop(now + 0.3)
  } catch (err) {
    console.warn('Não foi possível tocar o aviso sonoro de entrega:', err)
  }
}
