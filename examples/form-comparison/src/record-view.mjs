// The browser-safe part of the record resource (docs/spec/form-comparison.md, "Record resource"
// and "Canonical page"): the page selection, the links the list and detail carry and the form data
// of one record. The canonical page and the record contract read these rules from here.

export const recordServers = Object.freeze(['js', 'php', 'php-ext', 'go', 'rust']);
export const recordClients = Object.freeze(['html', 'react', 'vue', 'svelte']);
export const recordInitializations = Object.freeze(['csr', 'ssr']);
export const recordModes = Object.freeze(['bindForm', 'createForm']);
export const recordLanguages = Object.freeze(['ko', 'en']);
export const recordViews = Object.freeze(['list', 'detail', 'form']);
export const recordsPerPage = 20;

/** The selection members in query order, with the default of each missing member. */
export const selectionDefaults = Object.freeze({
  lang: 'ko', server: 'js', framework: 'html', initialization: 'csr', mode: 'bindForm', page: 1,
});

/**
 * The selection query every generated link carries, in this member order. `id` precedes it on
 * detail and form links; `saved` follows it on the list address after a save.
 */
export function selectionQuery({ lang, server, framework, initialization, mode, page }) {
  return new URLSearchParams({ lang, server, framework, initialization, mode, page: String(page) }).toString();
}

/** A copy of the specifications with the selection query appended to every list and detail link. */
export function linkedSpecs(specs, selection) {
  const linked = structuredClone(specs);
  const query = selectionQuery(selection);
  for (const member of [...Object.values(linked.list.columns), ...Object.values(linked.detail.fields)]) {
    if (member.format?.type === 'link') member.format.href = `${member.format.href}&${query}`;
  }
  return linked;
}

/** The form data of one stored record: every member as text, without the avatar. */
export function formData(record) {
  return {
    id: record.id, name: record.name, status: record.status, joined: record.joined,
    score: String(record.score), relation: { name: record.relation.name }, markup: record.markup,
    companies: structuredClone(record.companies),
  };
}
