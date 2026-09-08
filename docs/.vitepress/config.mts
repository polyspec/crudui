import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { fileURLToPath } from 'node:url';
import { configureRepositoryLinks } from '../../scripts/documentation-links.mjs';

// VitePress site config for CRUDUI.
// Idempotency: lastUpdated is disabled (it embeds git/file mtimes, which break
// reproducible builds). The build output under .vitepress/dist is deterministic
// for identical sources. withMermaid renders ```mermaid fences (the docs/index.md
// architecture diagram) inside the VitePress site too.
export default withMermaid(defineConfig({
  title: 'CRUDUI',
  description:
    'YAML 기반 폼 정의 시스템 — 멀티언어 검증기(JS/PHP/Go/Rust) + 멀티프레임워크 렌더러(React/Vue/Svelte)',
  lang: 'en-US',
  lastUpdated: false,
  cleanUrls: true,
  markdown: {
    config: md => configureRepositoryLinks(md, fileURLToPath(new URL('../../', import.meta.url))),
  },

  themeConfig: {
    nav: [
      { text: '홈', link: '/' },
      { text: '가이드', link: '/README' },
      { text: '스펙', link: '/spec/schema' },
      { text: '검증', link: '/VALIDATION-RULES' },
      { text: 'API', link: '/api/' },
    ],

    sidebar: [
      {
        text: '시작하기',
        collapsed: false,
        items: [
          { text: '개요 (홈)', link: '/' },
          { text: '문서 색인', link: '/README' },
          { text: '문서 자동생성', link: '/operations/documentation' },
        ],
      },
      {
        text: '스펙',
        collapsed: false,
        items: [
          { text: 'YAML 스펙 형식', link: '/spec/schema' },
          { text: 'Form runtime', link: '/spec/form-runtime' },
          { text: 'Feature status', link: '/features' },
          { text: 'Forms', link: '/operations/forms' },
        ],
      },
      {
        text: '검증',
        collapsed: false,
        items: [
          { text: '검증 규칙', link: '/VALIDATION-RULES' },
          { text: 'Data validation', link: '/operations/validation' },
        ],
      },
      {
        text: '조건식',
        collapsed: false,
        items: [
          { text: 'Expression grammar', link: '/spec/expressions' },
          { text: '조건부 표시', link: '/DISPLAY-CONDITIONS' },
        ],
      },
      {
        text: '테스트',
        collapsed: false,
        items: [
          { text: '테스트 가이드', link: '/TESTING' },
          { text: '테스트 케이스', link: '/TEST-CASES' },
        ],
      },
      {
        text: 'API 레퍼런스 (자동생성)',
        collapsed: true,
        items: [
          { text: '개요', link: '/api/' },
          { text: 'validator-ts (TS)', link: '/api/validator-ts/' },
          { text: 'generator-react (TS)', link: '/api/generator-react/' },
          { text: 'generator-vue (TS)', link: '/api/generator-vue/' },
          { text: 'generator-svelte (TS)', link: '/api/generator-svelte/' },
          { text: 'validator-go (Go)', link: '/api/go' },
          { text: 'validator-rust (Rust)', link: '/api/rust' },
          { text: 'validator-php (PHP)', link: '/api/php' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/crudui/crudui' }],

    docFooter: { prev: false, next: false },
  },
}));
