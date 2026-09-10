import assert from 'node:assert/strict';
import test from 'node:test';

import { subscribeMainPageReadiness } from './main-page-readiness.mjs';

class PageFixture {
  #listeners = new Map();

  async exposeFunction(name, callback) {
    this.exposed = { name, callback };
  }

  async evaluateOnNewDocument(callback) {
    this.initializer = callback;
  }

  on(name, listener) {
    const listeners = this.#listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(name, listeners);
    return this;
  }

  once(name, listener) {
    const once = value => {
      this.off(name, once);
      listener(value);
    };
    return this.on(name, once);
  }

  off(name, listener) {
    this.#listeners.get(name)?.delete(listener);
    return this;
  }

  emit(name, value) {
    for (const listener of [...(this.#listeners.get(name) ?? [])]) listener(value);
  }
}

async function immediateOutcome(promise) {
  let outcome = { status: 'pending' };
  promise.then(value => { outcome = { status: 'resolved', value }; },
    error => { outcome = { status: 'rejected', error }; });
  await Promise.resolve();
  return outcome;
}

for (const [event, value, message] of [
  ['pageerror', new Error('Failed to resolve module specifier'),
    /Main page initialization failed: Failed to resolve module specifier/],
  ['error', new Error('Renderer process stopped'),
    /Main page failed: Renderer process stopped/],
  ['close', undefined, /Main page closed before readiness/],
]) {
  test(`rejects main-page readiness after ${event}`, async () => {
    const page = new PageFixture();
    const readiness = await subscribeMainPageReadiness(page);
    page.emit(event, value);
    const outcome = await immediateOutcome(readiness.wait());
    assert.equal(outcome.status, 'rejected');
    assert.match(outcome.error.message, message);
  });
}
