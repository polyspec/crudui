const spec = {
  type: 'group',
  properties: {
    companies: {
      type: 'group', label: { en: 'Companies', ko: '회사' },
      multiple: { copy: true, sortable: true, max: 4 },
      validate: { maxcount: 4 },
      properties: {
        name: { type: 'text', label: { en: 'Company name', ko: '회사명' }, validate: { required: true } },
        stores: {
          type: 'group', label: { en: 'Stores', ko: '스토어' },
          multiple: { copy: true, sortable: true, max: 4 },
          validate: { maxcount: 4 },
          properties: {
            name: { type: 'text', label: { en: 'Store name', ko: '스토어명' }, validate: { required: true } },
            enabled: { type: 'checkbox', label: { en: 'Enabled', ko: '사용' }, default: 1 },
            detail: { type: 'textarea', label: { en: 'Notes', ko: '메모' }, design: { show: '.enabled' } },
            title: { type: 'text', label: { en: 'Title', ko: '제목' }, lang: { only: ['ko', 'en'] } },
            departments: {
              type: 'group', label: { en: 'Departments', ko: '부서' }, multiple: true,
              properties: { name: { type: 'text', label: { en: 'Department name', ko: '부서명' } } },
            },
          },
        },
      },
    },
  },
};

export function specFor(mode) {
  const result = structuredClone(spec);
  if (mode === 'original') {
    const company = result.properties.companies.properties;
    company.company_seq = { type: 'hidden' };
    company.stores.properties.store_seq = { type: 'hidden' };
    company.stores.properties.departments.properties.department_seq = { type: 'hidden' };
  }
  return result;
}
