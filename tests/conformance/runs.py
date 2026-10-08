"""Run records of the Python suites that record conformance evidence.

A run writes its record when it starts, with the status None, and again when
it ends, with the exit status, so a stopped run keeps None (docs/spec/
conformance.md, "Suite runs"). Nothing is written unless
CRUDUI_CONFORMANCE_EVIDENCE names a directory; scripts/check-conformance.mjs
reads the records to name the suites behind missing evidence.
tests/conformance/runner.py is the process that calls these functions.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

_DIRECTORY = os.environ.get('CRUDUI_CONFORMANCE_EVIDENCE')
_FILE = None
_RECORD = None


def record_suite_run(program, tool, cwd, args):
    """Record this process as a run of the suite `program` names, started in `cwd` with `args`."""
    global _FILE, _RECORD
    if not _DIRECTORY:
        return
    runs = Path(_DIRECTORY) / 'runs'
    runs.mkdir(parents=True, exist_ok=True)
    _FILE = runs / f'python-{os.getpid()}.json'
    _RECORD = {
        'program': program,
        'tool': tool,
        'cwd': cwd,
        'args': list(args),
        'started': datetime.now(timezone.utc).isoformat(),
        'status': None,
    }
    _write(_FILE, _RECORD)


def finish_suite_run(status):
    """Write the run record again with the exit status of the suite."""
    if not _DIRECTORY:
        return
    _RECORD['status'] = status
    _write(_FILE, _RECORD)


def _write(file, record):
    """Write one run record atomically, so a reader never sees a partial one."""
    partial = file.with_suffix('.json.partial')
    partial.write_text(f'{json.dumps(record)}\n', encoding='utf-8')
    partial.replace(file)
