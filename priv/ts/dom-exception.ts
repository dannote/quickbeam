export class DOMException extends Error {
  readonly code: number

  constructor(message = '', name = 'Error') {
    super(message)
    this.name = name
    this.code = 0
  }
}
