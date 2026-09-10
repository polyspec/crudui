function operationName(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Action completion requires an operation name');
  }
  return value;
}

/** Connect a reserved UI operation to its exact asynchronous completion. */
export function createActionCompletion() {
  let sequence = 0;
  const records = new Map();

  function next(name) {
    const id = ++sequence;
    records.set(id, { name: operationName(name), status: 'reserved' });
    return id;
  }

  function finish(record, status, value) {
    if (record.status !== 'running') throw new Error('Action completion is not running');
    record.status = status;
    record.value = value;
    if (!record.waiter) return;
    if (status === 'completed') record.waiter.resolve(value);
    else record.waiter.reject(value);
  }

  function begin(name) {
    const operation = operationName(name);
    const record = [...records.values()].find(item =>
      item.name === operation && item.status === 'reserved');
    if (!record) return undefined;
    record.status = 'running';
    return {
      complete: value => finish(record, 'completed', value),
      fail: error => finish(record, 'failed',
        error instanceof Error ? error : new Error(String(error))),
    };
  }

  function cancel(id) {
    if (!Number.isSafeInteger(id) || !records.has(id)) return false;
    const record = records.get(id);
    if (record.status !== 'reserved') return false;
    records.delete(id);
    return true;
  }

  function completion(id) {
    if (!Number.isSafeInteger(id) || !records.has(id)) {
      return Promise.reject(new Error(`Unknown action completion: ${id}`));
    }
    const record = records.get(id);
    if (record.status === 'completed') {
      records.delete(id);
      return Promise.resolve(record.value);
    }
    if (record.status === 'failed') {
      records.delete(id);
      return Promise.reject(record.value);
    }
    if (record.waiter) {
      return Promise.reject(new Error(`Action completion already has a waiter: ${id}`));
    }
    const result = new Promise((resolve, reject) => { record.waiter = { resolve, reject }; });
    return result.finally(() => records.delete(id));
  }

  return { next, begin, cancel, completion };
}
