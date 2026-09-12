#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const manifest = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8'));
const rows = manifest.features.map((feature) => {
  const support = Object.entries(feature.support).map(([name, status]) => `${name}: ${status}`).join('<br>');
  return `| \`${feature.id}\` | ${feature.status} | \`${feature.owner}\` | ${support} | ${feature.verification.length} command(s) |`;
}).join('\n');
const english = `# Feature contracts

[한국어](feature-contracts.ko.md).

This page is generated from [contracts/features.json](../../contracts/features.json). Each feature connects its input, output, state, errors, support status, fixtures, executable tests and documentation. \`planned\` and \`partial\` are incomplete states.

| Feature | Status | Owner package | Support status | Verification |
| --- | --- | --- | --- | --- |
${rows}

Run \`npm run manifest:check\` to validate structure and links. Run \`npm run manifest:test\` to execute the declared test commands.
`;
const korean = `# 기능 계약

[English](feature-contracts.md).

이 페이지는 [contracts/features.json](../../contracts/features.json)에서 생성합니다. 각 기능은 입력, 출력, 상태, 오류, 지원 상태, fixture, 실행 테스트와 문서를 연결합니다. \`planned\`와 \`partial\`은 미완료 상태입니다.

| 기능 | 상태 | 담당 패키지 | 지원 상태 | 검증 명령 |
| --- | --- | --- | --- | --- |
${rows}

구조와 연결은 \`npm run manifest:check\`로 검사하고, 선언된 테스트 명령은 \`npm run manifest:test\`로 실행합니다.
`;
const outputs = [['docs/spec/feature-contracts.md', english], ['docs/spec/feature-contracts.ko.md', korean]];
const check = process.argv.includes('--check');
for (const [relative, expected] of outputs) {
  const path = resolve(root, relative);
  if (check) {
    const actual = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    if (actual !== expected) {
      process.stderr.write(`feature docs: generated document is stale: ${relative}\n`);
      process.exitCode = 1;
    }
  } else writeFileSync(path, expected);
}
if (!check) process.stdout.write(`feature docs: generated ${outputs.length} pages\n`);
