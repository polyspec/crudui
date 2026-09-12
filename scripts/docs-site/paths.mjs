export function documentationBasePath(value = '/') {
  if (typeof value !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) {
    throw new Error('DOCS_BASE_PATH must start and end with / and use letters, digits, _ or - in each segment');
  }
  return value;
}

export function documentationUrl(path, basePath) {
  return basePath + path.replace(/^\//, '');
}
