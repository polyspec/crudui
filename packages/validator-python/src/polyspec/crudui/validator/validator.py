"""The form validator: field traversal and validate-slot evaluation.

The third pass of the pipeline. It consumes a composed CRUDUI field model (the
`validate`/`design`/`behavior`/`options` role slots) after the compose pass has
expanded `$ref`/`$patch` into a single specification, and does not reimplement
the rule semantics or the expression engine — it calls the rule registry and
the expression engine. The logic here is: reading the `validate` slot,
evaluating a rule value that is an expression or a condition map (the
condition is the value's expression, never a separate `if`/`when` key), and
resolving `design.show` like a conditional parameter to skip hidden fields.

Pipeline:

1. compose — the caller expands the specification before this engine; an
   unresolved composition is a `ComposeLoadError`, never a valid result.
2. field traversal — recurse `properties`; group nesting and keyed `multiple`
   rows (sorted keys). A field whose `design.show` resolves to false is hidden:
   it and everything it contains is skipped for rules and kept for conditions.
3. validate-slot evaluation — per field, walk the `validate` slot in
   declaration order; for each rule, evaluate its value to the effective
   parameter, skip when the result is false or null, otherwise run the rule
   function. `type: number` runs an implicit `number` rule first when no
   explicit one is declared.
4. error collection — the first error per field stops that field; the errors
   collect into one flat list and `valid` is the absence of errors.
"""

import re

from .compose import MemoryLoader, compose_properties, compose_spec, compose_root
from .compose_errors import ComposeLoadError
from .errors import FormInputError
from .forbidden import scan_forbidden_keys
from .jsvalue import compare_code_points, ordered_value
from .parser import is_condition_expression, parse_condition
from .resolver import evaluate_condition as _eval_condition
from .resolver import evaluate_expression_value as _eval_value
from .resolver import get_field_name, path_to_string
from .rules import get_rule, rule_parameter_failure
from .text import check_input_text, check_option_text, checked_composition

__all__ = ['ARRAY_LEVEL_RULES', 'FormInputError', 'Validator', 'validate']

ARRAY_LEVEL_RULES = ('required', 'unique', 'mincount', 'maxcount')
PATH_REFERENCE_RULES = ('equalTo', 'notEqual', 'unique', 'enddate')
LITERAL_PARAM_RULES = ('accept',)
REGEX_PARAM_RULES = ('match', 'pattern')
MEMBERSHIP_PARAM_RULES = ('in',)

SINGLE_CHOICE_TYPES = frozenset(('select', 'dropdown', 'selectbox', 'choice', 'radio'))


def _is_object(value):
    return value is not None and isinstance(value, dict)


def _is_multiple_field(field):
    """Whether a field repeats (`multiple: true`, `multiple: only` or an object)."""
    multiple = field.get('multiple')
    return multiple is True or multiple == 'only' or _is_object(multiple)


def _is_single_choice(field):
    """Whether a field is a single-choice field: a single-choice type without `lang`."""
    lang = field.get('lang')
    return field.get('type') in SINGLE_CHOICE_TYPES and (lang is None or lang is False)


def _assert_single_choice_data(value, path, repeated):
    """Reject an array or object as the value of a single-choice field.

    Rows of a repeated one are checked in sorted key order.
    """
    if repeated:
        entries = [([*path, key], value[key]) for key in sorted(value)]
    else:
        entries = [(path, value)]
    for entry_path, entry in entries:
        if isinstance(entry, (dict, list)):
            raise FormInputError(
                f'Choice data must be a single value: {path_to_string(entry_path)}'
            )


def _normalize_validate_slot(slot):
    """Normalize a polymorphic `validate` slot to a rule map.

    `false`, `true` and an absent slot carry no sub-rules; a non-object value
    carries none either.
    """
    if slot is False or slot is True or slot is None:
        return None
    if isinstance(slot, dict):
        return slot
    return None


def _field_messages(field):
    """The per-field custom messages of the field's `messages` map."""
    messages = field.get('messages')
    return messages if isinstance(messages, dict) else None


def _is_ternary(expression):
    """Whether a string parses as a complete ternary expression."""
    try:
        return parse_condition(expression)['type'] == 'Ternary'
    except Exception:
        return False


