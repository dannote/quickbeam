class WebStorage {
  getItem(key: string): string | null {
    return beam.callSync('__storage_get', String(key)) as string | null
  }

  setItem(key: string, value: string): void {
    beam.callSync('__storage_set', String(key), String(value))
  }

  removeItem(key: string): void {
    beam.callSync('__storage_remove', String(key))
  }

  clear(): void {
    beam.callSync('__storage_clear')
  }

  key(index: number): string | null {
    return beam.callSync('__storage_key', index) as string | null
  }

  get length(): number {
    return beam.callSync('__storage_length') as number
  }
}

;(globalThis as Record<string, unknown>).localStorage = new WebStorage()
