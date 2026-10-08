"""Evaluate visibility and appearance with the shared expression engine.

`design.show` resolves like a conditional parameter in the field's row context
and only a resolved `False` hides the field: a field without `design.show`, a
condition map that selects nothing and a string that is not a valid expression
leave it visible. Appearance text resolves from a literal, an expression or a
condition map: a string is an expression only when it parses completely; any
other string is literal text.
"""

import re

from polyspec.crudui.validator.parser import ParseError, is_condition_expression, parse_condition
from polyspec.crudui.validator.resolver import evaluate_condition, evaluate_expression_value

from .value import MISSING, get, string, truthy

__all__ = ['appearance', 'declared', 'flag', 'resolve', 'show']

_TERNARY_COLON = re.compile(r'\?[^:]*:')


def _context(data, path, rows):
    return {'currentPath': path, 'rowKeys': rows, 'formData': data}


def _condition(expression, data, path, rows, raw=False):
    try:
        if raw:
            return evaluate_expression_value(parse_condition(expression), _context(data, path, rows))
        return evaluate_condition(parse_condition(expression), _context(data, path, rows))
    except (ParseError, ValueError, TypeError, ZeroDivisionError):
        return False


def _condition_map(mapping, data, path, rows):
    for condition, value in mapping.items():
        if condition != 'true' and _condition(condition, data, path, rows):
            return value
    return mapping.get('true')


def show(value, data, path, rows):
    """Whether a field is visible: only a resolved false hides."""
    if value is MISSING:
        return True
    resolved = _resolve(value, data, path, rows)
    return resolved is not False


def flag(value, data, path, rows):
    """A boolean flag other than visibility.

    A missing value is false, a condition map that selects nothing is false
    and an expression that cannot be evaluated is false.
    """
    if isinstance(value, dict):
        return truthy(_condition_map(value, data, path, rows))
    if isinstance(value, str):
        return _condition(value, data, path, rows)
    return truthy(value)


def _parses(value):
    try:
        parse_condition(value)
        return True
    except (ParseError, ValueError, TypeError):
        return False


def appearance(value, data, path, rows):
    """Appearance text from a literal, an expression or a condition map."""
    if value is MISSING or value is None:
        return ''
    if isinstance(value, dict):
        resolved = _condition_map(value, data, path, rows)
        return '' if resolved is None else string(resolved)
    if isinstance(value, str):
        try:
            if parse_condition(value)['type'] == 'Ternary':
                result = evaluate_expression_value(parse_condition(value), _context(data, path, rows))
                return '' if result is None else string(result)
        except (ParseError, ValueError, TypeError, ZeroDivisionError):
            pass
        if is_condition_expression(value) and _TERNARY_COLON.search(value) is None and _parses(value):
            result = _condition(value, data, path, rows, True)
            return '' if result is False or result is None else string(result)
        return value
    return string(value)


def _resolve(value, data, path, rows):
    """The value a conditional parameter resolves to in a row context."""
    if isinstance(value, dict):
        return _condition_map(value, data, path, rows)
    if not isinstance(value, str):
        return value
    try:
        node = parse_condition(value)
    except (ParseError, ValueError, TypeError):
        return value
    if node['type'] == 'Ternary':
        try:
            return evaluate_expression_value(node, _context(data, path, rows))
        except (ValueError, TypeError, ZeroDivisionError):
            return value
    if is_condition_expression(value) and _TERNARY_COLON.search(value) is None:
        try:
            return evaluate_expression_value(node, _context(data, path, rows))
        except (ValueError, TypeError, ZeroDivisionError):
            return False
    return value


def _node(value, data, path, rows):
    return {
        'class': appearance(get(value, 'class'), data, path, rows),
        'style': appearance(get(value, 'style'), data, path, rows),
    }


def resolve(design, data, path, rows):
    """The visibility and named appearance nodes of one field."""
    design = design if isinstance(design, dict) else {}
    return {
        'show': show(get(design, 'show'), data, path, rows),
        'main': _node(design, data, path, rows),
        'label': _node(get(design, 'label'), data, path, rows),
        'wrapper': _node(get(design, 'wrapper'), data, path, rows),
        'group': _node(get(design, 'group'), data, path, rows),
        'prepend': _node(get(design, 'prepend'), data, path, rows),
    }


def declared(design, wrapper):
    """A copy of the declared control or node-root attributes, or the missing marker."""
    if wrapper and isinstance(design, dict):
        design = design.get('wrapper')
    attributes = design.get('attributes') if isinstance(design, dict) else None
    if not isinstance(attributes, dict) or not attributes:
        return MISSING
    return dict(attributes)
