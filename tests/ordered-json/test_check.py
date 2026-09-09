"""Check that the processor comparison rejects incomplete and incorrect evidence."""
import importlib.util
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('crudui_ordered_json_check', Path(__file__).with_name('check.py'))
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


def response(source):
    return {'ok': True, 'raw': source, 'tree': CHECK.document_tree(source),
            'serialized': source, 'compact': source, 'rebuilt': source}


class ProcessorCheckTest(unittest.TestCase):
    def test_complete_ordered_responses_are_accepted(self):
        for name, source in CHECK.fixtures().items():
            with self.subTest(case=name):
                CHECK.check_response(source, json.dumps(response(source)))

    def test_changed_order_types_and_source_are_rejected(self):
        source = '{"5":{},"7":[],"1":null}'
        for key, value in [('raw', ' ' + source), ('serialized', '{"7":[],"5":{},"1":null}'),
                           ('compact', '{"5":[],"7":[],"1":null}'),
                           ('rebuilt', '{"5":{},"7":[],"1":false}'), ('tree', [])]:
            with self.subTest(field=key):
                actual = response(source)
                actual[key] = value
                with self.assertRaises(AssertionError):
                    CHECK.check_response(source, json.dumps(actual))

    def test_process_failures_and_response_count_errors_fail_every_case(self):
        cases = {'object': '{}', 'array': '[]'}
        valid = '\n'.join(json.dumps(response(source)) for source in cases.values()) + '\n'
        processes = [
            SimpleNamespace(returncode=1, stdout=valid, stderr=''),
            SimpleNamespace(returncode=0, stdout=valid, stderr='warning'),
            SimpleNamespace(returncode=0, stdout='', stderr=''),
            SimpleNamespace(returncode=0, stdout=valid + '\n', stderr=''),
        ]
        for process in processes:
            with self.subTest(process=process), patch.object(CHECK.subprocess, 'run', return_value=process):
                result = CHECK.run_adapter('php-extension', ['probe'], cases, ['a', 'b'], Path('.'))
                self.assertEqual(len(result), 2)
                self.assertTrue(all(row['passed'] is False and row['error'] for row in result))
        for error in [FileNotFoundError('Missing executable'), subprocess.TimeoutExpired('probe', 60)]:
            with self.subTest(error=error), patch.object(CHECK.subprocess, 'run', side_effect=error):
                result = CHECK.run_adapter('php-extension', ['probe'], cases, ['a', 'b'], Path('.'))
                self.assertEqual(len(result), 2)
                self.assertTrue(all(row['passed'] is False and row['error'] for row in result))

    def test_malformed_response_fails_without_removing_other_results(self):
        cases = {'object': '{}', 'array': '[]'}
        process = SimpleNamespace(returncode=0, stdout='[]\n' + json.dumps(response('[]')) + '\n', stderr='')
        with patch.object(CHECK.subprocess, 'run', return_value=process):
            result = CHECK.run_adapter('js', ['probe'], cases, ['a', 'b'], Path('.'))
        self.assertEqual([row['passed'] for row in result], [False, True])

    def test_missing_or_duplicate_implementation_results_are_incomplete(self):
        cases = CHECK.fixtures()
        complete = [{'language': language, 'case': case, 'passed': True}
                    for language in CHECK.LANGUAGES for case in cases]
        self.assertTrue(CHECK.complete_results(complete, cases))
        self.assertFalse(CHECK.complete_results(complete[:-1], cases))
        self.assertFalse(CHECK.complete_results(complete[:-1] + [complete[0]], cases))
        self.assertFalse(CHECK.complete_results([row for row in complete if row['language'] != 'php-extension'], cases))


if __name__ == '__main__':
    unittest.main()
