"""Render options of a complete form.

The form element, the hidden fields, the form errors and the node errors: an
option outside the contract is a `FormError` in the documented order, and an
error path that no node carries is one too.
"""

from .errors import FormError
from .rendering import url as render_url

__all__ = ['EMPTY', 'model']

EMPTY = {'form': None, 'hidden': [], 'formErrors': [], 'nodeErrors': {}}

_MEMBERS = ('action', 'hidden', 'formErrors', 'errors')
_ACTION_MEMBERS = ('method', 'url', 'enctype')


def _members(value):
    """The members of a JSON object: a dict, or None for any other value."""
    if isinstance(value, dict):
        return value
    return None


def model(nodes, template_action, options):
    """Check render options and build the model the renderer writes.

    `nodes` are the top-level nodes the renderer writes; `template_action` is
    the compiled template's declared action.
    """
    members = _members(options)
    if members is None:
        _failure('Render options must be an object')
    for name in members:
        if name not in _MEMBERS:
            _failure(f'Unknown render option: {name}')
    action = _members(members['action']) if 'action' in members else None
    if 'action' in members and (action is None or _invalid_action(action)):
        _failure('action must be an object with string method, url and enctype')
    hidden = _members(members['hidden']) if 'hidden' in members else None
    if 'hidden' in members and (hidden is None or any(not isinstance(value, str) for value in hidden.values())):
        _failure('hidden must be an object of strings')
    if hidden is not None and action is None:
        _failure('hidden requires action')
    form_errors = members.get('formErrors', [])
    if not isinstance(form_errors, list) or any(not isinstance(item, str) for item in form_errors):
        _failure('formErrors must be a list of strings')
    errors = members.get('errors', [])
    records = [_members(record) for record in errors] if isinstance(errors, list) else None
    if records is None or any(
        record is None or not isinstance(record.get('path'), str) or not isinstance(record.get('message'), str)
        for record in records
    ):
        _failure('errors must be a list of objects with string path and message')
    node_errors = {}
    if records:
        by_path = {}
        _nodes_by_path(nodes, None, by_path)
        for record in records:
            node = by_path.get(record['path'])
            if node is None:
                _failure(f"Unknown error path: {record['path']}")
            node_errors.setdefault(id(node), []).append(record['message'])
    form = None
    if action is not None:
        declared = _members(template_action) or {}

        def value(key):
            found = action.get(key, declared.get(key))
            return found if isinstance(found, str) else None

        form = {
            key: item
            for key, item in (
                ('action', None if value('url') is None else render_url(value('url'))),
                ('encType', value('enctype')),
                ('method', value('method')),
            )
            if item is not None
        }
    pairs = [[str(name), value] for name, value in (hidden or {}).items()]
    return {'form': form, 'hidden': pairs, 'formErrors': form_errors, 'nodeErrors': node_errors}


def _invalid_action(action):
    for key, value in action.items():
        if key not in _ACTION_MEMBERS or not isinstance(value, str):
            return True
    return False


def _nodes_by_path(nodes, parent, out):
    """Every node with a data path, by that path.

    A row's path is its collection path, `.` and its key.
    """
    for node in nodes:
        if node['kind'] == 'row':
            path = f"{parent}.{node['key']}"
        elif node['kind'] == 'lang-item':
            path = None
        else:
            path = node.get('path')
        if path is not None:
            out[path] = node
        _nodes_by_path(node.get('children', []), path, out)


def _failure(message):
    raise FormError('INVALID_FORM_INPUT', message)