def _is_valid_expression(expression):
    """Whether a string parses as a complete expression; any other string is a literal."""
    try:
        parse_condition(expression)
        return True
    except Exception:
        return False


def _rule_value_form(rule_name, rule_value):
    """How a declared rule value becomes the rule's effective parameter.

    Path-reference, literal-param, regex and membership rules keep their
    parameter verbatim — never evaluated as a condition. A plain object is a
    condition map (expression to value, declaration order). A string that
    parses as a ternary selects its branch value. Another string that parses
    as a condition expression evaluates to its value. Anything else is a
    literal parameter.
    """
    if (
        rule_name in PATH_REFERENCE_RULES
        or rule_name in LITERAL_PARAM_RULES
        or rule_name in REGEX_PARAM_RULES
        or rule_name in MEMBERSHIP_PARAM_RULES
    ):
        return 'literal'
    if _is_object(rule_value):
        return 'conditionMap'
    if isinstance(rule_value, str):
        if _is_ternary(rule_value):
            return 'ternary'
        if (
            is_condition_expression(rule_value)
            and re.search(r'\?[^:]*:', rule_value) is None
            and _is_valid_expression(rule_value)
        ):
            return 'expression'
    return 'literal'


def _ternary_literals(node):
    """Every literal branch of a ternary, through nested ternaries and groups."""
    kind = node['type']
    if kind == 'Ternary':
        return [*_ternary_literals(node['trueValue']), *_ternary_literals(node['falseValue'])]
    if kind == 'Group':
        return _ternary_literals(node['expression'])
    if kind == 'Literal':
        return [node['value']]
    return []


def _declared_literals(rule_name, rule_value):
    """The literals a declared rule value can make the effective parameter.

    The value itself, every value of a condition map and every literal branch
    of a ternary; a plain condition expression always reads the data.
    """
    form = _rule_value_form(rule_name, rule_value)
    if form == 'literal':
        return [rule_value]
    if form == 'conditionMap':
        return list(rule_value.values())
    if form == 'ternary':
        return _ternary_literals(parse_condition(rule_value))
    return []


class _ValidationRun:
    """The state of one validation, dropped when it returns.

    For each collection field (container path, field name and filter), the row
    keys whose `unique` value an earlier row already holds.
    """

    def __init__(self):
        self.unique_duplicates = {}


