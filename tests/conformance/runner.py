"""Run the unittest suite of one test directory and leave its run record.

    python3 tests/conformance/runner.py <test directory>

The directory is searched for `test_*.py` files, as `python3 -m unittest discover -s <directory>
-p 'test_*.py'` does. The run record names this file as its program, so the record does not depend
on the Python executable of the machine or of the CI matrix leg. The process exits with 0 when every
test passed and with 1 otherwise.
"""

import sys
import unittest

from runs import finish_suite_run, record_suite_run

PROGRAM = 'tests/conformance/runner.py'


def main(arguments):
    if len(arguments) != 1:
        raise SystemExit('usage: python3 tests/conformance/runner.py <test directory>')
    directory = arguments[0]
    record_suite_run(PROGRAM, 'unittest', directory, [directory])
    suite = unittest.defaultTestLoader.discover(start_dir=directory, pattern='test_*.py')
    result = unittest.TextTestRunner().run(suite)
    status = 0 if result.wasSuccessful() else 1
    finish_suite_run(status)
    return status


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
