#!/usr/bin/env python3
"""Verify the keyed JSON contract using an explicit ordered-json checkout."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
REVISION = 'deb1b354da845e4c44d1e35c28c77bdb02ec174b'
LANGUAGES = ['js', 'php', 'php-native', 'go', 'rust']


class ObjectPairs(list):
    pass


class NumberToken(str):
    pass


def tree(value):
    if isinstance(value, ObjectPairs):
        return ['object', [[key, tree(child)] for key, child in value]]
    if isinstance(value, list):
        return ['array', [tree(child) for child in value]]
    if isinstance(value, NumberToken):
        return ['number', str(value)]
    if isinstance(value, str):
        return ['string', value]
    if value is None:
        return ['null']
    return ['boolean', value]


def document_tree(source):
    return tree(json.loads(source, object_pairs_hook=ObjectPairs,
                           parse_int=NumberToken, parse_float=NumberToken))


def key(sequence):
    return f'__{sequence:013d}__'


def store(sequence):
    return {'name': f'Store {sequence}', 'enabled': '1', 'detail': '',
            'title': {'ko': '서울', 'en': 'Seoul'},
            'departments': {key(sequence): {'name': 'Sales'}}}


def fixtures():
    companies = {key(seq): {'name': f'Company {seq}', 'stores': {key(seq): store(seq)}}
                 for seq in [5, 7, 1]}
    original = {'form': {'companies': companies}}
    inserted = deepcopy(companies)
    temporary = '__abcde01234567__'
    inserted = dict(list(inserted.items())[:2] + [
        (temporary, {'name': '', 'stores': {}}),
    ] + list(inserted.items())[2:])
    copied = deepcopy(companies)
    copied_row = deepcopy(companies[key(7)])
    copied_store = copied_row['stores'].pop(key(7))
    copied_store['departments'] = {'__abcde01234569__': {'name': 'Sales'}}
    copied_row['stores']['__abcde01234568__'] = copied_store
    copied[temporary] = copied_row
    saved = {key(8) if name == temporary else name: row for name, row in inserted.items()}
    nested = {'form': {'companies': {key(5): {
        'name': 'Company 5', 'stores': {key(seq): store(seq) for seq in [5, 7, 1]},
    }}}}
    nested['form']['companies'][key(5)]['stores'][key(7)]['departments'] = {}
    values = {
        'saved-keys': original,
        'nested-order-and-empty': nested,
        'inserted-after-7': {'form': {'companies': inserted}},
        'copied-descendants': {'form': {'companies': copied}},
        'saved-key-replacement': {'form': {'companies': saved}},
        'reordered-rows': {'form': {'companies': {key(seq): companies[key(seq)] for seq in [1, 5, 7]}}},
        'empty-companies': {'form': {'companies': {}}},
        'object-array-types': {'object': {}, 'array': [], 'items': [{}, [], {'name': ''}]},
    }
    result = {name: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
              for name, value in values.items()}
    result['numeric-members'] = '{"5":"five","7":"seven","1":"one"}'
    result['nested-numeric-members'] = '{"rows":[{"5":{"7":{},"1":[]},"7":false,"1":null}]}'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkout', type=Path, help='Explicit ordered-json repository path')
    args = parser.parse_args()
    checkout = args.checkout.resolve()
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
    if revision != REVISION:
        parser.error(f'Expected ordered-json commit {REVISION}; received {revision}')
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=checkout, text=True).strip():
        parser.error('The ordered-json checkout must have no source changes')

    module_spec = importlib.util.spec_from_file_location('ordered_json_verifier', checkout / 'scripts/verify.py')
    verifier = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(verifier)
    commands = verifier.commands(LANGUAGES)
    report = {'generatedAt': datetime.now(timezone.utc).isoformat(),
              'orderedJsonCommit': revision,
              'cruduiCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'runnerSha256': sha256(Path(__file__).read_bytes()).hexdigest(),
              'scope': 'JSON processor parsing, serialization and reconstruction; no runtime integration',
              'results': []}
    failed = False
    with tempfile.TemporaryDirectory(prefix='crudui-json-cases-') as directory:
        cases = fixtures()
        report['fixtureSha256'] = {name: sha256(source.encode('utf-8')).hexdigest()
                                  for name, source in cases.items()}
        paths = []
        for name, source in cases.items():
            path = Path(directory) / f'{name}.json'
            path.write_text(source, encoding='utf-8')
            paths.append(str(path))
        for language, command in commands.items():
            process = subprocess.run(command, input='\n'.join(paths) + '\n', text=True,
                                     capture_output=True, timeout=60)
            if process.returncode or process.stderr:
                raise RuntimeError(f'{language} processor failed: {process.stderr}')
            lines = process.stdout.rstrip('\n').split('\n')
            if len(lines) != len(cases):
                raise RuntimeError(f'{language}: expected {len(cases)} responses, received {len(lines)}')
            for (name, source), line in zip(cases.items(), lines):
                result = {'language': language, 'case': name, 'passed': False}
                try:
                    actual = json.loads(line)
                    expected = document_tree(source)
                    if actual.get('ok') is not True or actual.get('tree') != expected:
                        raise AssertionError('Parsed order, types or values differ')
                    for output in ['serialized', 'compact', 'rebuilt']:
                        if document_tree(actual[output]) != expected:
                            raise AssertionError(f'{output}: order, types or values differ')
                    result['passed'] = True
                except (AssertionError, KeyError, ValueError) as error:
                    result['error'] = str(error)
                    failed = True
                report['results'].append(result)
            passed = sum(row['passed'] for row in report['results'] if row['language'] == language)
            print(f'{language}: {passed}/{len(cases)} JSON contract cases passed', flush=True)

    output = ROOT / '.verification/ordered-json'
    output.mkdir(parents=True, exist_ok=True)
    stamp = report['generatedAt'].replace(':', '-')
    path = output / f'ordered-json-{stamp}.json'
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Report: {path.relative_to(ROOT)}')
    if failed:
        for result in report['results']:
            if not result['passed']:
                print(f"FAIL {result['language']}/{result['case']}: {result['error']}")
        raise SystemExit(1)


if __name__ == '__main__':
    main()
