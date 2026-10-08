"""The shared structure-validity fixtures against the Python validators.

`tests/fixtures/spec-validity/cases.json` runs each specification through
`validate` with empty data: an `engine: "pass"` case returns the clean result
and an `engine: {code, at}` case raises `ComposeLoadError` with that code and
dotted trace. The list and detail groups run the same contract through
`validateList` and `validateDetail`.
"""

import sys
import unittest
from pathlib import Path

SOURCE = str(Path(__file__).resolve().parents[1] / 'src')
if SOURCE not in sys.path:
    sys.path.insert(0, SOURCE)

from conformance import cases_of, Proving  # noqa: E402
from polyspec.crudui.validator import (  # noqa: E402
    ComposeLoadError,
    validate,
    validateDetail,
    validateList,
)


def options_of(case):
    return {'files': case['files']} if case.get('files') else {}


class SpecValidityConformance(unittest.TestCase):
    """A forbidden meta key at any depth is a load failure; a clean spec validates empty data."""

    def setUp(self):
        self.cases = cases_of('spec-validity')
        self.clean = [case for case in self.cases if case['engine'] == 'pass']
        self.failing = [case for case in self.cases if isinstance(case['engine'], dict)]

    def run_case(self, case):
        # Data is irrelevant to the scan; the scan runs in the load path before
        # any data-driven validation.
        return validate(case['spec'], {}, options_of(case))

    def test_every_case_declares_an_engine_expectation(self):
        for case in self.cases:
            engine = case['engine']
            ok = engine == 'pass' or (
                isinstance(engine, dict) and isinstance(engine.get('code'), str) and isinstance(engine.get('at'), str)
            )
            self.assertTrue(ok, f"{case['name']} must declare engine: pass or code and at")
        self.assertEqual(len(self.cases), 34)

    def test_clean_specs_pass_the_load_path(self):
        self.assertEqual(len(self.clean), 20)
        for case in self.clean:
            with self.subTest(case=case['name']), Proving(['validate'], 'tests/fixtures/spec-validity/cases.json', case['name']) as proof:
                self.assertEqual(
                    self.run_case(case), {'valid': True, 'errors': [], 'hidden': []}
                )
                proof.passed = True

    def test_a_forbidden_meta_key_at_any_depth_is_a_load_error(self):
        self.assertEqual(len(self.failing), 14)
        for case in self.failing:
            with self.subTest(case=case['name']), Proving(['validate'], 'tests/fixtures/spec-validity/cases.json', case['name']) as proof:
                thrown = None
                try:
                    self.run_case(case)
                except ComposeLoadError as error:
                    thrown = error
                self.assertIsNotNone(thrown, f"{case['name']} must fail to load")
                self.assertEqual(thrown.code, case['engine']['code'])
                # The depth is load-bearing, so the dotted trace is asserted, not
                # just the code.
                self.assertEqual('.'.join(thrown.trace), case['engine']['at'])
                proof.passed = True


class ListValidityConformance(unittest.TestCase):
    """A list specification loads clean or raises the recorded load failure."""

    def setUp(self):
        self.cases = cases_of('list-validity')
        self.clean = [case for case in self.cases if case['engine'] == 'pass']
        self.failing = [case for case in self.cases if isinstance(case['engine'], dict)]

    def run_case(self, case):
        return validateList(case['spec'], options_of(case))

    def test_every_case_declares_an_engine_expectation(self):
        for case in self.cases:
            engine = case['engine']
            ok = engine == 'pass' or (
                isinstance(engine, dict) and isinstance(engine.get('code'), str) and isinstance(engine.get('at'), str)
            )
            self.assertTrue(ok, f"{case['name']} must declare engine: pass or code and at")
        self.assertEqual(len(self.cases), 20)

    def test_clean_specs_load_without_validating_rows(self):
        self.assertEqual(len(self.clean), 16)
        for case in self.clean:
            with self.subTest(case=case['name']), Proving(['validateList'], 'tests/fixtures/list-validity/cases.json', case['name']) as proof:
                # A meta-schema-only invalid case (required, enum,
                # additionalProperties, anyOf) is the meta-schema's job, never
                # this engine's, so it loads clean here.
                self.assertEqual(
                    self.run_case(case), {'valid': True, 'errors': []}
                )
                proof.passed = True

    def test_failing_specs_raise_the_recorded_load_failure(self):
        self.assertEqual(len(self.failing), 4)
        for case in self.failing:
            with self.subTest(case=case['name']), Proving(['validateList'], 'tests/fixtures/list-validity/cases.json', case['name']) as proof:
                thrown = None
                try:
                    self.run_case(case)
                except ComposeLoadError as error:
                    thrown = error
                self.assertIsNotNone(thrown, f"{case['name']} must fail to load")
                self.assertEqual(thrown.code, case['engine']['code'])
                self.assertEqual('.'.join(thrown.trace), case['engine']['at'])
                proof.passed = True


class DetailValidityConformance(unittest.TestCase):
    """A detail specification loads clean or raises the recorded load failure."""

    def setUp(self):
        self.cases = cases_of('detail-validity')
        self.clean = [case for case in self.cases if case['engine'] == 'pass']
        self.failing = [case for case in self.cases if isinstance(case['engine'], dict)]

    def run_case(self, case):
        return validateDetail(case['spec'], options_of(case))

    def test_every_case_declares_an_engine_expectation(self):
        for case in self.cases:
            engine = case['engine']
            ok = engine == 'pass' or (
                isinstance(engine, dict) and isinstance(engine.get('code'), str) and isinstance(engine.get('at'), str)
            )
            self.assertTrue(ok, f"{case['name']} must declare engine: pass or code and at")
        self.assertEqual(len(self.cases), 13)

    def test_clean_specs_load_without_validating_the_record(self):
        self.assertEqual(len(self.clean), 6)
        for case in self.clean:
            with self.subTest(case=case['name']), Proving(['validateDetail'], 'tests/fixtures/detail-validity/cases.json', case['name']) as proof:
                self.assertEqual(
                    self.run_case(case), {'valid': True, 'errors': []}
                )
                proof.passed = True

    def test_failing_specs_raise_the_recorded_load_failure(self):
        self.assertEqual(len(self.failing), 7)
        for case in self.failing:
            with self.subTest(case=case['name']), Proving(['validateDetail'], 'tests/fixtures/detail-validity/cases.json', case['name']) as proof:
                thrown = None
                try:
                    self.run_case(case)
                except ComposeLoadError as error:
                    thrown = error
                self.assertIsNotNone(thrown, f"{case['name']} must fail to load")
                self.assertEqual(thrown.code, case['engine']['code'])
                self.assertEqual('.'.join(thrown.trace), case['engine']['at'])
                proof.passed = True


if __name__ == '__main__':
    unittest.main()
