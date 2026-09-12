#!/usr/bin/env node
/** Dispatch describe, list-widgets, check and explain using the tsx loader. */

import process from 'node:process';

async function main() {
  const [, , cmd, ...rest] = process.argv;

  switch (cmd) {
    case 'describe': {
      const { describe, renderJson, renderMarkdown } = await import('../src/describe.ts');
      const r = describe();
      const md = rest.includes('--md');
      process.stdout.write((md ? renderMarkdown(r) : renderJson(r)) + '\n');
      return;
    }
    case 'list-widgets': {
      const { describe } = await import('../src/describe.ts');
      const r = describe();
      if (rest.includes('--json')) {
        process.stdout.write(JSON.stringify(r.widgets, null, 2) + '\n');
      } else {
        for (const w of r.widgets) {
          const aliases = w.aliases.length ? ` (${w.aliases.join(', ')})` : '';
          process.stdout.write(`${w.kind}\t${w.layout}${aliases}\n`);
        }
      }
      return;
    }
    case 'check': {
      const { runCheck } = await import('../src/check.ts');
      const out = await runCheck(rest[0]);
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      process.exitCode = out.ok ? 0 : 1;
      return;
    }
    case 'explain': {
      const { explainFile } = await import('../src/explain.ts');
      const langIdx = rest.indexOf('--lang');
      const lang = langIdx >= 0 && rest[langIdx + 1] === 'en' ? 'en' : 'ko';
      const file = rest.find((a) => !a.startsWith('--') && a !== 'ko' && a !== 'en');
      process.stdout.write(explainFile(file, { lang }) + '\n');
      return;
    }
    case 'manifest': {
      const { loadManifest, renderManifestMarkdown } = await import('../src/manifest.ts');
      const manifest = loadManifest();
      process.stdout.write((rest.includes('--md') ? renderManifestMarkdown(manifest) : JSON.stringify(manifest, null, 2)) + '\n');
      return;
    }
    case undefined:
    case '--help':
    case '-h':
    case 'help': {
      process.stdout.write(USAGE);
      return;
    }
    default: {
      process.stderr.write(`unknown subcommand: ${cmd}\n\n${USAGE}`);
      process.exitCode = 2;
    }
  }
}

const USAGE = `crudui <subcommand>

  describe [--json|--md]   unified capabilities from code/schema (default --json)
  list-widgets [--json]    widget kinds + layout + aliases
  check <spec.{yml,json}>  meta-schema + forbidden-scan
  explain <spec> [--lang ko|en]  spec → natural-language back-check
  manifest [--json|--md]       executable contract manifest

Run through the tsx loader: node --import tsx bin/crudui.mjs <subcommand>
`;

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exitCode = 1;
});
