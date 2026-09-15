#!/usr/bin/env python3
"""Verify the keyed JSON contract using an explicit OrderedJSON checkout."""
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
VERSION = '0.0.1'
REVISION = '26c2aebc97896e280d3a6b8f5e8e1d85e2282b83'
PACKAGES = {
    'js': 'js',
    'rust': 'rust',
    'go': 'go',
    'php': 'php',
    'php-extension': 'php-extension',
}
LANGUAGES = ['js', 'php', 'php-extension', 'go', 'rust']


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


def source_revisions(checkout):
    revisions = {}
    for name, expected in {'.': REVISION}.items():
        directory = checkout / name
        root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=directory, text=True).strip()
        if Path(root).resolve() != directory.resolve():
            raise ValueError(f'Missing repository checkout: {name}')
        actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=directory, text=True).strip()
        if actual != expected:
            raise ValueError(f'{name}: expected commit {expected}; received {actual}')
        status = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'], cwd=directory, text=True)
        if status.strip():
            raise ValueError(f'{name}: source changes are not allowed:\n{status}')
        revisions[name] = actual
    return revisions


def check_response(source, line):
    actual = json.loads(line)
    if not isinstance(actual, dict):
        raise AssertionError('Expected a response object')
    expected = document_tree(source)
    if actual.get('ok') is not True or actual.get('tree') != expected:
        raise AssertionError('Parsed order, types or values differ')
    if actual.get('raw') != source:
        raise AssertionError('Original JSON text differs')
    for output in ['serialized', 'compact', 'rebuilt']:
        if document_tree(actual[output]) != expected:
            raise AssertionError(f'{output}: order, types or values differ')


def failed_results(language, cases, error):
    return [{'language': language, 'case': name, 'passed': False, 'error': error}
            for name in cases]


def run_adapter(language, command, cases, paths, checkout):
    try:
        process = subprocess.run(command, input='\n'.join(paths) + '\n', text=True,
                                 capture_output=True, timeout=60, cwd=checkout)
        if process.returncode or process.stderr:
            raise RuntimeError(f'Exit {process.returncode}; stderr: {process.stderr}; stdout: {process.stdout}')
        lines = process.stdout.split('\n')
        if lines and lines[-1] == '':
            lines.pop()
        if len(lines) != len(cases):
            raise RuntimeError(f'Expected {len(cases)} responses; received {len(lines)}')
    except (OSError, subprocess.SubprocessError, RuntimeError) as error:
        return failed_results(language, cases, f'Processor execution failed: {error}')
    results = []
    for (name, source), line in zip(cases.items(), lines):
        result = {'language': language, 'case': name, 'passed': False}
        try:
            check_response(source, line)
            result['passed'] = True
        except (AssertionError, KeyError, ValueError, TypeError, RecursionError) as error:
            result['error'] = str(error)
        results.append(result)
    return results


def complete_results(results, cases):
    expected = {(language, name) for language in LANGUAGES for name in cases}
    actual = [(result['language'], result['case']) for result in results]
    return len(actual) == len(expected) and set(actual) == expected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkout', type=Path, help='Explicit absolute OrderedJSON repository path')
    args = parser.parse_args()
    if not args.checkout.is_absolute():
        parser.error('An absolute OrderedJSON repository path is required')
    checkout = args.checkout.resolve()
    try:
        revisions = source_revisions(checkout)
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        parser.error(str(error))

    report = {'generatedAt': datetime.now(timezone.utc).isoformat(),
              'orderedJsonVersion': VERSION,
              'orderedJsonCommit': revisions['.'],
              'orderedJsonPackages': PACKAGES,
              'cruduiCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'runnerSha256': sha256(Path(__file__).read_bytes()).hexdigest(),
              'scope': 'JSON processor parsing, serialization and reconstruction; no runtime integration',
              'results': []}
    cases = fixtures()
    report['fixtureSha256'] = {name: sha256(source.encode('utf-8')).hexdigest()
                              for name, source in cases.items()}
    module = checkout / 'php-extension/src/modules/ordered_json.so'
    try:
        module_spec = importlib.util.spec_from_file_location('ordered_json_registry', checkout / 'scripts/registry.py')
        registry = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(registry)
        repositories = registry.repository_paths(checkout)
        if set(repositories.values()) != {(checkout / name).resolve() for name in PACKAGES.values()}:
            raise ValueError('The implementation registry must use the five monorepo package paths')
        cache = checkout / '.cache/probes'
        report['buildWarnings'] = registry.prepare(LANGUAGES, repositories, cache)
        commands = registry.adapter_commands(LANGUAGES, repositories, cache)
        if set(commands) != set(LANGUAGES):
            raise ValueError('The registry must provide all five implementation commands')
        report['runtimes'] = registry.runtime_versions(LANGUAGES, repositories, cache)
        report['nativeModuleSha256'] = sha256(module.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory(prefix='crudui-json-cases-') as directory:
            paths = []
            for name, source in cases.items():
                path = Path(directory) / f'{name}.json'
                path.write_text(source, encoding='utf-8')
                paths.append(str(path))
            for language in LANGUAGES:
                results = run_adapter(language, commands[language], cases, paths, checkout)
                report['results'].extend(results)
                passed = sum(result['passed'] for result in results)
                print(f'{language}: {passed}/{len(cases)} JSON contract cases passed', flush=True)
    except Exception as error:
        report['preparationError'] = str(error)
        finished = {result['language'] for result in report['results']}
        for language in LANGUAGES:
            if language not in finished:
                report['results'].extend(failed_results(language, cases, f'Preparation failed: {error}'))
    try:
        if source_revisions(checkout) != revisions:
            raise ValueError('OrderedJSON source revisions changed during verification')
        if sha256(Path(__file__).read_bytes()).hexdigest() != report['runnerSha256']:
            raise ValueError('The CRUDUI checker changed during verification')
        if 'nativeModuleSha256' in report and sha256(module.read_bytes()).hexdigest() != report['nativeModuleSha256']:
            raise ValueError('The native module changed during verification')
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        report['sourceError'] = str(error)

    report['complete'] = complete_results(report['results'], cases)
    report['passed'] = report['complete'] and all(result['passed'] for result in report['results']) and not any(key in report for key in ['preparationError', 'sourceError'])

    output = ROOT / '.verification/ordered-json'
    output.mkdir(parents=True, exist_ok=True)
    stamp = report['generatedAt'].replace(':', '-')
    path = output / f'ordered-json-{stamp}.json'
    with path.open('x', encoding='utf-8') as output_file:
        output_file.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'Report: {path.relative_to(ROOT)}')
    if not report['passed']:
        for result in report['results']:
            if not result['passed']:
                print(f"FAIL {result['language']}/{result['case']}: {result['error']}")
        for error in ['preparationError', 'sourceError']:
            if error in report:
                print(f'FAIL {error}: {report[error]}')
        raise SystemExit(1)


if __name__ == '__main__':
    main()
