"""Path resolution and condition evaluation.

Resolves relative paths (`.`, `..`, one row key and its collection name being
one level together), absolute paths, array wildcards and array indices, and
evaluates a parsed expression against the form data. Comparison coercion is
deliberately lenient — the number a value converts to, 0 for anything else —
and never the strict numeric reading the value rules use.
"""

import math
import re

from .jsvalue import js_number, js_parse_float, js_string

__all__ = [
    'evaluate_condition',
    'evaluate_expression_value',
    'get_field_name',
    'get_value_by_path',
    'has_wildcard',
    'path_to_string',
    'parse_path_string',
    'resolve_field_reference',
    'resolve_path_segments',
    'resolve_wildcard_path',
]

_INDEX = re.compile(r'^\d+$')


def resolve_path_segments(path_node, context):
    """Resolve a path node to absolute path segments."""
    current_path = context['currentPath']
    relative = path_node['relative']
    if relative:
        # The current field is one level and each further dot moves one more level up; a row key
        # and the name of its collection leave together.
        base_path = list(current_path)
        row_keys = context.get('rowKeys') or []
        for _level in range(path_node['levelsUp'] + 1):
            if not base_path:
                break
            leaving = 2 if (len(base_path) - 1) in row_keys else 1
            base_path = base_path[:max(0, len(base_path) - leaving)]
    else:
        base_path = []
    for segment in path_node['segments']:
        if segment['type'] == 'identifier':
            base_path.append(segment['value'])
        elif segment['type'] == 'index':
            base_path.append(_number_text(segment['value']))
        elif segment['type'] == 'wildcard':
            base_path.append('*')
    return base_path


