const rows = [
  { id: 1, name: 'Ada', status: 'active', joined: '2026-01-02T09:00:00', score: 1234567.5 },
  { id: 2, name: 'Lin', status: 'blocked', joined: '2026-03-15T12:00:00', score: 42 },
];
const listSpec = { columns: {
  name: { field: 'name', label: { ko: '이름', en: 'Name' } },
  status: { field: 'status', label: { ko: '상태', en: 'Status' }, format: { type: 'badge', map: { active: 'success', blocked: 'danger' } } },
  joined: { field: 'joined', label: 'Joined', format: { type: 'date', pattern: 'YYYY-MM-DD' } },
  score: { field: 'score', label: 'Score', format: { type: 'number', decimals: 2, thousands: true, prefix: '$' } },
} };
const detailSpec = { fields: {
  name: { field: 'name', label: { ko: '이름', en: 'Name' } },
  status: { field: 'status', label: { ko: '상태', en: 'Status' } },
  joined: { field: 'joined', label: 'Joined' },
  score: { field: 'score', label: 'Score' },
} };
const record = { ...rows[0] };

async function post(path, body) {
  const response = await fetch(`/displays${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`display request failed: ${response.status}`);
  return response.json();
}
function htmlResult(result) {
  const entry = result?.results?.find(item => item.fw === 'html');
  if (!entry?.ok) throw new Error(entry?.error?.message || 'HTML renderer failed');
  return entry.html;
}
async function load() {
  try {
    const [list, detail] = await Promise.all([
      post('/api/render-list', { listSpec, rows, options: { language: 'ko' } }),
      post('/api/render-detail', { detailSpec, record, options: { language: 'ko' } }),
    ]);
    document.querySelector('#list-output').innerHTML = htmlResult(list);
    document.querySelector('#detail-output').innerHTML = htmlResult(detail);
    document.querySelector('#list-status').textContent = 'HTML renderer';
    document.querySelector('#detail-status').textContent = 'HTML renderer';
  } catch (error) {
    const node = document.querySelector('#error'); node.textContent = error.message; node.hidden = false;
    document.querySelector('#list-status').textContent = 'failed'; document.querySelector('#detail-status').textContent = 'failed';
  }
}
for (const [button, panel] of [['#list-tab', '#list-panel'], ['#detail-tab', '#detail-panel']]) {
  document.querySelector(button).addEventListener('click', () => {
    const list = button === '#list-tab';
    document.querySelector('#list-tab').setAttribute('aria-selected', String(list));
    document.querySelector('#detail-tab').setAttribute('aria-selected', String(!list));
    document.querySelector('#list-panel').hidden = !list;
    document.querySelector('#detail-panel').hidden = list;
  });
}
load();
