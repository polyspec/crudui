export function documentationBasePath(value: unknown = '/'): string {
  if (typeof value !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) {
    throw new Error('DOCS_BASE_PATH must start and end with / and use letters, digits, _ or - in each segment');
  }
  return value;
}

export function documentationUrl(path: string, basePath: string): string {
  return basePath + path.replace(/^\//, '');
}
