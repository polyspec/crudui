"""The shared composition fixtures against the Python compose engine.

Every case of `tests/fixtures/compose/cases.json` composes its entry through
`compose_properties` or `compose_spec` with the recorded files and basepath:
a result case reproduces the composed map (compared with sorted member names,
which the other harnesses canonicalize the same way; arrays keep their order),
and an error case raises `ComposeLoadError` with the recorded code.
"""

import sys
import unittest
from pathlib import Path

SOURCE = str(Path(__file__).resolve().parents[1] / 'src')
if SOURCE not in sys.path:
    sys.path.insert(0, SOURCE)

from conformance import cases_of, Proving  # noqa: E402
from polyspec.crudui.validator.compose import MemoryLoader, compose_properties, compose_spec  # noqa: E402
from polyspec.crudui.validator.compose_errors import ComposeLoadError  # noqa: E402


def canon(value):
    """Sorted member names at every depth, for order-insensitive comparison."""
    if isinstance(value, list):
        return [canon(item) for item in value]
    if isinstance(value, dict):
        return {key: canon(value[key]) for key in sorted(value)}
    return value


class ComposeConformance(unittest.TestCase):
    """Composed maps reproduce the fixture; failures raise the recorded code."""

    def setUp(self):
        self.cases = cases_of('compose')

    def run_case(self, case):
        source = case['input']
        loader = MemoryLoader(source.get('files') or {})
        opts = {'basepath': source['basepath']} if source.get('basepath') else {}
        entry = source['entry']
        if source.get('kind', 'properties') == 'spec':
            return compose_spec(entry, loader, opts)
        return compose_properties(entry, loader, opts)

    def test_every_case_declares_exactly_one_expectation(self):
        for case in self.cases:
            exclusive = ('expected' in case) != ('expectError' in case)
            self.assertTrue(exclusive, f"{case['name']} must declare expected or expectError")
        self.assertEqual(len(self.cases), 20)

    def test_result_cases_reproduce_the_composed_map(self):
        results = [case for case in self.cases if 'expected' in case]
        self.assertEqual(len(results), 13)
        for case in results:
            with self.subTest(case=case['name']), Proving(['compileForm'], 'tests/fixtures/compose/cases.json', case['name']) as proof:
                self.assertEqual(canon(self.run_case(case)), canon(case['expected']))
                proof.passed = True

    def test_error_cases_raise_the_recorded_code(self):
        errors = [case for case in self.cases if 'expectError' in case]
        self.assertEqual(len(errors), 7)
        for case in errors:
            with self.subTest(case=case['name']), Proving(['compileForm'], 'tests/fixtures/compose/cases.json', case['name']) as proof:
                thrown = None
                try:
                    self.run_case(case)
                except ComposeLoadError as error:
                    thrown = error
                self.assertIsNotNone(thrown, f"{case['name']} must fail to load")
                self.assertEqual(thrown.code, case['expectError']['code'])
                proof.passed = True


if __name__ == '__main__':
    unittest.main()
