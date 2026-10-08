"""The shared validation fixtures against the Python validator.

Every case of `tests/fixtures/validate/cases.json` runs through `validate`:
a result case reproduces the recorded `{ valid, errors, hidden }` exactly, and
a failure case throws the recorded `{ code, message, at }` record.
"""

import unittest
from pathlib import Path

sys_path_prefix = str(Path(__file__).resolve().parents[1] / 'src')

from conformance import ROOT, cases_of, failure_record  # noqa: E402


def _load_validator():
    import sys

    if sys_path_prefix not in sys.path:
        sys.path.insert(0, sys_path_prefix)
    from polyspec.crudui import validator

    return validator


validator = _load_validator()


class ValidateConformance(unittest.TestCase):
    """Result cases reproduce {valid, errors, hidden}; failures throw the exact record."""

    def setUp(self):
        self.cases = cases_of('validate')
        self.result_cases = [case for case in self.cases if 'expected' in case]
        self.failure_cases = [case for case in self.cases if 'expectFailure' in case]

    def run_case(self, case):
        options = {'files': case['files']} if case.get('files') else {}
        return validator.validate(case['spec'], case['data'], options)

    def test_every_case_declares_exactly_one_expectation(self):
        for case in self.cases:
            exclusive = ('expected' in case) != ('expectFailure' in case)
            self.assertTrue(
                exclusive, f"{case['name']} must declare exactly one of expected or expectFailure"
            )
        self.assertGreater(len(self.cases), 0)

    def test_result_cases_reproduce_the_expected_result(self):
        self.assertEqual(len(self.cases), 309)
        self.assertEqual(len(self.result_cases), 178)
        for case in self.result_cases:
            with self.subTest(case=case['name']):
                self.assertEqual(self.run_case(case), case['expected'])

    def test_load_and_input_failures_throw_the_exact_record(self):
        self.assertEqual(len(self.failure_cases), 131)
        for case in self.failure_cases:
            with self.subTest(case=case['name']):
                thrown = None
                try:
                    self.run_case(case)
                except Exception as error:  # noqa: BLE001 - the record names the failure
                    thrown = error
                self.assertIsNotNone(
                    failure_record(thrown), f"{case['name']} must throw a validation failure"
                )
                self.assertEqual(failure_record(thrown), case['expectFailure'])


if __name__ == '__main__':
    unittest.main()
