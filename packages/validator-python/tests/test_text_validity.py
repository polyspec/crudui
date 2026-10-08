"""The input text fixtures against the Python validators.

Every case of the `validate`, `validateList` and `validateDetail` files of
`tests/fixtures/text-validity` runs with its specification, files, data and
options decoded from JSON text that writes unpaired surrogates as escapes: a
Python string keeps the escape as a lone surrogate code unit, so the input
text check rejects it. The value graphs of `value-graphs.json` are built with
shared and self-containing containers, which Python values can hold.

Each case either throws the recorded failure `{code, message, at}` or returns
the recorded result.
"""

import sys
import unittest
from pathlib import Path

SOURCE = str(Path(__file__).resolve().parents[1] / 'src')
if SOURCE not in sys.path:
    sys.path.insert(0, SOURCE)

from conformance import FIXTURES, cases_of, failure_record  # noqa: E402
from polyspec.crudui.validator import (  # noqa: E402
    ComposeLoadError,
    FormInputError,
    validate,
    validateDetail,
    validateList,
)

ENTRIES = {
    'validate': lambda spec, data, options: validate(spec, data, options),
    'validateList': lambda spec, data, options: validateList(spec, options),
    'validateDetail': lambda spec, data, options: validateDetail(spec, options),
}


def outcome(case, entry):
    """The failure record of a thrown failure, or the validation result."""
    options = {}
    if case.get('files') is not None:
        options['files'] = case['files']
    if case.get('options', {}).get('basepath') is not None:
        options['basepath'] = case['options']['basepath']
    data = case.get('data', {}) if 'data' in case else {}
    try:
        result = entry(case['spec'], data, options)
    except (ComposeLoadError, FormInputError) as error:
        return failure_record(error)
    if 'hidden' in result:
        return {'valid': result['valid'], 'errors': result['errors'], 'hidden': result['hidden']}
    return {'valid': result['valid'], 'errors': result['errors']}


def build_graph(graph):
    """The placement path and the value a graph case describes, with shared containers."""
    shape = graph['shape']
    if shape == 'self-twice':
        loop = {}
        loop['self'] = loop
        loop['again'] = loop
        return graph['at'], loop
    size = graph['size']
    leaf = graph['leaf']
    if shape == 'flat':
        return graph['at'], [leaf] * size
    value = leaf
    for _ in range(size):
        value = [value, value] if shape == 'doubled' else [value]
    return graph['at'], value


class TextValidityConformance(unittest.TestCase):
    """The input text rule holds at the same operations, in the same order."""

    def test_validate_cases(self):
        cases = cases_of('text-validity', 'validate/cases.json')
        self.assertEqual(len(cases), 21)
        for case in cases:
            with self.subTest(case=case['name']):
                self.assertEqual(outcome(case, ENTRIES['validate']), case['expect'])

    def test_validate_list_cases(self):
        cases = cases_of('text-validity', 'validateList/cases.json')
        self.assertEqual(len(cases), 6)
        for case in cases:
            with self.subTest(case=case['name']):
                self.assertEqual(outcome(case, ENTRIES['validateList']), case['expect'])

    def test_validate_detail_cases(self):
        cases = cases_of('text-validity', 'validateDetail/cases.json')
        self.assertEqual(len(cases), 5)
        for case in cases:
            with self.subTest(case=case['name']):
                self.assertEqual(outcome(case, ENTRIES['validateDetail']), case['expect'])

    def test_value_graph_cases(self):
        cases = cases_of('text-validity', 'value-graphs.json')
        self.assertEqual(len(cases), 12)
        for case in cases:
            with self.subTest(case=case['name']):
                spec = case['spec']
                data = case['data']
                files = case.get('files')
                options = {'files': files} if files is not None else {}
                path, graph = build_graph(case['graph'])
                member = path[-1]
                if path[0] == 'spec':
                    spec[member] = graph
                elif path[0] == 'files':
                    options['files'][path[1]][member] = graph
                else:
                    data[member] = graph
                result = outcome({'spec': spec, 'data': data, **options}, ENTRIES['validate'])
                self.assertEqual(result, case['expect'])


if __name__ == '__main__':
    unittest.main()
