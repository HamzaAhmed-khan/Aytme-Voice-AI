/**
 * Safe event listener utility to prevent "TypeError: listener must be a function"
 */

export function safeOn(emitter, event, handler) {
  if (!emitter) return;
  if (typeof handler !== 'function') {
    console.error(`[SAFE-EVENT] Invalid handler for event "${event}": expected function, got ${typeof handler}`);
    return;
  }
  
  if (typeof emitter.on === 'function') {
    emitter.on(event, handler);
  } else if (typeof emitter.addEventListener === 'function') {
    emitter.addEventListener(event, handler);
  }
}

export function safeOff(emitter, event, handler) {
  if (!emitter) return;
  if (typeof handler !== 'function') {
    return;
  }
  
  if (typeof emitter.off === 'function') {
    emitter.off(event, handler);
  } else if (typeof emitter.removeEventListener === 'function') {
    emitter.removeEventListener(event, handler);
  }
}