class Validator:
    """The validator of one composed specification: a group with `properties`."""

    def __init__(self, composed_spec):
        properties = composed_spec.get('properties')
        self.properties = properties if _is_object(properties) else {}
        self.run = _ValidationRun()

    def validate(self, data):
        """Validate `data` against the composed specification.

        Raises `FormInputError` when root, group or repeated data has the wrong
        shape.
        """
        if not _is_object(data):
            raise FormInputError('Form data must be an object')
        self._check_declared_parameters(self.properties, [])
        self.run = _ValidationRun()
        errors = []
        self._validate_properties(self.properties, data, [], [], [], data, errors)
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'hidden': self.hidden_paths(data),
        }

    def hidden_paths(self, data):
        """The data paths of the fields whose `design.show` resolves to false.

        The paths come in declaration order, each field of a group row under
        the row's key and the fields inside a hidden field included. Data of
        another shape is read as missing.
        """
        hidden = []
        self._collect_hidden(self.properties, data, [], [], data, hidden)
        return hidden

    def _collect_hidden(self, properties, data, current_path, row_keys, all_data, hidden):
        for name, field in properties.items():
            if not _is_object(field):
                continue
            field_path = [*current_path, name]
            if self._is_hidden(
                field, {'currentPath': field_path, 'rowKeys': row_keys, 'formData': all_data}
            ):
                hidden.append(path_to_string(field_path))
            children = self._child_properties(field)
            if field.get('type') != 'group' or children is None:
                continue
            value = data.get(name) if isinstance(data, dict) else None
            if not _is_multiple_field(field):
                self._collect_hidden(
                    children, value if _is_object(value) else {}, field_path, row_keys, all_data, hidden
                )
                continue
            rows = value if _is_object(value) else {}
            for key in sorted(rows):
                row = rows[key]
                self._collect_hidden(
                    children,
                    row if _is_object(row) else {},
                    [*field_path, key],
                    [*row_keys, len(field_path)],
                    all_data,
                    hidden,
                )

    def _check_declared_parameters(self, properties, declaration_path):
        """Check every declared rule name and parameter before any value is validated.

        Fields come in declaration order (a group before its children), each
        field's rules in declaration order and then its `messages` keys. Every
        literal a condition map or a ternary can select is checked here,
        selected or not; a value taken from the data is checked when it is
        selected.
        """
        for property_key, field in properties.items():
            if not _is_object(field):
                continue
            path = [*declaration_path, property_key]
            rules = _normalize_validate_slot(field.get('validate'))
            for rule_name, rule_value in (rules or {}).items():
                _assert_rule_name(rule_name, path)
                for literal in _declared_literals(rule_name, rule_value):
                    _assert_rule_parameter(rule_name, literal, path)
            for rule_name in _field_messages(field) or {}:
                _assert_rule_name(rule_name, path)
            child_properties = self._child_properties(field)
            if field.get('type') == 'group' and child_properties is not None:
                self._check_declared_parameters(child_properties, path)

    def _validate_properties(
        self, properties, data, current_path, row_keys, declaration_path, all_data, errors, inside_hidden=False
    ):
        # Code point order, which a Python string holds natively; the input text
        # check has rejected every string that is not Unicode scalar values.
        for name in sorted(data):
            if name not in properties:
                raise FormInputError(
                    f'Unknown form data field: {path_to_string([*current_path, name])}'
                )
        for property_key, field in properties.items():
            if not _is_object(field):
                continue
            field_name = property_key
            is_multiple = _is_multiple_field(field)
            field_path = [*current_path, field_name]
            field_declaration = [*declaration_path, field_name]
            present = field_name in data
            field_value = data.get(field_name)

            # A hidden field and every field it contains are not evaluated; its value
            # is kept for conditions and references elsewhere. The data shape is an
            # input contract, so hidden data is still traversed for shape checks.
            hidden = inside_hidden or self._is_hidden(
                field, {'currentPath': field_path, 'rowKeys': row_keys, 'formData': all_data}
            )
            children = self._child_properties(field)
            if is_multiple and present and not _is_object(field_value):
                raise FormInputError(
                    f'Repeated data must be a keyed object: {path_to_string(field_path)}'
                )
            if present and _is_single_choice(field):
                _assert_single_choice_data(field_value, field_path, is_multiple)

            if field.get('type') == 'group' and children is not None:
                if is_multiple:
                    # Keyed rows use sorted-key traversal so the first reported error is
                    # identical in every validation implementation. Row keys stay in
                    # paths. Missing data is an empty collection: no rows, and the
                    # collection rules still run.
                    rows = field_value if present else {}
                    for key in sorted(rows):
                        row = rows[key]
                        if not _is_object(row):
                            raise FormInputError(
                                f'Group data must be an object: {path_to_string([*field_path, key])}'
                            )
                        self._validate_properties(
                            children,
                            row,
                            [*field_path, key],
                            [*row_keys, len(field_path)],
                            field_declaration,
                            all_data,
                            errors,
                            hidden,
                        )
                    if not hidden:
                        self._validate_field_rules(
                            field, field_value, field_path, row_keys, field_declaration, all_data, errors
                        )
                else:
                    if present and not _is_object(field_value):
                        raise FormInputError(
                            f'Group data must be an object: {path_to_string(field_path)}'
                        )
                    self._validate_properties(
                        children,
                        field_value if present else {},
                        field_path,
                        row_keys,
                        field_declaration,
                        all_data,
                        errors,
                        hidden,
                    )
                    if not hidden:
                        self._validate_field_rules(
                            field, field_value, field_path, row_keys, field_declaration, all_data, errors
                        )
            elif hidden:
                continue
            elif is_multiple:
                # Repeated scalar field: collection rules on the keyed object, the
                # rest on each row value. Missing data is an empty collection.
                self._validate_multiple_field_rules(
                    field, field_value if present else None, field_path, row_keys, field_declaration, all_data, errors
                )
            else:
                self._validate_field_rules(
                    field, field_value, field_path, row_keys, field_declaration, all_data, errors
                )

    def _is_hidden(self, field, context):
        """Whether a field's `design.show` resolves to false in its row context.

        `design.show` resolves like a conditional parameter: a boolean, an
        expression or a condition map. A field without `design.show` is
        visible.
        """
        design = field.get('design')
        if not _is_object(design) or 'show' not in design:
            return False
        return self._resolve_rule_value('show', design['show'], context) is False

    def _child_properties(self, field):
        """The child field map of a group, or None."""
        properties = field.get('properties')
        return properties if _is_object(properties) else None

    def _validate_multiple_field_rules(
        self, field, values, field_path, row_keys, declaration_path, all_data, errors
    ):
        """Collection rules and per-row rules for a repeated scalar field."""
        rules = _normalize_validate_slot(field.get('validate'))
        messages = _field_messages(field)
        # 1. Array-level rules in declaration order; the first error wins for the field.
        if rules:
            context = {'currentPath': field_path, 'rowKeys': row_keys, 'formData': all_data}
            for rule_name, rule_value in rules.items():
                if rule_name not in ARRAY_LEVEL_RULES:
                    continue
                error = self._run_rule(
                    rule_name, rule_value, values, context, declaration_path, field, messages
                )
                if error is not None:
                    errors.append(
                        {
                            'path': path_to_string(field_path),
                            'field': get_field_name(field_path),
                            'rule': rule_name,
                            'message': error,
                            'value': None if values is None else values,
                        }
                    )
                    return
        # 2. Row rules in sorted row-key order (the error-order contract).
        rows = values if values is not None else {}
        for key in sorted(rows):
            self._validate_element_rules(
                field,
                rows[key],
                [*field_path, key],
                [*row_keys, len(field_path)],
                declaration_path,
                all_data,
                errors,
            )

    def _validate_element_rules(
        self, field, value, item_path, row_keys, declaration_path, all_data, errors
    ):
        """Element-level rules for one element of a `multiple` field."""
        context = {'currentPath': item_path, 'rowKeys': row_keys, 'formData': all_data}
        messages = _field_messages(field)
        rules = _normalize_validate_slot(field.get('validate'))
        if self._run_implicit_number(field, rules, value, context, declaration_path, messages, item_path, errors):
            return
        if not rules:
            return
        for rule_name, rule_value in rules.items():
            if rule_name in ARRAY_LEVEL_RULES:
                continue
            error = self._run_rule(rule_name, rule_value, value, context, declaration_path, field, messages)
            if error is not None:
                errors.append(
                    {
                        'path': path_to_string(item_path),
                        'field': get_field_name(item_path),
                        'rule': rule_name,
                        'message': error,
                        'value': None if value is None else value,
                    }
                )
                break

    def _validate_field_rules(
        self, field, value, field_path, row_keys, declaration_path, all_data, errors
    ):
        """All rules for a single (scalar or group-as-whole) field."""
        context = {'currentPath': field_path, 'rowKeys': row_keys, 'formData': all_data}
        messages = _field_messages(field)
        rules = _normalize_validate_slot(field.get('validate'))
        if self._run_implicit_number(field, rules, value, context, declaration_path, messages, field_path, errors):
            return
        if not rules:
            return
        for rule_name, rule_value in rules.items():
            error = self._run_rule(rule_name, rule_value, value, context, declaration_path, field, messages)
            if error is not None:
                errors.append(
                    {
                        'path': path_to_string(field_path),
                        'field': get_field_name(field_path),
                        'rule': rule_name,
                        'message': error,
                        'value': None if value is None else value,
                    }
                )
                break

    def _run_implicit_number(
        self, field, rules, value, context, declaration_path, messages, path, errors
    ):
        """`type: number` runs an implicit `number` rule before everything else.

        It runs only when no explicit `number` rule is declared, and is
        reported as the rule `number`. Returns True when it pushed an error.
        """
        if field.get('type') != 'number':
            return False
        if rules is not None and 'number' in rules:
            return False
        error = self._run_rule('number', True, value, context, declaration_path, field, messages)
        if error is not None:
            errors.append(
                {
                    'path': path_to_string(path),
                    'field': get_field_name(path),
                    'rule': 'number',
                    'message': error,
                    'value': None if value is None else value,
                }
            )
            return True
        return False

    def _run_rule(self, rule_name, rule_value, value, context, declaration_path, field, messages):
        """Run one rule: evaluate its (possibly conditional) value to the effective parameter,
        skip when the result disables the rule, else call the rule function."""
        effective_param = self._resolve_rule_value(rule_name, rule_value, context)
        # A false or null effective param disables the rule.
        if effective_param is False or effective_param is None:
            return None
        # A value taken from the data is checked when it is selected, before the
        # empty-value skip. Declared literals already passed at load, so checking
        # every resolved conditional value adds no other failure.
        if _rule_value_form(rule_name, rule_value) != 'literal':
            _assert_rule_parameter(rule_name, effective_param, declaration_path)
        rule = get_rule(rule_name)
        if rule is None:
            # Rule names are checked when the specification loads.
            raise RuntimeError(f'Rule {rule_name} is not registered')
        validation_context = {
            'path': path_to_string(context['currentPath']),
            'field': get_field_name(context['currentPath']),
            'value': value,
            'allData': context['formData'],
            # The rule reads `spec.type`/`spec.messages` only; pass the field as is.
            'spec': field,
            'pathSegments': context['currentPath'],
            'rowKeys': context.get('rowKeys') or [],
            'ruleParam': effective_param,
            'messages': messages,
            'ruleName': rule_name,
            'run': self.run,
        }
        return rule(validation_context)

    def _resolve_rule_value(self, rule_name, rule_value, context):
        """Resolve a rule value to the effective parameter."""
        form = _rule_value_form(rule_name, rule_value)
        if form == 'conditionMap':
            return self._resolve_condition_map(rule_value, context)
        if form == 'ternary':
            return self._evaluate_ternary(rule_value, context)
        if form == 'expression':
            return self._evaluate_expression_value(rule_value, context)
        return rule_value

    def _resolve_condition_map(self, condition_map, context):
        """Evaluate a condition map: the value of the first truthy key in
        declaration order, then the `true` key, else None (rule disabled)."""
        for key in condition_map:
            if key == 'true':
                continue  # The default is the fallback, evaluated last.
            if self._evaluate_condition(key, context):
                return condition_map[key]
        if 'true' in condition_map:
            return condition_map['true']
        return None

    def _evaluate_ternary(self, expression, context):
        """Evaluate a ternary; its selected branch value is the parameter.

        A ternary that cannot be evaluated remains the literal string.
        """
        try:
            return _eval_value(parse_condition(expression), context, 'CURRENT')
        except Exception:
            return expression

    def _evaluate_condition(self, expression, context):
        try:
            return _eval_condition(parse_condition(expression), context, 'CURRENT')
        except Exception:
            return False

    def _evaluate_expression_value(self, expression, context):
        try:
            return _eval_value(parse_condition(expression), context, 'CURRENT')
        except Exception:
            return False


