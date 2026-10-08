"""Editable data and evaluated fields for one compiled structure.

An instance holds a detached copy of the template, its normalized data and
its evaluated fields and buttons. Every data update reevaluates them
atomically: the update applies only when its normalization and evaluation
both succeed, and the revision counts the successful updates.
"""

import re
import secrets

from .binding import bind as bind_fields
from .binding import language as bind_language
from . import buttons as buttons_module
from .errors import FormError
from .input_text import inputs as check_inputs
from .messages import for_language
from .template import checked as checked_template
from .value import MISSING, copy_value, get, object_value, path as value_path, record, segments, translate

__all__ = ['Form']

_KEY_PATTERN = re.compile(r'^[A-Za-z0-9_-]+$')
_DIGITS = re.compile(r'^\d+$')
_SEQUENCE = re.compile(r'^\d{1,13}$')


def sequenceRowKey(sequence):
    """A nonnegative sequence with thirteen decimal digits."""
    text = str(sequence)
    if _SEQUENCE.match(text) is None:
        raise FormError('INVALID_FORM_INPUT', 'A sequence must contain 1–13 decimal digits')
    return f"__{text.zfill(13)}__"


def createRowKey():
    """A thirteen-character hexadecimal row key."""
    return f"__{secrets.token_hex(7)[:13]}__"


