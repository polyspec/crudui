import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

// VitePress site config for Form-Spec.
// Idempotency: lastUpdated is disabled (it embeds git/file mtimes, which break
// reproducible builds). The build output under .vitepress/dist is deterministic
// for identical sources. withMermaid renders ```mermaid fences (the docs/index.md
// architecture diagram) inside the VitePress site too.
export default withMermaid(defineConfig({
  title: 'Form-Spec',
  description:
    'YAML 기반 폼 정의 시스템 — 멀티언어 검증기(JS/PHP/Go/Rust) + 멀티프레임워크 렌더러(React/Vue/Svelte)',
  lang: 'ko-KR',
  lastUpdated: false,
  cleanUrls: true,

  // Auto-generated API trees link between sibling pages with relative paths that
  // VitePress' dead-link checker cannot always resolve (e.g. typedoc README links,
  // and HTML-only php/rust outputs). Do not fail the build on those.
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: '홈', link: '/' },
      { text: '가이드', link: '/README' },
      { text: '스펙', link: '/SPEC' },
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
          { text: '문서 자동생성', link: '/CONTRIBUTING-DOCS' },
        ],
      },
      {
        text: '스펙',
        collapsed: false,
        items: [
          { text: 'YAML 스펙 형식', link: '/SPEC' },
          { text: '필드 키 패턴', link: '/FIELD-KEYS' },
        ],
      },
      {
        text: '검증',
        collapsed: false,
        items: [
          { text: '검증 규칙', link: '/VALIDATION-RULES' },
          { text: 'Validator API', link: '/API' },
        ],
      },
      {
        text: '조건식',
        collapsed: false,
        items: [
          { text: '조건식 파서', link: '/CONDITION-PARSER' },
          { text: '조건부 표시', link: '/DISPLAY-CONDITIONS' },
          { text: '평가 보고서', link: '/EVALUATION' },
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
        text: '사료 (legacy 분석)',
        collapsed: true,
        items: [
          { text: 'Limepie Validate 분석', link: '/LIMEPIE-VALIDATE-ANALYSIS' },
          { text: 'Form Output 비교', link: '/FORM-OUTPUT-COMPARISON' },
        ],
      },
      {
        text: 'API 레퍼런스 (자동생성)',
        collapsed: true,
        items: [
          { text: '개요', link: '/api/' },
          { text: 'validator-js (TS)', link: '/api/validator-js/' },
          { text: 'generator-react (TS)', link: '/api/generator-react/' },
          { text: 'generator-vue (TS)', link: '/api/generator-vue/' },
          { text: 'generator-svelte (TS)', link: '/api/generator-svelte/' },
          { text: 'validator-go (Go)', link: '/api/go' },
          { text: 'validator-rust (Rust)', link: '/api/rust' },
          { text: 'validator-php (PHP)', link: '/api/php' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/yejune/form-spec' }],

    docFooter: { prev: false, next: false },
  },
}));
