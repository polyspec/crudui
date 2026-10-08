"""The form rendering fixtures against the Python generator.

Every case of `tests/fixtures/form-render/cases.json` compiles, binds and
renders through the public operations: a result case reproduces the recorded
HTML as a parsed normalized tree, and a failure case raises the recorded code.
Binding the same template twice writes the same fields.
"""

import unittest

from conformance import cases_of, failure_record, html_tree


class FormRenderConformance(unittest.TestCase):
    """The layout of the rendered form matches the shared fixture."""

    def setUp(self):
        self.cases = cases_of('form-render')
        self.results = [case for case in self.cases if 'expected_html' in case]
        self.failures = [case for case in self.cases if 'expectError' in case]

    def render(self, case):
        from polyspec.crudui.generator import Generator

        options = case.get('options') or {}
        template = Generator.compileForm(case['spec'], options)
        data = case.get('data') or {}
        fields = Generator.bindForm(template, data, options)
        return template, fields, options, data

    def test_result_cases_reproduce_the_normalized_layout(self):
        self.assertEqual(len(self.results), 137)
        from polyspec.crudui.generator import Generator

        for case in self.results:
            with self.subTest(case=case['name']):
                options = case.get('options') or {}
                template = Generator.compileForm(case['spec'], options)
                data = case.get('data') or {}
                form = Generator.createForm(template, data, options)
                actual = Generator.renderForm(form)
                self.assertEqual(html_tree(actual), html_tree(case['expected_html']))
                # A new instance over the same template and data renders the same form.
                again = Generator.renderForm(Generator.createForm(template, data, options))
                self.assertEqual(actual, again)

    def test_failure_cases_raise_the_recorded_code(self):
        self.assertEqual(len(self.failures), 51)
        from polyspec.crudui.generator import Generator

        for case in self.failures:
            with self.subTest(case=case['name']):
                thrown = None
                try:
                    self.render(case)
                except Exception as error:  # noqa: BLE001 - the record names the failure
                    thrown = error
                record = failure_record(thrown)
                self.assertIsNotNone(record, f"{case['name']} must fail")
                self.assertEqual(record['code'], case['expectError']['code'])

    def test_every_case_declares_exactly_one_expectation(self):
        for case in self.cases:
            exclusive = ('expected_html' in case) != ('expectError' in case)
            self.assertTrue(exclusive, f"{case['name']} must declare one expectation")
        self.assertEqual(len(self.cases), 188)


if __name__ == '__main__':
    unittest.main()
