"""The shared expression fixtures against the Python parser and evaluator.

Every case of `tests/fixtures/expr/cases.json` parses to the recorded tokens
and syntax tree (positions excluded) and evaluates each recorded data context
to the recorded value and truthiness; a rejected expression reproduces the
first line of the recorded error message.
"""

import sys
import unittest
from pathlib import Path

SOURCE = str(Path(__file__).resolve().parents[1] / 'src')
if SOURCE not in sys.path:
    sys.path.insert(0, SOURCE)

from conformance import cases_of, Proving  # noqa: E402
from polyspec.crudui.validator.parser import ParseError, parse_condition  # noqa: E402
from polyspec.crudui.validator.resolver import (  # noqa: E402
    evaluate_condition,
    evaluate_expression_value,
)


def _strip(value):
    """Drop the position of a token or syntax tree node."""
    if isinstance(value, dict):
        return {key: _strip(item) for key, item in value.items() if key != 'position'}
    if isinstance(value, list):
        return [_strip(item) for item in value]
    return value


class ExprConformance(unittest.TestCase):
    """Tokens, trees and evaluation results reproduce the fixture; errors their message."""

    def setUp(self):
        self.cases = cases_of('expr')
        self.accepted = [case for case in self.cases if 'tokens' in case]
        self.rejected = [case for case in self.cases if 'error' in case]

    def test_every_case_declares_exactly_one_expectation(self):
        for case in self.cases:
            exclusive = ('tokens' in case) != ('error' in case)
            self.assertTrue(exclusive, f"{case['name']} must declare tokens or error")
        self.assertEqual(len(self.cases), 54)

    def test_tokens_and_tree_reproduce_the_fixture(self):
        self.assertEqual(len(self.accepted), 47)
        for case in self.accepted:
            with self.subTest(case=case['name']), Proving(['validate'], 'tests/fixtures/expr/cases.json', case['name']) as proof:
                tokens = _parse_tokens(case['expr'])
                self.assertEqual(
                    [_strip(token) for token in tokens], case['tokens'], case['expr']
                )
                self.assertEqual(_strip(parse_condition(case['expr'])), case['ast'], case['expr'])
                proof.passed = True

    def test_evaluation_reproduces_the_recorded_results(self):
        for case in self.accepted:
            ast = parse_condition(case['expr'])
            for recorded in case['cases']:
                with self.subTest(case=case['name'], data=recorded['data']), Proving(['validate'], 'tests/fixtures/expr/cases.json', case['name']) as proof:
                    context = {
                        'currentPath': recorded.get('currentPath') or [],
                        'rowKeys': recorded.get('rowKeys') or [],
                        'formData': recorded['data'],
                    }
                    value = evaluate_expression_value(ast, context, 'CURRENT')
                    self.assertEqual(_comparable(value), _comparable(recorded['value']))
                    self.assertEqual(evaluate_condition(ast, context, 'CURRENT'), recorded['truthy'])
                    proof.passed = True

    def test_rejected_expressions_reproduce_the_error_message(self):
        self.assertEqual(len(self.rejected), 7)
        for case in self.rejected:
            with self.subTest(case=case['name']), Proving(['validate'], 'tests/fixtures/expr/cases.json', case['name']) as proof:
                thrown = None
                try:
                    parse_condition(case['expr'])
                except ParseError as error:
                    thrown = error
                self.assertIsNotNone(thrown, f"{case['expr']} must not parse")
                self.assertEqual(str(thrown).split('\n')[0], case['error'])
                proof.passed = True


def _comparable(value):
    """A number compares numerically whatever integer or float writes it."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return float(value)
    return value


def _parse_tokens(expression):
    from polyspec.crudui.validator.parser import _Lexer

    return _Lexer(expression).tokenize()


if __name__ == '__main__':
    unittest.main()
