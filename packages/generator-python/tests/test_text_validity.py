"""The input text fixtures of the generation operations.

Every case of the `compileForm`, `bindForm`, `createForm`, `buildList` and
`buildDetail` files of `tests/fixtures/text-validity` runs with its inputs
decoded from JSON text that writes unpaired surrogates as escapes: a Python
string keeps the escape as a lone surrogate code unit, so the input text check
rejects it. A case either throws the recorded failure `{code, message, at}` or
passes; a `createForm` case runs its recorded action on the created instance.
"""

import unittest

from conformance import cases_of, failure_record


def _options_of(case):
    options = dict(case.get('options') or {})
    if 'files' in case:
        options['files'] = case['files']
    return options


def _outcome(run):
    """The failure record of a thrown failure, or 'pass'."""
    from polyspec.crudui.generator import FormError
    from polyspec.crudui.validator import ComposeLoadError, FormInputError

    try:
        run()
    except (ComposeLoadError, FormInputError, FormError) as error:
        if isinstance(error, ComposeLoadError):
            return {'code': error.code, 'message': str(error), 'at': '.'.join(error.trace)}
        at = error.path if isinstance(error, FormError) else ''
        return {'code': error.code, 'message': str(error), 'at': at}
    return 'pass'


class GeneratorTextValidityConformance(unittest.TestCase):
    """The input text rule holds at the generation operations, in the same order."""

    def test_compile_form_cases(self):
        from polyspec.crudui.generator import Generator

        cases = cases_of('text-validity', 'compileForm/cases.json')
        self.assertEqual(len(cases), 7)
        for case in cases:
            with self.subTest(case=case['name']):
                outcome = _outcome(lambda: Generator.compileForm(case['spec'], _options_of(case)))
                self.assertEqual(outcome, case['expect'])

    def test_bind_form_cases(self):
        from polyspec.crudui.generator import Generator

        cases = cases_of('text-validity', 'bindForm/cases.json')
        self.assertEqual(len(cases), 9)
        for case in cases:
            with self.subTest(case=case['name']):
                template = (
                    case['template'] if 'template' in case else Generator.compileForm(case['spec'])
                )
                outcome = _outcome(
                    lambda: Generator.bindForm(template, case.get('data', {}), _options_of(case))
                )
                self.assertEqual(outcome, case['expect'])

    def test_create_form_cases(self):
        from polyspec.crudui.generator import Generator

        cases = cases_of('text-validity', 'createForm/cases.json')
        self.assertEqual(len(cases), 15)
        for case in cases:
            with self.subTest(case=case['name']):
                def run():
                    template = (
                        case['template'] if 'template' in case else Generator.compileForm(case['spec'])
                    )
                    form = Generator.createForm(template, case.get('data', {}), _options_of(case))
                    action = case.get('action')
                    if action is not None:
                        method = getattr(form, action['method'])
                        method(*action['args'])

                self.assertEqual(_outcome(run), case['expect'])

    def test_build_list_cases(self):
        from polyspec.crudui.generator import Generator

        cases = cases_of('text-validity', 'buildList/cases.json')
        self.assertEqual(len(cases), 11)
        for case in cases:
            with self.subTest(case=case['name']):
                outcome = _outcome(
                    lambda: Generator.buildList(case['spec'], case.get('rows', []), _options_of(case))
                )
                self.assertEqual(outcome, case['expect'])

    def test_build_detail_cases(self):
        from polyspec.crudui.generator import Generator

        cases = cases_of('text-validity', 'buildDetail/cases.json')
        self.assertEqual(len(cases), 6)
        for case in cases:
            with self.subTest(case=case['name']):
                outcome = _outcome(
                    lambda: Generator.buildDetail(case['spec'], case.get('record', {}), _options_of(case))
                )
                self.assertEqual(outcome, case['expect'])


if __name__ == '__main__':
    unittest.main()
