"""Run records of the Python suites that record conformance evidence.

A run writes its record when the process starts, with the status None, and
again when it exits, with the exit status, so a stopped run keeps None (docs/
spec/conformance.md, "Suite runs"). Nothing is written unless
CRUDUI_CONFORMANCE_EVIDENCE names a directory; scripts/check-conformance.mjs
reads the records to name the suites behind missing evidence.
finish_suite_run writes the exit status of the suite once it is known.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

_DIRECTORY = os.environ.get('CRUDUI_CONFORMANCE_EVIDENCE')
_FILE = None
_RECORD = None


def record_suite_run():
    """Record this process as the run of the suite `runner.py` was given."""
    if not _DIRECTORY:
        return
    arguments = list(sys.argv[1:])
    _RECORD.update(
        {
            'program': Path(sys.executable).name,
            'tool': 'unittest',
            'cwd': arguments[0] if arguments else '.',
            'args': arguments,
            'started': datetime.now(timezone.utc).isoformat(),
            'status': None,
        }
    )
    runs = Path(_DIRECTORY) / 'runs'
    runs.mkdir(parents=True, exist_ok=True)
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


if _DIRECTORY:
    _FILE = Path(_DIRECTORY) / 'runs' / f'python-{os.getpid()}.json'
    _RECORD = {}
