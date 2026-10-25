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
    "group_source_repeat",
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

# The field types whose stored value is a boolean, which a group source refuses (CUSC-068).
BOOLEAN_TYPES = ("checkbox", "switcher")


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


def _holds_boolean(properties: dict[str, Any], name: object) -> bool:
    """Whether the scalar child `name` of a group is of a type that stores a boolean."""
    child = properties.get(name) if isinstance(name, str) else None
    return _is_object(child) and child.get("type") in BOOLEAN_TYPES


def _boolean_failure(member: str, path: str, field: str) -> str:
    """The message of a group source whose `member` names the field `field` that holds a boolean (CUSC-068)."""
    return (
        f"Invalid items.{member} at {path}: {field} holds a boolean, "
        "expected a field whose values are strings or numbers"
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
    `from`, the type of its field, `label` and then the type of its field.
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
    segments = items["from"].split(".")
    group_path = ".".join(segments[:-2])
    if _holds_boolean(group, segments[-1]):
        return _boolean_failure("from", path, f"{group_path}.{segments[-1]}")
    if "label" in items and not _scalar_child(group, items["label"]):
        return (
            f"Invalid items.label at {path}: expected the name of a direct child field "
            "of the group without multiple, properties or lang"
        )
    if "label" in items and _holds_boolean(group, items["label"]):
        return _boolean_failure("label", path, f"{group_path}.{items['label']}")
    return None


def _choice_text(value: object) -> str | None:
    """The canonical text of a string or a finite number that is not empty after trimming, else None."""
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return None
    text = canonical_text(value)
    if text is None or trim(text) == "":
        return None
    return text


def _source_rows(source: dict[str, Any], data: object) -> dict[str, Any]:
    """The rows of the group that a checked group source names in the root `data`, by row key in data order."""
    rows: object = data
    for name in str(source["from"]).split(".")[:-2]:
        if not _is_object(rows) or name not in rows:
            return {}
        rows = rows[name]
    return rows if _is_object(rows) else {}


def group_source_repeat(source: dict[str, Any], data: object) -> str | None:
    """The input failure message of the first row of a checked group source, in data order,
    whose choice value repeats that of an earlier row, or None (CUVR-087)."""
    segments = str(source["from"]).split(".")
    group_path = ".".join(segments[:-2])
    value_name = segments[-1]
    seen: set[str] = set()
    for key, row in _source_rows(source, data).items():
        if not _is_object(row):
            continue
        value = _choice_text(row.get(value_name))
        if value is None:
            continue
        if value in seen:
            return (
                "Group source value repeats an earlier row: "
                f"{value} at {group_path}.{key}.{value_name}"
            )
        seen.add(value)
    return None


def group_choices(source: dict[str, Any], data: object) -> list[dict[str, str]]:
    """The choices of a checked group source for the root `data`, as `{value, label}` pairs.

    One choice per row of the group in data order whose value text is not empty and
    not seen before. The label is the text of the row's `label` field, or else the value.
    """
    value_name = str(source["from"]).split(".")[-1]
    choices: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in _source_rows(source, data).values():
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
