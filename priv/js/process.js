(() => {
  // priv/ts/process.ts
  var monitorCallbacks = new Map;
  var monitorIdCounter = 0;
  var userMessageHandler = null;
  var originalOnMessage = Process.onMessage.bind(Process);
  Process.monitor = (pid, callback) => {
    const id = ++monitorIdCounter;
    monitorCallbacks.set(id, callback);
    const ref = beam.callSync("__process_monitor", pid, id);
    return ref;
  };
  Process.demonitor = (ref) => {
    const id = beam.callSync("__process_demonitor", ref);
    if (typeof id === "number") {
      monitorCallbacks.delete(id);
    }
  };
  Process.onMessage = (handler) => {
    if (typeof handler !== "function") {
      throw new TypeError("Process.onMessage requires a function argument");
    }
    userMessageHandler = handler;
  };
  originalOnMessage((msg) => {
    if (Array.isArray(msg) && msg.length === 3 && msg[0] === "__qb_down") {
      const [, id, reason] = msg;
      const cb = monitorCallbacks.get(id);
      if (cb) {
        monitorCallbacks.delete(id);
        cb(reason);
      }
      return;
    }
    if (userMessageHandler) {
      userMessageHandler(msg);
    }
  });
})();
