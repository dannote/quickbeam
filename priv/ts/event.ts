export const SYM_STOP_IMMEDIATE = Symbol('stopImmediate')

export class Event {
  readonly type: string
  readonly timeStamp: number
  cancelBubble = false
  #stopImmediatePropagationFlag = false
  #defaultPrevented = false

  constructor(type: string) {
    this.type = type
    this.timeStamp = performance.now()
  }

  get defaultPrevented(): boolean {
    return this.#defaultPrevented
  }

  preventDefault(): void {
    this.#defaultPrevented = true
  }

  stopPropagation(): void {
    this.cancelBubble = true
  }

  stopImmediatePropagation(): void {
    this.#stopImmediatePropagationFlag = true
    this.cancelBubble = true
  }

  get [SYM_STOP_IMMEDIATE](): boolean {
    return this.#stopImmediatePropagationFlag
  }
}

export class MessageEvent extends Event {
  readonly data: unknown
  readonly origin: string
  readonly lastEventId: string

  constructor(type: string, init?: { data?: unknown; origin?: string; lastEventId?: string }) {
    super(type)
    this.data = init?.data
    this.origin = init?.origin ?? ''
    this.lastEventId = init?.lastEventId ?? ''
  }
}

export class CloseEvent extends Event {
  readonly code: number
  readonly reason: string
  readonly wasClean: boolean

  constructor(type: string, init?: { code?: number; reason?: string; wasClean?: boolean }) {
    super(type)
    this.code = init?.code ?? 0
    this.reason = init?.reason ?? ''
    this.wasClean = init?.wasClean ?? false
  }
}

export class ErrorEvent extends Event {
  readonly message: string
  readonly error: unknown

  constructor(type: string, init?: { message?: string; error?: unknown }) {
    super(type)
    this.message = init?.message ?? ''
    this.error = init?.error
  }
}
