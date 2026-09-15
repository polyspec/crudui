import { renderDetail, renderList } from '@crudui/generator-html';

const listBase = {
  columns: {
    name: { field: 'name', label: { ko: '이름', en: 'Name' }, format: { type: 'link', href: '/detail?id={=id}', text: { ko: '상세 보기', en: 'Open detail' } } },
    status: { field: 'status', label: { ko: '상태', en: 'Status' }, format: { type: 'badge', map: { active: 'success', blocked: 'danger' } } },
    joined: { field: 'joined', label: { ko: '가입일', en: 'Joined' }, format: { type: 'date', pattern: 'YYYY-MM-DD' } },
    score: { field: 'score', label: { ko: '점수', en: 'Score' }, format: { type: 'number', decimals: 2, thousands: true, prefix: '$' } },
    relation: { field: 'relation.name', label: { ko: '연관 이름', en: 'Related name' }, format: 'text' },
    avatar: { field: 'avatar', label: { ko: '이미지', en: 'Image' }, format: { type: 'image', width: 32, height: 32, alt: '{=name}.png' } },
    markup: { field: 'markup', label: { ko: 'HTML', en: 'HTML' }, format: 'html' },
  },
  sort: { field: 'name', dir: 'asc' }, pagination: { per_page: 20, mode: 'offset' },
};
const detailBase = {
  fields: {
    id: { field: 'id', label: { ko: '수정', en: 'Edit' }, format: { type: 'link', href: '/form?id={=id}', text: { ko: '폼 열기', en: 'Open form' } } },
    name: { field: 'name', label: { ko: '이름', en: 'Name' }, format: 'text' },
    status: { field: 'status', label: { ko: '상태', en: 'Status' }, format: { type: 'badge', map: { active: 'success', blocked: 'danger' } } },
    joined: { field: 'joined', label: { ko: '가입일', en: 'Joined' }, format: { type: 'date', pattern: 'YYYY-MM-DD' } },
    score: { field: 'score', label: { ko: '점수', en: 'Score' }, format: { type: 'number', decimals: 2, thousands: true, prefix: '$' } },
    relation: { field: 'relation.name', label: { ko: '연관 이름', en: 'Related name' }, format: 'text' },
    markup: { field: 'markup', label: { ko: 'HTML', en: 'HTML' }, format: 'html' },
  },
};
const selectionQuery = ({ lang, server, framework, initialization }) => new URLSearchParams({ lang, server, framework, initialization }).toString();
export function pipelineListSpec(options) {
  const query = selectionQuery(options);
  const spec = structuredClone(listBase);
  spec.columns.name.format.href = `/detail?id={=id}&${query}`;
  return spec;
}
export function pipelineDetailSpec(options) {
  const query = selectionQuery(options);
  const spec = structuredClone(detailBase);
  spec.fields.id.format.href = `/form?id={=id}&${query}`;
  return spec;
}
export function pipelineRecords() { return [
  { id: '1', name: 'Ada', status: 'active', joined: '2026-01-02', score: 1234567.5, relation: { name: 'Northwind' }, avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', markup: '<strong>verified</strong>' },
  { id: '2', name: 'Lin', status: 'blocked', joined: '2026-03-15', score: 42, relation: { name: 'Contoso' }, avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', markup: '<em>review</em>' },
]; }
export function renderPipelineList(records, options) {
  return renderList(pipelineListSpec(options), records, { language: options.lang, layout: 'table', total: records.length });
}
export function renderPipelineDetail(record, options) {
  return renderDetail(pipelineDetailSpec(options), record, { language: options.lang });
}
