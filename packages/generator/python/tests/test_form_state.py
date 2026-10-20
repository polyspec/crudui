"""The form view state fixtures against the Python generator.

The cases of `tests/fixtures/form-view` run their steps on a form instance and
those of `tests/fixtures/view-functions` call the view functions; each
observation equals the one that the TypeScript reference recorded, as JSON text
so that the order of object members counts. A row key that a case does not
write is one that an operation generated, and the observation names it `$1`,
`$2` in the order of its first appearance (tests/fixtures/form-state/README.md).
"""

import json
import re
import unittest

from polyspec.crudui.generator import FormError, Generator

from .conformance import cases_of

_GENERATED_KEY = re.compile(r"__[0-9A-Za-z]{13}__")


def _text(value):
    return json.dumps(value, ensure_ascii=False)


class _Namer:
    """Names the row keys that an operation generated."""

    def __init__(self, *texts):
        self.known = {key for text in texts for key in _GENERATED_KEY.findall(text)}
        self.generated = {}

    def rename(self, text):
        def name(match):
            key = match.group(0)
            if key in self.known:
                return key
            return self.generated.setdefault(key, f"${len(self.generated) + 1}")

        return _GENERATED_KEY.sub(name, text)

    def walk(self, value):
        if isinstance(value, str):
            return self.rename(value)
        if isinstance(value, list):
            return [self.walk(item) for item in value]
        if isinstance(value, dict):
            return {self.rename(key): self.walk(item) for key, item in value.items()}
        return value


def _collapsed_rows(nodes):
    """The row paths of the collapsed rows of the evaluated nodes, depth first."""
    found = []
    for node in nodes:
        children = node.get("children") or []
        if node.get("kind") != "collection":
            found.extend(_collapsed_rows(children))
            continue
        for row in children:
            if row.get("collapsible") is True and row.get("expanded") is False:
                found.append(f"{node['path']}.{row['key']}")
            found.extend(_collapsed_rows(row.get("children") or []))
    return found


def _perform(form, op, args):
    """Run one step on the form and return what the step returned."""
    if op == "addRow":
        return form.addRow(args[0], args[1] if len(args) > 1 else {})
    if op == "copyRow":
        return form.copyRow(args[0], args[1], args[2] if len(args) > 2 else {})
    if op in ("removeRow", "moveRow", "rekeyRow", "setValue", "setData", "toggleRow"):
        return getattr(form, op)(*args)
    if op == "setAllExpanded":
        return form.setAllExpanded(args[0])
    raise AssertionError(f"unknown step {op}")


class TestFormView(unittest.TestCase):
    """The sessions of the view state fixtures."""

    def test_sessions_equal_the_recorded_observations(self):
        for case in cases_of("form-view"):
            with self.subTest(case=case["name"]):
                name = _Namer(
                    _text(case["spec"]), _text(case["data"]), _text(case["steps"])
                )
                form = Generator.createForm(
                    Generator.compileForm(case["spec"]), case["data"]
                )
                for index, step in enumerate(case["steps"]):
                    observed = {}
                    try:
                        result = _perform(form, step["op"], step["args"])
                        if result is not None:
                            observed["result"] = name.walk(result)
                    except FormError as error:
                        observed["error"] = {"code": error.code, "message": str(error)}
                    observed["data"] = name.walk(form.getData())
                    observed["revision"] = form.getRevision()
                    observed["collapsed"] = name.walk(_collapsed_rows(form.getFields()))
                    self.assertEqual(
                        _text(observed), _text(case["expected"][index]), step
                    )


def _nodes(spec, data, collapsed=None):
    template = Generator.compileForm(spec)
    options = {} if collapsed is None else {"collapsed": collapsed}
    return Generator.bindForm(template, data, options)


def _call(op, args):
    if op == "initialView":
        return Generator.initialView()
    if op == "toggleRowView":
        return Generator.toggleRowView(args[0], args[1])
    if op == "collapsibleRows":
        return Generator.collapsibleRows(_nodes(args[0], args[1]))
    if op == "setAllExpandedView":
        return Generator.setAllExpandedView(_nodes(args[0], args[1]), args[2])
    if op == "removeRowView":
        return Generator.removeRowView(args[0], args[1])
    if op == "rekeyRowView":
        return Generator.rekeyRowView(args[0], args[1], args[2])
    if op == "bindCollapsed":
        return _collapsed_rows(_nodes(args[0], args[1], args[2]))
    raise AssertionError(f"unknown function {op}")


class TestViewFunctions(unittest.TestCase):
    """The calls of the view function fixtures."""

    def test_calls_equal_the_recorded_results(self):
        for case in cases_of("view-functions"):
            with self.subTest(case=case["name"]):
                self.assertEqual(
                    _text({"result": _call(case["op"], case["args"])}),
                    _text(case["expected"]),
                )
