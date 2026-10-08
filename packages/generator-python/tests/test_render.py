"""The complete-form, list and detail rendering fixtures against the Python generator.

`tests/fixtures/form-complete/cases.json` renders the complete form of an
instance with its render options; `list-render` and `detail-render` render
supplied rows and records. Every output is compared byte for byte, and every
failure case raises the recorded code and message.
"""

import re
import unittest

from conformance import cases_of, failure_record, html_tree

_PRELOAD = re.compile(r'<link [^>]*rel="preload"[^>]*>')


def _without_preloads(html):
    """The rendered body without the image preload links before it."""
    return _PRELOAD.sub('', html)


def _generator():
    from polyspec.crudui.generator import Generator

    return Generator


class FormCompleteConformance(unittest.TestCase):
    """The complete form writes the expected bytes or the declared failure."""

    def setUp(self):
        self.cases = cases_of('form-complete')

    def test_every_case_reproduces_its_expectation(self):
        generator = _generator()
        self.assertEqual(len(self.cases), 28)
        for case in self.cases:
            with self.subTest(case=case['name']):
                form = generator.createForm(
                    generator.compileForm(case['spec']),
                    case['data'],
                    case.get('options') or {},
                )
                if 'expectError' in case:
                    thrown = None
                    try:
                        generator.renderForm(form, case['render'])
                    except Exception as error:  # noqa: BLE001 - the record names the failure
                        thrown = error
                    self.assertIsNotNone(thrown, f"{case['name']} must fail")
                    record = failure_record(thrown)
                    self.assertEqual(record['code'], case['expectError']['code'])
                    self.assertEqual(record['message'], case['expectError']['message'])
                    continue
                self.assertEqual(generator.renderForm(form, case['render']), case['expected_html'])


class ListRenderConformance(unittest.TestCase):
    """A list renders byte for byte or raises the recorded code."""

    def setUp(self):
        self.cases = cases_of('list-render')

    def run_case(self, case):
        return _generator().renderList(
            case['spec'], case['rows'], case.get('options') or {}
        )

    def test_every_case_reproduces_its_expectation(self):
        self.assertEqual(len(self.cases), 157)
        for case in self.cases:
            with self.subTest(case=case['name']):
                if 'expectError' in case:
                    thrown = None
                    try:
                        self.run_case(case)
                    except Exception as error:  # noqa: BLE001 - the record names the failure
                        thrown = error
                    self.assertIsNotNone(thrown, f"{case['name']} must fail")
                    self.assertEqual(failure_record(thrown)['code'], case['expectError']['code'])
                    if 'message' in case['expectError']:
                        self.assertIn(case['expectError']['message'], failure_record(thrown)['message'])
                    continue
                actual = self.run_case(case)
                self.assertEqual(html_tree(_without_preloads(actual)), html_tree(case['expected_html']))


class DetailRenderConformance(unittest.TestCase):
    """A detail renders byte for byte or raises the recorded code."""

    def setUp(self):
        self.cases = cases_of('detail-render')

    def run_case(self, case):
        return _generator().renderDetail(
            case['spec'], case.get('record', {}), case.get('options') or {}
        )

    def test_every_case_reproduces_its_expectation(self):
        self.assertEqual(len(self.cases), 62)
        for case in self.cases:
            with self.subTest(case=case['name']):
                if 'expectError' in case:
                    thrown = None
                    try:
                        self.run_case(case)
                    except Exception as error:  # noqa: BLE001 - the record names the failure
                        thrown = error
                    self.assertIsNotNone(thrown, f"{case['name']} must fail")
                    self.assertEqual(failure_record(thrown)['code'], case['expectError']['code'])
                    if 'message' in case['expectError']:
                        self.assertIn(case['expectError']['message'], failure_record(thrown)['message'])
                    continue
                actual = self.run_case(case)
                self.assertEqual(html_tree(_without_preloads(actual)), html_tree(case['expected_html']))


if __name__ == '__main__':
    unittest.main()