def _number_text(value):
    """The path text of a number segment: an integer plainly, a float as written."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def get_value_by_path(data, path):
    """Get a value by path segments from a data object.

    A list answers a numeric segment like a JavaScript array index does.
    """
    current = data
    for segment in path:
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(segment)
        elif isinstance(current, list) and _INDEX.match(segment) and int(segment) < len(current):
            current = current[int(segment)]
        else:
            return None
    return current


def has_wildcard(path):
    """Whether a path contains a wildcard."""
    return '*' in path


def resolve_wildcard_path(path, form_data, current_index=None):
    """Resolve a path with wildcards to concrete paths and values.

    Each wildcard takes every index of the array it names, or the index of the
    current row when `current_index` is given.
    """
    if '*' not in path:
        return [{'path': list(path), 'value': get_value_by_path(form_data, path)}]
    wildcard_index = path.index('*')
    array_path = path[:wildcard_index]
    remaining = path[wildcard_index + 1:]
    array_data = get_value_by_path(form_data, array_path)

    # An object under a wildcard (a keyed collection) is read without the index.
    if isinstance(array_data, dict):
        return resolve_wildcard_path([*array_path, *remaining], form_data)
    if not isinstance(array_data, list):
        return []

    results = []
    indexes = [current_index] if current_index is not None else range(len(array_data))
    for index in indexes:
        if index is None:
            continue
        results.extend(
            resolve_wildcard_path([*array_path, str(index), *remaining], form_data)
        )
    return results


def replace_wildcard_with_index(path, current_path):
    """Replace each wildcard with the array index of the current path in order."""
    result = []
    current_array_index = 0
    array_indices = [int(segment) for segment in current_path if _INDEX.match(segment)]
    for segment in path:
        if segment == '*':
            index = (
                array_indices[current_array_index]
                if current_array_index < len(array_indices)
                else None
            )
            if index is not None:
                result.append(str(index))
                current_array_index += 1
            else:
                result.append('*')
        else:
            result.append(segment)
    return result


def _is_missing(value):
    """The JavaScript `undefined`, which Python holds as a distinct marker."""
    return value is _UNDEFINED


_UNDEFINED = object()


def evaluate_condition(node, context, wildcard_strategy='CURRENT'):
    """Evaluate an AST node to a boolean."""
    kind = node['type']
    if kind == 'Binary':
        return _evaluate_binary(node, context, wildcard_strategy)
    if kind == 'Unary':
        return _evaluate_unary(node, context, wildcard_strategy)
    if kind == 'In':
        return _evaluate_in(node, context, wildcard_strategy)
    if kind == 'Group':
        return evaluate_condition(node['expression'], context, wildcard_strategy)
    if kind == 'Ternary':
        # In a boolean context a ternary's value is read for its truthiness.
        return _truthy(_evaluate_ternary(node, context, wildcard_strategy))
    if kind in ('Path', 'Literal'):
        return _truthy(_resolve_value(node, context, wildcard_strategy))
    return False


def evaluate_expression_value(node, context, wildcard_strategy='CURRENT'):
    """Evaluate an AST node to its value: a ternary keeps its branch value."""
    kind = node['type']
    if kind == 'Ternary':
        return _evaluate_ternary(node, context, wildcard_strategy)
    if kind == 'Group':
        return evaluate_expression_value(node['expression'], context, wildcard_strategy)
    if kind in ('Binary', 'Unary', 'In', 'Path', 'Literal'):
        # Every other expression is a condition and evaluates to a boolean.
        return evaluate_condition(node, context, wildcard_strategy)
    return None


def _truthy(value):
    """JavaScript truthiness."""
    if value is None or value is _UNDEFINED:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value != ''
    return True


def _resolve_branch_value(node, context, wildcard_strategy):
    """The value of a ternary branch: a nested ternary, a literal, a path or a condition."""
    kind = node['type']
    if kind == 'Ternary':
        return _evaluate_ternary(node, context, wildcard_strategy)
    if kind == 'Group':
        return _resolve_branch_value(node['expression'], context, wildcard_strategy)
    if kind == 'Literal':
        return node['value']
    if kind == 'Path':
        return _resolve_value(node, context, wildcard_strategy)
    if kind == 'Binary':
        return _evaluate_binary(node, context, wildcard_strategy)
    if kind == 'Unary':
        return _evaluate_unary(node, context, wildcard_strategy)
    if kind == 'In':
        return _evaluate_in(node, context, wildcard_strategy)
    return _UNDEFINED


def _evaluate_ternary(node, context, wildcard_strategy):
    if evaluate_condition(node['condition'], context, wildcard_strategy):
        return _resolve_branch_value(node['trueValue'], context, wildcard_strategy)
    return _resolve_branch_value(node['falseValue'], context, wildcard_strategy)


def _evaluate_binary(node, context, wildcard_strategy):
    operator = node['operator']
    left, right = node['left'], node['right']
    if operator == '&&':
        return evaluate_condition(left, context, wildcard_strategy) and evaluate_condition(
            right, context, wildcard_strategy
        )
    if operator == '||':
        return evaluate_condition(left, context, wildcard_strategy) or evaluate_condition(
            right, context, wildcard_strategy
        )
    left_value = _resolve_value(left, context, wildcard_strategy)
    right_value = _resolve_value(right, context, wildcard_strategy)
    if isinstance(left_value, list):
        return _with_strategy(
            left_value,
            lambda item: _compare(item, right_value, operator),
            wildcard_strategy,
        )
    return _compare(left_value, right_value, operator)


def _evaluate_unary(node, context, wildcard_strategy):
    if node['operator'] == '!':
        return not evaluate_condition(node['operand'], context, wildcard_strategy)
    return False


def _evaluate_in(node, context, wildcard_strategy):
    value = _resolve_value(node['value'], context, wildcard_strategy)
    items = [_resolve_value(item, context, wildcard_strategy) for item in node['list']]
    if isinstance(value, list):
        def check(item):
            included = any(_loose_equals(item, candidate) for candidate in items)
            return not included if node['negated'] else included

        return _with_strategy(value, check, wildcard_strategy)
    included = any(_loose_equals(value, item) for item in items)
    return not included if node['negated'] else included


def _with_strategy(values, predicate, strategy):
    if strategy == 'ANY':
        return any(predicate(value) for value in values)
    if strategy == 'ALL':
        return all(predicate(value) for value in values)
    if strategy == 'NONE':
        return all(not predicate(value) for value in values)
    if strategy == 'CURRENT':
        return bool(values) and predicate(values[0])
    return False


def _resolve_value(node, context, wildcard_strategy):
    kind = node['type']
    if kind == 'Literal':
        return node['value']
    if kind == 'Path':
        resolved_path = resolve_path_segments(node, context)
        if has_wildcard(resolved_path):
            if wildcard_strategy == 'CURRENT':
                resolved_path = replace_wildcard_with_index(resolved_path, context['currentPath'])
            if has_wildcard(resolved_path):
                # Still has wildcards: resolve to the list of the values it names.
                return [
                    entry['value']
                    for entry in resolve_wildcard_path(resolved_path, context['formData'])
                ]
        return get_value_by_path(context['formData'], resolved_path)
    if kind == 'Group':
        return evaluate_condition(node['expression'], context, wildcard_strategy)
    return _UNDEFINED


def _compare(left, right, operator):
    if operator == '==':
        return _loose_equals(left, right)
    if operator == '!=':
        return not _loose_equals(left, right)
    left_number = _coerce_number(left)
    right_number = _coerce_number(right)
    if operator == '>':
        return left_number > right_number
    if operator == '>=':
        return left_number >= right_number
    if operator == '<':
        return left_number < right_number
    if operator == '<=':
        return left_number <= right_number
    return False


def _typeof(value):
    """The JavaScript `typeof` a value: null, lists and objects are one type."""
    if value is _UNDEFINED:
        return 'undefined'
    if value is None or isinstance(value, (list, dict)):
        return 'object'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, (int, float)):
        return 'number'
    return 'string'


def _loose_equals(left, right):
    """Loose equality, like JavaScript `==`.

    Values of one type compare strictly (two objects by identity); values of
    different types compare numerically when both convert to a number, else by
    their string conversion.
    """
    if _typeof(left) == _typeof(right):
        if _typeof(left) == 'object':
            return left is right
        return left == right
    if left is None or _is_missing(left):
        return right is None or _is_missing(right)
    if right is None or _is_missing(right):
        return False
    left_number = js_number(left)
    right_number = js_number(right)
    if not math.isnan(left_number) and not math.isnan(right_number):
        return left_number == right_number
    return js_string(left) == js_string(right)


def _coerce_number(value):
    """The number a value coerces to for a condition comparison."""
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        number = js_parse_float(value)
        return 0 if math.isnan(number) else number
    return 0


def resolve_field_reference(expression, context):
    """Resolve a simple field reference expression to its value.

    Supports `.field` and `..field` relative references (a row being one
    level), `a.b.c` references from the data root with wildcards, and a bare
    `field` resolved as `.field`.
    """
    trimmed = expression.strip()
    if trimmed == '':
        return _UNDEFINED
    form_data = context['formData']
    dots = 0
    while dots < len(trimmed) and trimmed[dots] == '.':
        dots += 1
    if dots > 0 or '.' not in trimmed:
        field_path = trimmed[dots:]
        path_node = {
            'type': 'Path',
            'relative': True,
            'levelsUp': max(0, dots - 1),
            'segments': [
                {'type': 'wildcard'} if segment == '*' else {'type': 'identifier', 'value': segment}
                for segment in parse_path_string(field_path)
            ],
            'position': {'start': 0, 'end': len(trimmed)},
        }
        resolved = resolve_path_segments(path_node, context)
        if has_wildcard(resolved):
            resolved = replace_wildcard_with_index(resolved, context['currentPath'])
        return get_value_by_path(form_data, resolved)
    segments = parse_path_string(trimmed)
    if has_wildcard(segments):
        segments = replace_wildcard_with_index(segments, context['currentPath'])
    return get_value_by_path(form_data, segments)


def parse_path_string(path_string):
    """Split a dotted path into its non-empty segments."""
    if not path_string:
        return []
    return [segment for segment in path_string.split('.') if segment]


def path_to_string(path):
    """Join path segments with dots, numeric indices and row keys included."""
    return '.'.join(path)


def get_field_name(path):
    """The last segment of a path."""
    return path[-1] if path else ''
