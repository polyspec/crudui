"""The structure map fixtures against the Python generator.

Every case of `tests/fixtures/form-outline/cases.json` compiles and binds
through the public operations, and `buildOutline` reproduces the recorded rows
with the members in the recorded order.
"""

import json
import unittest

from .conformance import cases_of
from polyspec.crudui.conformance import Proving


class TestOutlineConformance(unittest.TestCase):
    """The rows of the structure map match the shared fixture."""

    def test_cases_reproduce_the_recorded_rows(self):
        from polyspec.crudui.generator import Generator

        cases = cases_of("form-outline")
        self.assertEqual(len(cases), 5)
        for case in cases:
            with (
                self.subTest(case=case["name"]),
                Proving(
                    ["compileForm", "bindForm", "buildOutline"],
                    "tests/fixtures/form-outline/cases.json",
                    case["name"],
                ) as proof,
            ):
                options = case.get("options") or {}
                template = Generator.compileForm(case["spec"], options)
                nodes = Generator.bindForm(template, case.get("data") or {}, options)
                actual = Generator.buildOutline(nodes)
                self.assertEqual(
                    json.dumps(actual), json.dumps(case["expected_outline_rows"])
                )
                proof.passed = True
