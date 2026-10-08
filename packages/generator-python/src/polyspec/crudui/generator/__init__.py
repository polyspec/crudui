"""Compile form structures, bind values and render forms or lists.

`Generator` holds the operations of the four passes: compile a specification
into a template, bind data to the fields of a template, create a form
instance, and render a form, a list or a detail. The failures it raises are
`FormError` with `INVALID_FORM_INPUT` or `UNSUPPORTED_FIELD_TYPE`, and the
composition failures of `polyspec.crudui.validator`.
"""

from .binding import bind as _bind_fields
from . import buttons as _buttons
from .details import build as _detail_build
from .details import render as _detail_render
from .errors import FormError
from .form import Form, createRowKey, sequenceRowKey
from .form_render import model as _render_model
from .input_text import inputs as _check_inputs
from .input_text import specification as _check_specification
from .lists import build_public as _list_build
from .lists import render as _list_render
from .rendering import form as _render_form
from .template import compile as _template_compile

__all__ = ['Form', 'FormError', 'Generator']


class Generator:
    """The public operations over specifications, templates and instances."""

    @staticmethod
    def compileForm(spec, options=None):
        """A JSON-serializable structure without record data."""
        options = options or {}
        _check_specification(spec, options)
        _check_inputs([], options, ('basepath', 'keyPrefix'))
        return _template_compile(spec, options)

    @staticmethod
    def bindForm(template, data=None, options=None):
        """Evaluated fields without modifying the template or the record data."""
        options = options or {}
        _check_inputs(
            [('template', template), ('data', data if data is not None else {})],
            options,
            ('idPrefix', 'keyPrefix', 'language', 'unsupported'),
        )
        return _bind_fields(template, data if data is not None else {}, options)

    @staticmethod
    def bindButtons(template, data=None, options=None):
        """The template buttons for a record, with type, tag, text and ordered attrs."""
        options = options or {}
        _check_inputs(
            [('template', template), ('data', data if data is not None else {})],
            options,
            ('idPrefix', 'keyPrefix', 'language', 'unsupported'),
        )
        return _buttons.bind_public(template, data if data is not None else {}, options)

    @staticmethod
    def formButtonsHtml(buttons):
        """Evaluated buttons as the markup every renderer places in the form footer.

        Any other element is rejected.
        """
        return _buttons.html_public(buttons)

    @staticmethod
    def createForm(template, data=None, options=None):
        """An independent form instance over a copied template."""
        return Form(template, data, options)

    @staticmethod
    def renderForm(form, options=None):
        """The current instance as the complete form.

        `options` may carry action, hidden, formErrors and errors members; an
        option outside the contract is a `FormError`.
        """
        options = {} if options is None else options
        fields = form.getFields()
        model = _render_model(fields, form.getTemplate().get('action'), options)
        return _render_form(
            fields, form.getButtons(), form.getMessages(), model, form.getDescription()
        )

    @staticmethod
    def renderList(spec, rows, options=None):
        """Supplied list rows with the table or card layout."""
        options = options or {}
        _display_checks(spec, ('rows', rows), options)
        return _list_render(spec, rows, options)

    @staticmethod
    def buildList(spec, rows=None, options=None):
        """One read-only list model from supplied rows."""
        options = options or {}
        _display_checks(spec, ('rows', rows or []), options)
        return _list_build(spec, rows or [], options)

    @staticmethod
    def renderDetail(spec, record=None, options=None):
        """One read-only detail from a supplied record."""
        options = options or {}
        _display_checks(spec, ('record', record if record is not None else {}), options)
        return _detail_render(spec, record, options)

    @staticmethod
    def buildDetail(spec, record=None, options=None):
        """One read-only detail model from a supplied record."""
        options = options or {}
        _display_checks(spec, ('record', record if record is not None else {}), options)
        return _detail_build(spec, record, options)

    @staticmethod
    def sequenceRowKey(sequence):
        """A nonnegative sequence formatted with thirteen decimal digits."""
        return sequenceRowKey(sequence)

    @staticmethod
    def createRowKey():
        """A thirteen-character hexadecimal row key."""
        return createRowKey()


def _display_checks(spec, entry, options):
    """Input text of a list or detail operation: the specification and files,
    then the rows or record, then the display options."""
    _check_specification(spec, options)
    _check_inputs([entry], options, ('basepath', 'data', 'language', 'layout'))
