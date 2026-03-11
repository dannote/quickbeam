import { SYM_STOP_IMMEDIATE } from './event'

import type { AbortSignal } from './abort'
import type { Event } from './event'

export type EventListener = (event: Event) => void

interface EventListenerObject {
  handleEvent(event: Event): void
}

export type EventListenerOrObject = EventListener | EventListenerObject

export interface AddEventListenerOptions {
  once?: boolean
  signal?: AbortSignal
}

interface ListenerEntry {
  callback: EventListenerOrObject
  once: boolean
  signal?: AbortSignal
  _removed?: boolean
}

export class EventTarget {
  #listeners = new Map<string, ListenerEntry[]>()

  addEventListener(
    type: string,
    callback: EventListenerOrObject | null,
    options?: AddEventListenerOptions | boolean
  ): void {
    if (callback === null) return

    const once = typeof options === 'object' ? (options.once ?? false) : false
    const signal = typeof options === 'object' ? options.signal : undefined

    const list = this.#listeners.get(type)
    if (list) {
      for (const entry of list) {
        if (entry.callback === callback) return
      }
    }

    const entry: ListenerEntry = { callback, once, signal }

    if (signal?.aborted) return
    signal?.addEventListener('abort', () => {
      this.removeEventListener(type, callback)
    })

    if (list) {
      list.push(entry)
    } else {
      this.#listeners.set(type, [entry])
    }
  }

  removeEventListener(type: string, callback: EventListenerOrObject | null): void {
    if (callback === null) return
    const list = this.#listeners.get(type)
    if (!list) return

    for (let i = 0; i < list.length; i++) {
      if (list[i].callback === callback) {
        list[i]._removed = true
        list.splice(i, 1)
        break
      }
    }
    if (list.length === 0) this.#listeners.delete(type)
  }

  dispatchEvent(event: Event): boolean {
    const list = this.#listeners.get(event.type)
    if (!list) return !event.defaultPrevented

    const snapshot = list.slice()
    for (const entry of snapshot) {
      if (entry._removed) continue
      if (event[SYM_STOP_IMMEDIATE]) break

      if (typeof entry.callback === 'function') {
        entry.callback(event)
      } else {
        entry.callback.handleEvent(event)
      }

      if (entry.once) {
        this.removeEventListener(event.type, entry.callback)
      }
    }

    return !event.defaultPrevented
  }
}
