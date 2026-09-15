import { renderDetail, renderList } from '@crudui/generator-html';

const listBase = {
  columns: {
    id: { field: 'id', label: { ko: '식별자', en: 'ID' }, design: { class: 'pipeline-align-number' }, format: { type: 'number', thousands: false } },
    name: { field: 'name', label: { ko: '이름', en: 'Name' }, design: { class: 'pipeline-align-text' }, format: { type: 'link', href: '/detail?id={=id}', text: { ko: '상세 보기', en: 'Open detail' } } },
    status: { field: 'status', label: { ko: '상태', en: 'Status' }, design: { class: 'pipeline-align-center' }, format: { type: 'badge', map: { active: 'success', blocked: 'danger' } } },
    joined: { field: 'joined', label: { ko: '가입일', en: 'Joined' }, design: { class: 'pipeline-align-center' }, format: { type: 'date', pattern: 'YYYY-MM-DD' } },
    score: { field: 'score', label: { ko: '점수', en: 'Score' }, design: { class: 'pipeline-align-number' }, format: { type: 'number', thousands: true, prefix: '$' } },
    relation: { field: 'relation.name', label: { ko: '연관 이름', en: 'Related name' }, design: { class: 'pipeline-align-text' }, format: 'text' },
    avatar: { field: 'avatar', label: { ko: '이미지', en: 'Image' }, design: { class: 'pipeline-align-image' }, format: { type: 'image', width: 32, height: 32, alt: '{=name}.png' } },
    markup: { field: 'markup', label: { ko: 'HTML', en: 'HTML' }, design: { class: 'pipeline-align-text' }, format: 'html' },
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
const pipelineAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pipelineNames = ['Ada', 'Lin', 'Mina', 'Noah', 'Olivia', 'Pavel', 'Quinn', 'Ravi', 'Sara', 'Theo', 'Uma', 'Vera', 'Will', 'Xena', 'Yuri', 'Zoe', 'Aria', 'Bora', 'Cleo', 'Dara', 'Eli', 'Finn', 'Gia', 'Hana', 'Iris', 'Joon', 'Kira', 'Luca', 'Maya', 'Nico', 'Owen', 'Pia', 'Rina', 'Sora', 'Tara', 'Uri', 'Vivi', 'Wade', 'Yuna', 'Zane', 'Ari', 'Bea', 'Cory', 'Dina', 'Enzo'];
export function pipelineRecords() {
  return pipelineNames.map((name, index) => ({
    id: String(index + 1), name, status: index % 3 === 1 ? 'blocked' : 'active',
    joined: `2026-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
    score: index === 0 ? 1234567.5 : index === 1 ? 42 : (index + 1) * 125.5,
    relation: { name: ['Northwind', 'Contoso', 'Fabrikam'][index % 3] }, avatar: pipelineAvatar,
    markup: index % 3 === 1 ? '<em>review</em>' : '<strong>verified</strong>',
  }));
}
export function renderPipelineList(records, options) {
  return renderList(pipelineListSpec(options), records, { language: options.lang, layout: 'table', page: options.page, total: options.total ?? records.length });
}
export function renderPipelineDetail(record, options) {
  return renderDetail(pipelineDetailSpec(options), record, { language: options.lang });
}
