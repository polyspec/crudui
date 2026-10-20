"""The form template shape (CURT-092) of the Python generator.

The compiled cases also test CURP-019 and CURP-024: a serialized compiled template is bound.

Every case of `tests/fixtures/template-shape` runs through its operation: `bindForm`, `bindButtons` or `createForm`
takes the case's template, data and options. A refusal is the `FormError` with the code, the message and the empty location
that the case records; a passing case returns without a failure. The fixture holds 42 cases.
"""

import unittest

from .conformance import cases_of


def _outcome(run):
    """The failure record of a thrown FormError, or 'pass'."""
    from polyspec.crudui.generator import FormError

    try:
        run()
    except FormError as error:
        return {"code": error.code, "message": str(error), "at": error.path}
    return "pass"


class TestGeneratorTemplateShape(unittest.TestCase):
    """The operations that take a template refuse a shape that is not the compiled one."""

    def test_template_shape_cases(self):
        from polyspec.crudui.generator import Generator

        cases = cases_of("template-shape")
        self.assertEqual(len(cases), 44)
        for case in cases:
            with self.subTest(case=case["name"]):
                template = case["template"]
                data = case.get("data", {})
                options = case.get("options", {})
                operation = case["operation"]
                if operation == "createRecords":
                    # CURT-050: each record is bound from the serialized template alone, and reads its own values.
                    results = []
                    for index, record in enumerate(data):
                        form = Generator.createForm(template, record, {})
                        results.append(
                            {path: form.getValue(path) for path in case["paths"][index]}
                        )
                    self.assertEqual({"results": results}, case["expect"])
                    continue

                def run():
                    if operation == "bindForm":
                        Generator.bindForm(template, data, options)
                    elif operation == "bindButtons":
                        Generator.bindButtons(template, data, options)
                    elif operation == "createForm":
                        Generator.createForm(template, data, options)
                    else:
                        raise AssertionError(f"unknown template operation {operation}")

                self.assertEqual(_outcome(run), case["expect"])


if __name__ == "__main__":
    unittest.main()
