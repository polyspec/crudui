"""Shared loading of the validation fixtures and failure records.

Every test reads the same `cases.json` the other language implementations
read, compares its results with the recorded expectations and fails for a
fixture that holds no case.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / 'tests' / 'fixtures'

# The deepest fixture value nests 512 levels of containers and the traversal
# follows it; the default interpreter limit does not.
sys.setrecursionlimit(max(sys.getrecursionlimit(), 20000))


def cases_of(group, name='cases.json'):
    """The cases of one fixture group, or one operation of the text-validity group."""
    path = FIXTURES / group / name
    loaded = json.loads(path.read_text(encoding='utf-8'))
    if not loaded:
        raise AssertionError(f'{path.relative_to(ROOT)} holds no case')
    return loaded


def failure_record(error):
    """The cross-language failure record of a thrown validation failure."""
    from polyspec.crudui.validator import ComposeLoadError, FormInputError

    if isinstance(error, ComposeLoadError):
        return {'code': error.code, 'message': str(error), 'at': '.'.join(error.trace)}
    if isinstance(error, FormInputError):
        return {'code': error.code, 'message': str(error), 'at': ''}
    return None
