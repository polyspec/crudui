#!/usr/bin/env python3
"""Write src/polyspec/crudui/generator/interface_messages.py from contracts/interface-messages.json.

    python3 packages/generator-python/scripts/generate_interface_messages.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONTRACT = ROOT / 'contracts' / 'interface-messages.json'
TARGET = (
    Path(__file__).resolve().parents[1]
    / 'src' / 'polyspec' / 'crudui' / 'generator' / 'interface_messages.py'
)


def table(messages, indent):
    lines = []
    for language, entries in messages.items():
        pairs = ', '.join(
            f'{json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)}'
            for key, value in entries.items()
        )
        lines.append(f'{indent}    {json.dumps(language)}: {{{pairs}}},')
    return '\n'.join(lines)


def main():
    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    if contract.get('format') != 'crudui/interface-messages':
        raise SystemExit('Unexpected contract format')
    body = f'''"""Interface message tables of every supported language.

Generated from contracts/interface-messages.json by
`python3 packages/generator-python/scripts/generate_interface_messages.py`.
Do not edit; test_interface_messages fails when this data differs from the
contract.

`FORM` holds the interface text of form controls, counts and summaries, where
`{{count}}` is replaced with a number. `LIST` holds the labels of the list
pagination buttons, where `{{page}}` is replaced with a page number, and the
text of the empty list.
"""

FORM = {{
{table(contract['form'], '')}
}}

LIST = {{
{table(contract['list'], '')}
}}
'''
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(body, encoding='utf-8')
    print(f'wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
