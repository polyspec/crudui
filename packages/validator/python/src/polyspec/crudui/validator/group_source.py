"""Choices from a repeated group (docs/spec/schema.md, "Choices from a repeated group").

A choice field whose `items` is a group source `{from, label?}` takes its choices
from the rows of a repeated group of the same form. This module checks the
declaration of a group source and reads its choices from the data. The generator
lists the choices and the validator checks a value against them
(docs/spec/validation-rules.md, "Values").
"""

from typing import Any, TypeGuard

from .values import canonical_text, trim

__all__ = [
    "CHOICE_TYPES",
    "group_choices",
    "group_source_failure",
    "is_group_source",
]

CHOICE_TYPES = (
    "select",
    "dropdown",
    "selectbox",
    "choice",
    "radio",
    "multichoice",
    "checkboxes",
    "checkcontainer",
)


def _is_object(value: object) -> TypeGuard[dict[str, Any]]:
    return isinstance(value, dict)


def is_group_source(items: object) -> TypeGuard[dict[str, Any]]:
    """Whether `items` is a group source: an object with the member `from`."""
    return _is_object(items) and "from" in items


def _repeated(field: dict[str, Any]) -> bool:
    multiple = field.get("multiple")
    return multiple is True or multiple == "only" or _is_object(multiple)


def _has_lang(field: dict[str, Any]) -> bool:
    lang = field.get("lang")
    return lang is True or _is_object(lang)


def _scalar_child(properties: dict[str, Any], name: object) -> bool:
    """Whether `name` is a direct child of `properties` that is not repeated, not a group and has no `lang`."""
    if not isinstance(name, str) or name not in properties:
        return False
    child = properties[name]
    return (
        _is_object(child)
        and child.get("type") != "group"
        and "properties" not in child
        and not _repeated(child)
        and not _has_lang(child)
    )


def _source_group(from_: object, properties: dict[str, Any]) -> dict[str, Any] | None:
    """The child fields of the repeated group that `from_` names, or None when it breaks the rules.

    `from_` is `{group}.*.{field}`: the groups are named from the root `properties`,
    only the last of them is repeated, and `field` is a scalar child of the last group.
    """
    if not isinstance(from_, str):
        return None
    segments = from_.split(".")
    if len(segments) < 3 or segments[-2] != "*":
        return None
    names = segments[:-2]
    current = properties
    for index, name in enumerate(names):
        if name == "" or name not in current:
            return None
        field = current[name]
        if (
            not _is_object(field)
            or field.get("type") != "group"
            or not _is_object(field.get("properties"))
        ):
            return None
        if _repeated(field) != (index == len(names) - 1):
            return None
        current = field["properties"]
    return current if _scalar_child(current, segments[-1]) else None


def group_source_failure(
    field: dict[str, Any], path: str, properties: dict[str, Any]
) -> str | None:
    """The message of the first rule that the group source of `field` breaks, or None.

    `path` is the declaration path of the field and `properties` the root properties.
    The members of `items` are checked in declaration order, then the field, then
    `from` and then `label`.
    """
    items = field.get("items")
    if not is_group_source(items):
        return None
    for key in items:
        if key not in ("from", "label"):
            return f"Invalid items.{key} at {path}: unknown key"
    if field.get("type") not in CHOICE_TYPES or _has_lang(field):
        return f"Invalid items.from at {path}: expected a choice field without lang"
    group = _source_group(items["from"], properties)
    if group is None:
        return (
            f"Invalid items.from at {path}: expected {{group}}.*.{{field}} "
            "for a field of a repeated group outside repeated groups"
        )
    if "label" in items and not _scalar_child(group, items["label"]):
        return (
            f"Invalid items.label at {path}: expected the name of a direct child field "
            "of the group without multiple, properties or lang"
        )
    return None


def _choice_text(value: object) -> str | None:
    """The canonical text of a string or a finite number that is not empty after trimming, else None."""
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return None
    text = canonical_text(value)
    if text is None or trim(text) == "":
        return None
    return text


def group_choices(source: dict[str, Any], data: object) -> list[dict[str, str]]:
    """The choices of a checked group source for the root `data`, as `{value, label}` pairs.

    One choice per row of the group in data order whose value text is not empty and
    not seen before. The label is the text of the row's `label` field, or else the value.
    """
    segments = str(source["from"]).split(".")
    value_name = segments[-1]
    rows: object = data
    for name in segments[:-2]:
        if not _is_object(rows) or name not in rows:
            return []
        rows = rows[name]
    if not _is_object(rows):
        return []
    choices: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows.values():
        if not _is_object(row):
            continue
        value = _choice_text(row.get(value_name))
        if value is None or value in seen:
            continue
        seen.add(value)
        label = (
            _choice_text(row.get(source["label"]))
            if isinstance(source.get("label"), str)
            else None
        )
        choices.append({"value": value, "label": label if label is not None else value})
    return choices
