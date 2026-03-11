import { TransformStream } from './streams'

export class TextEncoderStream extends TransformStream<string, Uint8Array> {
  readonly encoding = 'utf-8'

  constructor() {
    const encoder = new TextEncoder()
    super({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(chunk))
      }
    })
  }
}

export class TextDecoderStream extends TransformStream<BufferSource, string> {
  readonly encoding: string
  readonly fatal: boolean
  readonly ignoreBOM: boolean

  constructor(label = 'utf-8', options?: TextDecoderOptions) {
    const decoder = new TextDecoder(label, options)
    super({
      transform(chunk, controller) {
        const input = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk
        controller.enqueue(decoder.decode(input as Uint8Array, { stream: true }))
      },
      flush(controller) {
        const final = decoder.decode()
        if (final) controller.enqueue(final)
      }
    })
    this.encoding = decoder.encoding
    this.fatal = decoder.fatal
    this.ignoreBOM = decoder.ignoreBOM
  }
}
