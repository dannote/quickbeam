const timers = new Map<string, number>()
const counters = new Map<string, number>()

console.debug = console.log

console.trace = (...args: unknown[]) => {
  const err = new Error()
  const stack = err.stack?.split('\n').slice(2).join('\n') ?? ''
  console.log('Trace:', ...args, '\n' + stack)
}

console.assert = (condition?: boolean, ...args: unknown[]) => {
  if (!condition) {
    console.error('Assertion failed:', ...args)
  }
}

console.time = (label = 'default') => {
  timers.set(label, performance.now())
}

console.timeLog = (label = 'default', ...args: unknown[]) => {
  const start = timers.get(label)
  if (start === undefined) {
    console.warn(`Timer '${label}' does not exist`)
    return
  }
  const elapsed = performance.now() - start
  console.log(`${label}: ${elapsed.toFixed(3)}ms`, ...args)
}

console.timeEnd = (label = 'default') => {
  const start = timers.get(label)
  if (start === undefined) {
    console.warn(`Timer '${label}' does not exist`)
    return
  }
  const elapsed = performance.now() - start
  timers.delete(label)
  console.log(`${label}: ${elapsed.toFixed(3)}ms`)
}

console.count = (label = 'default') => {
  const c = (counters.get(label) ?? 0) + 1
  counters.set(label, c)
  console.log(`${label}: ${c}`)
}

console.countReset = (label = 'default') => {
  counters.delete(label)
}

console.dir = (obj: unknown) => {
  try {
    console.log(JSON.stringify(obj, null, 2))
  } catch {
    console.log(String(obj))
  }
}

console.group = (...args: unknown[]) => {
  if (args.length > 0) console.log(...args)
}

console.groupEnd = () => {
  /* noop — no nested group tracking */
}