class Form:
    """One instance over a compiled template."""

    def __init__(self, template, data=None, options=None):
        options = options or {}
        check_inputs([('template', template), ('data', data if data is not None else {})], options, ('idPrefix', 'keyPrefix', 'language', 'unsupported'))
        self._template = checked_template(template)
        self._options = options
        self._data = self._normalize_fields(self._template['fields'], object_value(data if data is not None else {}))
        self._fields = bind_fields(self._template, self._data, options)
        self._buttons = buttons_module.bind(self._template, self._data, self._language())
        self._revision = 0

    # -- Readers -------------------------------------------------------------

    def getTemplate(self):
        """A detached copy of the compiled template."""
        return copy_value(self._template)

    def getFields(self):
        """Detached evaluated field models."""
        return copy_value(self._fields)

    def getButtons(self):
        """Detached evaluated form buttons."""
        return copy_value(self._buttons)

    def getMessages(self):
        """The interface text for the instance language."""
        return for_language(self._language())

    def getDescription(self):
        """The template's root description for the instance language; empty text when none."""
        return translate(self._template.get('description'), self._language())

    def getRevision(self):
        """The number of successful data updates."""
        return self._revision

    def getData(self):
        """Detached submission data."""
        return copy_value(self._data)

    def getValue(self, path):
        """A detached path value, or None when missing."""
        check_inputs([('path', path)])
        self._checked_path(path)
        value = value_path(self._data, path)
        return None if value is MISSING else copy_value(value)

    # -- Writers -------------------------------------------------------------

    def setData(self, data):
        """Replace the record and reevaluate the fields atomically."""
        check_inputs([('data', data)])
        self._commit(self._normalize_fields(self._template['fields'], object_value(data)))

    def setValue(self, path, value):
        """Replace one path value and reevaluate the fields atomically."""
        check_inputs([('path', path), ('value', value)])
        data = self._put(self._data, self._checked_path(path), copy_value(value))
        self._commit(self._normalize_fields(self._template['fields'], data))

    def addRow(self, path, options=None):
        """Insert one supplied or defaulted row and return its key."""
        options = options or {}
        check_inputs([('path', path)], options, ('afterKey', 'key', 'value'))
        field, rows = self._editable_collection(path)
        maximum = (field['spec'].get('multiple') or {}).get('max') if isinstance(field['spec'].get('multiple'), dict) else None
        if isinstance(maximum, (int, float)) and len(rows) >= maximum:
            self._fail(f'Maximum row count reached: {path}')
        key = options['key'] if 'key' in options else self._fresh_key(list(rows))
        if not isinstance(key, str):
            self._fail('A row key must be a string')
        self._check_key(key)
        if key in rows:
            self._fail(f'Row key already exists: {key}')
        members = list(rows)
        index = len(members)
        if 'afterKey' in options:
            if options['afterKey'] not in members:
                self._fail(f"Unknown row: {_scalar(options['afterKey'])}")
            index = members.index(options['afterKey']) + 1
        value = self._normalize_row(
            field,
            copy_value(options['value']) if 'value' in options else MISSING,
            '.'.join([*self._checked_path(path), key]),
        )
        items = list(rows.items())
        following = dict(items[:index])
        following[key] = value
        following.update(items[index:])
        self._commit(self._put(self._data, self._checked_path(path), following))
        return key

    def copyRow(self, path, key, options=None):
        """Copy current row values and regenerate nested repeated keys."""
        options = dict(options or {})
        check_inputs([('path', path), ('key', key)], options, ('afterKey', 'key'))
        field, rows = self._editable_collection(path)
        if key not in rows:
            self._fail(f'Unknown row: {key}')
        options.setdefault('afterKey', key)
        options['value'] = self._copy_row_value(field, rows[key])
        return self.addRow(path, options)

    def removeRow(self, path, key):
        """Remove one row while respecting the minimum count."""
        check_inputs([('path', path), ('key', key)])
        field, rows = self._editable_collection(path)
        if key not in rows:
            self._fail(f'Unknown row: {key}')
        minimum = (field['spec'].get('multiple') or {}).get('min') if isinstance(field['spec'].get('multiple'), dict) else None
        if isinstance(minimum, (int, float)) and len(rows) <= minimum:
            self._fail(f'Minimum row count reached: {path}')
        following = dict(rows)
        del following[key]
        self._commit(self._put(self._data, self._checked_path(path), following))

    def moveRow(self, path, key, index):
        """Change row order without changing row identity."""
        check_inputs([('path', path), ('key', key)])
        _field, rows = self._editable_collection(path)
        if key not in rows:
            self._fail(f'Unknown row: {key}')
        members = list(rows)
        if index < 0 or index >= len(members):
            self._fail(f'Invalid row position: {index}')
        if members.index(key) == index:
            return
        remaining = dict(rows)
        value = remaining.pop(key)
        items = list(remaining.items())
        following = dict(items[:index])
        following[key] = value
        following.update(items[index:])
        self._commit(self._put(self._data, self._checked_path(path), following))

    def rekeyRow(self, path, old_key, new_key):
        """Replace one row key and regenerate descendant field paths."""
        check_inputs([('path', path), ('oldKey', old_key), ('newKey', new_key)])
        _field, rows = self._editable_collection(path)
        self._check_key(new_key)
        if old_key not in rows:
            self._fail(f'Unknown row: {old_key}')
        if old_key == new_key:
            return
        if new_key in rows:
            self._fail(f'Row key already exists: {new_key}')
        following = {(new_key if key == old_key else key): value for key, value in rows.items()}
        self._commit(self._put(self._data, self._checked_path(path), following))

    # -- Internals -----------------------------------------------------------

    def _commit(self, data):
        fields = bind_fields(self._template, data, self._options)
        buttons = buttons_module.bind(self._template, data, self._language())
        self._data = data
        self._fields = fields
        self._buttons = buttons
        self._revision += 1

    def _language(self):
        return bind_language(self._options)

    @staticmethod
    def _checked_path(path):
        parts = segments(path)
        if not parts or any(part in ('__proto__', 'prototype', 'constructor') for part in parts):
            Form._fail(f'Invalid form path: {path}')
        return parts

    @staticmethod
    def _check_key(key):
        if (
            _KEY_PATTERN.match(key) is None
            or _DIGITS.match(key) is not None
            or key in ('__proto__', 'prototype', 'constructor')
        ):
            Form._fail(f'Invalid row key: {key}; use sequenceRowKey for numeric ids')

    @staticmethod
    def _put(data, path, value):
        head, rest = path[0], path[1:]
        out = dict(data)
        if rest:
            out[head] = Form._put(data.get(head) if isinstance(data.get(head), dict) else {}, rest, value)
        else:
            out[head] = value
        return out

    @staticmethod
    def _repeats(field):
        multiple = field['spec'].get('multiple')
        return multiple is True or Form._data_only(field) or isinstance(multiple, dict)

    @staticmethod
    def _data_only(field):
        """A `multiple: only` collection: its rows come only from the data."""
        multiple = field['spec'].get('multiple')
        return multiple == 'only' or (isinstance(multiple, dict) and multiple.get('only') is True)

    @staticmethod
    def _fresh_key(used):
        for _attempt in range(100):
            key = createRowKey()
            if key not in used:
                return key
        Form._fail('Unable to generate an unused row key')

    def _normalize_fields(self, fields, value, path=''):
        """Normalize record data; `path` is the full data path, empty at the root."""
        if value is not MISSING and not isinstance(value, dict):
            self._fail('Form data must be an object' if path == '' else f'Group data must be an object: {path}')
        data = {} if value is MISSING else copy_value(value)
        for field in fields:
            raw = get(data, field['name'])
            field_path = field['name'] if path == '' else f"{path}.{field['name']}"
            if self._repeats(field):
                if raw is not MISSING and not isinstance(raw, dict):
                    self._fail(f'Repeated data must be a keyed object: {field_path}')
                rows = {}
                entries = (
                    raw
                    if raw is not MISSING
                    else ({} if self._data_only(field) else {self._fresh_key([]): MISSING})
                )
                for key, row in entries.items():
                    self._check_key(str(key))
                    rows[key] = self._normalize_row(field, row, f'{field_path}.{key}')
                data[field['name']] = rows
            elif field['spec'].get('type') == 'group':
                data[field['name']] = self._normalize_fields(field['children'], raw, field_path)
            elif raw is MISSING and 'default' in field['spec']:
                data[field['name']] = copy_value(field['spec']['default'])
        return data

    def _normalize_row(self, field, value, path):
        if field['spec'].get('type') == 'group':
            return self._normalize_fields(field['children'], value, path)
        if value is MISSING:
            return copy_value(field['spec']['default']) if 'default' in field['spec'] else ''
        return copy_value(value)

    def _copy_row_value(self, field, value):
        if field['spec'].get('type') == 'group':
            return self._copy_children(field['children'], copy_value(value))
        return copy_value(value)

    def _copy_children(self, fields, value):
        for field in fields:
            raw = value.get(field['name'])
            if self._repeats(field) and isinstance(raw, dict):
                used = list(raw)
                following = {}
                for row in raw.values():
                    key = self._fresh_key(used)
                    used.append(key)
                    following[key] = self._copy_row_value(field, row)
                value[field['name']] = following
            elif field['spec'].get('type') == 'group' and isinstance(raw, dict):
                value[field['name']] = self._copy_children(field['children'], raw)
        return value

    def _editable_collection(self, path):
        """A collection whose rows the form may add, copy, remove, move or rekey."""
        field, rows = self._collection(path)
        if self._data_only(field):
            self._fail(f'Rows of {path} come only from data')
        return field, rows

    def _collection(self, path):
        segments_list = self._checked_path(path)
        fields = self._template['fields']
        field = None
        index = 0
        while index < len(segments_list):
            field = None
            for candidate in fields:
                if candidate['name'] == segments_list[index]:
                    field = candidate
                    break
            if field is None:
                self._fail(f'Unknown collection: {path}')
            if index == len(segments_list) - 1:
                break
            if self._repeats(field):
                index += 1
            fields = field['children']
            field = None
            index += 1
        rows = value_path(self._data, path)
        if field is None or not self._repeats(field) or not isinstance(rows, dict):
            self._fail(f'Not a keyed collection: {path}')
        return field, rows

    @staticmethod
    def _fail(message):
        raise FormError('INVALID_FORM_INPUT', message)


def _scalar(value):
    from .value import scalar

    return scalar(value)