def _assert_rule_parameter(rule_name, param, declaration_path):
    """Raise the load failure of an effective parameter outside the definitions."""
    failure = rule_parameter_failure(rule_name, param)
    if failure is not None:
        code, message = failure
        raise ComposeLoadError(code, message, declaration_path)


def _assert_rule_name(rule_name, declaration_path):
    """Raise the load failure of a `validate` or `messages` key that is not a rule."""
    if get_rule(rule_name) is None:
        raise ComposeLoadError('UNKNOWN_RULE', f'Unknown rule: {rule_name}', declaration_path)


def _files_loader(options):
    """The memory loader of the `files` option, each document in specification member order."""
    files = options.get('files') or {}
    return MemoryLoader(
        {key: ordered_value(document) for key, document in files.items()}
        if isinstance(files, dict)
        else files
    )


def _composed_properties(spec, checked, options):
    """The composed `properties` of a root specification, scanned for forbidden keys."""
    loader = checked if checked is not None else _files_loader(options)
    opts = {'basepath': options['basepath']} if options.get('basepath') else {}

    # Two entry shapes: a full root group spec composes as a whole, and a
    # properties-layer composition entry (`$ref`/`$patch` with no own
    # `properties`) composes as a properties map directly.
    has_own_properties = _is_object(spec.get('properties'))
    is_composition_entry = '$ref' in spec or '$patch' in spec
    if is_composition_entry and not has_own_properties:
        properties = compose_properties(spec, loader, opts)
    else:
        properties = compose_spec(spec, loader, opts).get('properties') or {}

    # Walk the composed single specification to arbitrary depth and reject any
    # forbidden meta key before validation entry; the form root declarations
    # are scanned like the fields they sit beside.
    scan_forbidden_keys(properties, ['properties'])
    for key in ('buttons', 'action'):
        if key in spec:
            scan_forbidden_keys(spec[key], [key])
    return properties


