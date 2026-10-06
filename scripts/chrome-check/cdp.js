// A minimal Chrome DevTools Protocol client over Node's built-in WebSocket.

/**
 * @param {number} port - Chrome's remote-debugging port
 */
export async function connect(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  /** Every event Chrome sent, in order (execution contexts are looked up from these). */
  const events = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(String(message.data));
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else events.push(data);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  /** @param {string} method @param {object} [params] @param {string} [sessionId] */
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (reply) =>
        reply.error
          ? reject(new Error(`${method}: ${reply.error.message}`))
          : resolve(reply.result),
      );
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  /** @param {string} targetId @returns {Promise<string>} a flat session id */
  const attach = async (targetId) =>
    (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;

  /**
   * Evaluates an expression and returns its value; throws with the page's own error.
   * @param {string} expression @param {string} sessionId @param {number} [contextId]
   */
  const evaluate = async (expression, sessionId, contextId) => {
    const params = { expression, awaitPromise: true, returnByValue: true, contextId };
    const result = await send('Runtime.evaluate', params, sessionId);
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`${expression.slice(0, 60)}…: ${String(text).split('\n')[0]}`);
    }
    return result.result.value;
  };

  return { send, attach, evaluate, events, close: () => ws.close() };
}

/** @typedef {Awaited<ReturnType<typeof connect>>} Cdp */

export const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
