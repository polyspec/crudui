"""Shared loading of the generation fixtures, HTML normalization and failures.

The render fixtures compare byte-exact output; the layout fixtures parse both
sides into a normalized tree — sorted attributes, boolean attributes empty, a
canonical style attribute, no empty class or style attribute and no
whitespace-only text outside preformatted elements — as the shared JavaScript
normalizer does.
"""

import json
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / 'tests' / 'fixtures'

VALIDATOR_SOURCE = ROOT / 'packages' / 'validator-python' / 'src'
GENERATOR_SOURCE = ROOT / 'packages' / 'generator-python' / 'src'

for source in (VALIDATOR_SOURCE, GENERATOR_SOURCE):
    if str(source) not in sys.path:
        sys.path.insert(0, str(source))

# The deepest fixture value nests 512 levels of containers and the traversal
# follows it; the default interpreter limit does not.
sys.setrecursionlimit(max(sys.getrecursionlimit(), 20000))

BOOLEAN_ATTRIBUTES = frozenset(
    ('checked', 'selected', 'disabled', 'readonly', 'multiple', 'required', 'autofocus')
)
PRESERVE = frozenset(('textarea', 'pre', 'script', 'style'))
VOID = frozenset(
    ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr')
)


def cases_of(group, name='cases.json'):
    """The cases of one fixture group."""
    path = FIXTURES / group / name
    loaded = json.loads(path.read_text(encoding='utf-8'))
    if not loaded:
        raise AssertionError(f'{path.relative_to(ROOT)} holds no case')
    return loaded


class _TreeBuilder(HTMLParser):
    """A parser that builds the normalized tree of rendered layout HTML."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'tag': '#root', 'attributes': {}, 'children': []}
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = self._node(tag, attrs)
        self.stack[-1]['children'].append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1]['children'].append(self._node(tag, attrs))

    def _node(self, tag, attrs):
        """A parsed element; a NUL in an attribute value reads as U+FFFD."""
        node = {'tag': tag, 'attributes': {}, 'children': []}
        for name, value in attrs:
            if value is None:
                value = ''
            if name in BOOLEAN_ATTRIBUTES:
                value = ''
            node['attributes'][name] = value.replace('\x00', '\ufffd')
        return node

    def handle_endtag(self, tag):
        while len(self.stack) > 1:
            node = self.stack.pop()
            if node['tag'] == tag:
                return

    def handle_data(self, data):
        parent = self.stack[-1]
        preserve = any(node['tag'] in PRESERVE for node in self.stack)
        if not preserve:
            # A NUL in text is dropped, as an HTML5 parser drops it.
            data = data.replace('\x00', '')
            if data.strip() == '':
                return
        parent['children'].append({'text': data})


def _normalize(node):
    """The normalized comparison tree of one parsed node."""
    from polyspec.crudui.generator.style import canonical as canonical_style

    out = []
    for child in node['children']:
        if 'text' in child:
            out.append({'text': child['text']})
            continue
        attributes = {}
        for name in sorted(child['attributes']):
            value = child['attributes'][name]
            if name == 'style':
                value = canonical_style(value) or ''
            if name in ('class', 'style') and value == '':
                continue
            attributes[name] = value
        preserve = child['tag'] in PRESERVE
        out.append(
            {
                'tag': child['tag'],
                'attributes': attributes,
                'children': _normalize(child) if preserve or not preserve else _normalize(child),
            }
        )
    return out


def html_tree(html):
    """The normalized layout tree of an HTML string."""
    builder = _TreeBuilder()
    builder.feed('<!doctype html><html><body>')
    builder.feed(html)
    builder.feed('</body></html>')
    return _normalize_body(builder.root)


def _normalize_body(root):
    """The body children of a parsed document, whitespace outside preformatted elements kept."""
    return _normalize(root)


def failure_record(error):
    """The failure record of a thrown generation failure."""
    from polyspec.crudui.generator import FormError
    from polyspec.crudui.validator import ComposeLoadError, FormInputError

    if isinstance(error, ComposeLoadError):
        return {'code': error.code, 'message': str(error), 'at': '.'.join(error.trace)}
    if isinstance(error, FormInputError):
        return {'code': error.code, 'message': str(error), 'at': ''}
    if isinstance(error, FormError):
        return {'code': error.code, 'message': str(error)}
    return None