def validate(spec, data, options=None):
    """Validate `data` against a CRUDUI specification.

    The specification may carry `$ref`/`$patch`; they are expanded first. Input
    text is checked before composition: the specification and files, the data,
    then the options. Root data is a request precondition, checked before
    composition too.

    Raises `ComposeLoadError` when the composition cannot be resolved (a load
    failure, never a valid result) and `FormInputError` when the data has the
    wrong shape.
    """
    options = options or {}
    checked = checked_composition(spec, options)
    check_input_text([('data', data)])
    check_option_text(options, ['basepath'])
    if not _is_object(data):
        raise FormInputError('Form data must be an object')
    ordered = ordered_value(spec)
    properties = _composed_properties(ordered, checked, options)
    return Validator({'type': 'group', 'properties': properties}).validate(data)


def hidden_paths(spec, data):
    """The data paths of the fields whose `design.show` resolves to false against `data`.

    The specification is composed without files, as the browser binding sends
    it. Raises `ComposeLoadError` when the composition cannot be resolved and
    `FormInputError` when the data is not an object.
    """
    checked = checked_composition(spec, {})
    check_input_text([('data', data)])
    if not _is_object(data):
        raise FormInputError('Form data must be an object')
    ordered = ordered_value(spec)
    properties = _composed_properties(ordered, checked, {})
    return Validator({'type': 'group', 'properties': properties}).hidden_paths(data)


