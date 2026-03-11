import { DOMException } from './dom-exception'
import { Event } from './event'
import { EventTarget } from './event-target'

const SYM_ABORT = Symbol('abort')

export { SYM_ABORT }

export class AbortSignal extends EventTarget {
  #aborted = false
  #reason: unknown = undefined

  onabort: ((ev: Event) => void) | null = null

  get aborted(): boolean {
    return this.#aborted
  }

  get reason(): unknown {
    return this.#reason
  }

  throwIfAborted(): void {
    if (this.#aborted) throw this.#reason
  }

  [SYM_ABORT](reason?: unknown): void {
    if (this.#aborted) return
    this.#aborted = true
    this.#reason = reason ?? new DOMException('The operation was aborted.', 'AbortError')
    const event = new Event('abort')
    this.onabort?.(event)
    this.dispatchEvent(event)
  }

  static timeout(ms: number): AbortSignal {
    const controller = new AbortController()
    setTimeout(
      () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
      ms
    )
    return controller.signal
  }

  static abort(reason?: unknown): AbortSignal {
    const s = new AbortSignal()
    s[SYM_ABORT](reason)
    return s
  }

  static any(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController()
    for (const s of signals) {
      if (s.aborted) {
        controller.abort(s.reason)
        return controller.signal
      }
      s.addEventListener('abort', () => controller.abort(s.reason), { once: true })
    }
    return controller.signal
  }
}

export class AbortController {
  #signal = new AbortSignal()

  get signal(): AbortSignal {
    return this.#signal
  }

  abort(reason?: unknown): void {
    this.#signal[SYM_ABORT](reason)
  }
}
