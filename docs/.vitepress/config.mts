import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { fileURLToPath } from 'node:url';
import { configureRepositoryLinks } from '../../scripts/documentation-links.mjs';

// Disable timestamps to keep generated pages reproducible.
export default withMermaid(defineConfig({
  title: 'CRUDUI',
  description:
    'YAML form specifications, JavaScript/PHP/Go/Rust validation and React/Vue/Svelte rendering',
  lang: 'en-US',
  lastUpdated: false,
  cleanUrls: true,
  markdown: {
    config: md => configureRepositoryLinks(md, fileURLToPath(new URL('../../', import.meta.url))),
  },

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/README' },
      { text: '한국어', link: '/README.ko' },
      { text: 'Specification', link: '/spec/schema' },
      { text: 'Validation', link: '/VALIDATION-RULES' },
      { text: 'API', link: '/api/' },
    ],

    sidebar: [
      {
        text: 'Getting started',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Documentation index', link: '/README' },
          { text: 'Documentation generation', link: '/operations/documentation' },
        ],
      },
      {
        text: 'Specification',
        collapsed: false,
        items: [
          { text: 'Schema structure', link: '/spec/schema' },
          { text: 'Legacy schema', link: '/spec/legacy-schema' },
          { text: 'Form runtime', link: '/spec/form-runtime' },
          { text: 'Feature status', link: '/features' },
          { text: 'Forms', link: '/operations/forms' },
        ],
      },
      {
        text: 'Validation',
        collapsed: false,
        items: [
          { text: 'Validation rules', link: '/VALIDATION-RULES' },
          { text: 'Data validation', link: '/operations/validation' },
        ],
      },
      {
        text: 'Expressions',
        collapsed: false,
        items: [
          { text: 'Expression grammar', link: '/spec/expressions' },
          { text: 'Legacy visibility', link: '/spec/legacy-visibility' },
        ],
      },
      {
        text: 'Tests',
        collapsed: false,
        items: [
          { text: 'Testing guide', link: '/TESTING' },
          { text: 'Test cases', link: '/TEST-CASES' },
        ],
      },
      {
        text: 'Generated API reference',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/api/' },
          { text: 'validator-ts (TS)', link: '/api/validator-ts/' },
          { text: 'generator-core (TS)', link: '/api/generator-core/' },
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
