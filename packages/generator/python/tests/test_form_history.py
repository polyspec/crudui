"""The history function cases of `tests/fixtures/history-functions/cases.json` against the Python generator (CURT-063, CURT-076
to CURT-080).

Each case is a test method `test_<name>`: the function named by `op` runs through the public `Generator` operations and
returns `{result}`, or raises the `FormError` with the recorded code and message.
"""

import unittest

from polyspec.crudui.generator import FormError, Generator

from .conformance import cases_of


def _run(op, args):
    if op == "canUndoRedo":
        return [Generator.canUndo(args[0]), Generator.canRedo(args[0])]
    if op == "emptyHistory":
        return Generator.emptyHistory()
    if op == "recordChange":
        return Generator.recordChange(*args)
    if op == "undoChange":
        return Generator.undoChange(*args)
    return Generator.redoChange(*args)


def _outcome(case):
    try:
        return {"result": _run(case["op"], case["args"])}
    except FormError as error:
        return {"error": {"code": error.code, "message": str(error)}}


class FormHistoryConformanceTest(unittest.TestCase):
    """Every case of the fixture is one test."""


def _add(case):
    def test(self):
        self.assertEqual(case["expected"], _outcome(case))

    setattr(FormHistoryConformanceTest, f"test_{case['name']}", test)


for _case in cases_of("history-functions"):
    _add(_case)