def validate_list(spec, options=None):
    """Validate a CRUDUI list specification's structure.

    The `columns` map and a `{ $ref, $patch }` `search` overlay expand through
    the same composition engine the form specification uses, then the whole
    composed list tree is scanned for forbidden meta keys. No rows are
    validated: a list injects them. Raises `ComposeLoadError` for an
    unresolved composition or a forbidden key.
    """
    options = options or {}
    checked = checked_composition(spec, options)
    from .text import check_option_text

    check_option_text(options, ['basepath'])
    loader = checked if checked is not None else _files_loader(options)
    opts = {'basepath': options['basepath']} if options.get('basepath') else {}

    composed = compose_root(ordered_value(spec), loader, opts)
    if _is_object(composed.get('columns')):
        composed = {
            **composed,
            'columns': compose_properties(composed['columns'], loader, opts),
        }
    search = composed.get('search')
    if _is_object(search) and ('$ref' in search or '$patch' in search):
        composed = {**composed, 'search': compose_properties(search, loader, opts)}
    scan_forbidden_keys(composed, [])
    return {'valid': True, 'errors': []}


def validate_detail(spec, options=None):
    """Validate a detail specification's composition and forbidden-key structure.

    The root composes exactly as a list root does; the `fields` map composes as
    the composition entry point. Raises `ComposeLoadError` for an unresolved
    composition or a forbidden key.
    """
    options = options or {}
    checked = checked_composition(spec, options)
    from .text import check_option_text

    check_option_text(options, ['basepath'])
    loader = checked if checked is not None else _files_loader(options)
    opts = {'basepath': options['basepath']} if options.get('basepath') else {}

    composed = compose_root(ordered_value(spec), loader, opts)
    if _is_object(composed.get('fields')):
        scan_forbidden_keys(
            {**composed, 'fields': compose_properties(composed['fields'], loader, opts)}, []
        )
    else:
        scan_forbidden_keys(composed, [])
    return {'valid': True, 'errors': []}
