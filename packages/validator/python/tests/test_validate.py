"""The shared validation fixtures against the Python validator.

Every case of `tests/fixtures/validate/cases.json` runs through `validate`:
a result case reproduces the recorded `{ valid, errors, hidden }` exactly, and
a failure case throws the recorded `{ code, message, at }` record.
"""

import unittest


from polyspec.crudui import validator
from .conformance import cases_of, failure_record
from polyspec.crudui.conformance import Proving


class TestValidateConformance(unittest.TestCase):
    """Result cases reproduce {valid, errors, hidden}; failures throw the exact record."""

    def setUp(self):
        self.cases = cases_of("validate")
        self.result_cases = [case for case in self.cases if "expected" in case]
        self.failure_cases = [case for case in self.cases if "expectFailure" in case]

    def run_case(self, case):
        options = {"files": case["files"]} if case.get("files") else {}
        return validator.validate(case["spec"], case["data"], options)

    def test_every_case_declares_exactly_one_expectation(self):
        for case in self.cases:
            exclusive = ("expected" in case) != ("expectFailure" in case)
            self.assertTrue(
                exclusive,
                f"{case['name']} must declare exactly one of expected or expectFailure",
            )
        self.assertGreater(len(self.cases), 0)

    def test_result_cases_reproduce_the_expected_result(self):
        self.assertEqual(len(self.cases), 318)
        self.assertEqual(len(self.result_cases), 179)
        for case in self.result_cases:
            with (
                self.subTest(case=case["name"]),
                Proving(
                    ["validate"], "tests/fixtures/validate/cases.json", case["name"]
                ) as proof,
            ):
                self.assertEqual(self.run_case(case), case["expected"])
                proof.passed = True

    def test_load_and_input_failures_throw_the_exact_record(self):
        self.assertEqual(len(self.failure_cases), 139)
        for case in self.failure_cases:
            with (
                self.subTest(case=case["name"]),
                Proving(
                    ["validate"], "tests/fixtures/validate/cases.json", case["name"]
                ) as proof,
            ):
                thrown = None
                try:
                    self.run_case(case)
                except Exception as error:  # noqa: BLE001 - the record names the failure
                    thrown = error
                self.assertIsNotNone(
                    failure_record(thrown),
                    f"{case['name']} must throw a validation failure",
                )
                self.assertEqual(failure_record(thrown), case["expectFailure"])
                proof.passed = True


if __name__ == "__main__":
    unittest.main()
