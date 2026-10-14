"""Conformance evidence for Python tests.

A test that runs a shared fixture case records the feature it proves, the
fixture, the runtime and the case. Nothing is written unless
CRUDUI_CONFORMANCE_EVIDENCE names a directory; scripts/check-conformance.mts
reads it. The run record of the suite is written by tests/conformance/run-suite.mts,
which runs the suite.
"""

import json
import os
from pathlib import Path

_DIRECTORY = os.environ.get("CRUDUI_CONFORMANCE_EVIDENCE")


def record_conformance(feature, fixture, runtime, case, passed):
    """Record one case result as a JSON line of this process."""
    for key, value in (
        ("feature", feature),
        ("fixture", fixture),
        ("runtime", runtime),
        ("case", case),
    ):
        if not isinstance(value, str) or value == "":
            raise TypeError(f"Conformance evidence {key} must be a non-empty string")
    if not isinstance(passed, bool):
        raise TypeError("Conformance evidence passed must be a boolean")
    if not _DIRECTORY:
        return
    Path(_DIRECTORY).mkdir(parents=True, exist_ok=True)
    line = json.dumps(
        {
            "feature": feature,
            "fixture": fixture,
            "runtime": runtime,
            "case": case,
            "passed": passed,
        }
    )
    with open(
        Path(_DIRECTORY) / f"python-{os.getpid()}.jsonl", "a", encoding="utf-8"
    ) as file:
        file.write(f"{line}\n")


class Proving:
    """Record one fixture case for every feature it proves.

    The case's own failure is rethrown after it is recorded.
    """

    def __init__(self, features, fixture, case, runtime="python"):
        self.features = features
        self.fixture = fixture
        self.case = case
        self.runtime = runtime
        self.passed = False

    def __enter__(self):
        return self

    def __exit__(self, _kind, _value, _trace):
        for feature in self.features:
            record_conformance(
                feature, self.fixture, self.runtime, self.case, self.passed
            )
        return False
