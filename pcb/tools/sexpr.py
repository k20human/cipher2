"""Minimal S-expression reader and writer for KiCad files.

KiCad's format distinguishes bare atoms from quoted strings, and the
distinction is semantic: (at 0 0) is a position, (property "Reference" "R1")
is text. Str marks the strings that must be quoted; everything else is
emitted bare.
"""
import re


class Str(str):
    """A string that must be quoted on output."""


_ESCAPES = {"\\": "\\\\", '"': '\\"', "\n": "\\n"}


def _atom(value):
    if isinstance(value, Str):
        body = "".join(_ESCAPES.get(c, c) for c in value)
        return f'"{body}"'
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def dumps(node, indent=0):
    pad = "  " * indent
    if not isinstance(node, (list, tuple)):
        return pad + _atom(node)
    head, *rest = node
    flat = all(not isinstance(r, (list, tuple)) for r in rest)
    if flat:
        return pad + "(" + " ".join([_atom(head)] + [_atom(r) for r in rest]) + ")"
    lines = [pad + "(" + _atom(head)]
    for r in rest:
        if isinstance(r, (list, tuple)):
            lines.append(dumps(r, indent + 1))
        else:
            lines.append("  " * (indent + 1) + _atom(r))
    lines.append(pad + ")")
    return "\n".join(lines)


_TOKEN = re.compile(r'"(?:[^"\\]|\\.)*"|\(|\)|[^\s()]+')
_NUMBER = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")


def _value(token):
    """Bare numeric atoms come back as numbers.

    In KiCad's format a bare atom that looks like a number is one: coordinates,
    sizes, versions. Anything else -- layer names, yes/no, shape keywords --
    stays a string, and every quoted atom is a Str regardless. Leaving the
    coercion to each caller is what puts float() at twenty call sites, which is
    twenty chances to forget it.
    """
    if not _NUMBER.match(token):
        return token
    return int(token) if token.lstrip("+-").isdigit() else float(token)


def loads(text):
    """Parse into nested lists. Quoted strings come back as Str."""
    stack, current = [], []
    for token in _TOKEN.findall(text):
        if token == "(":
            stack.append(current)
            current = []
        elif token == ")":
            done, current = current, stack.pop()
            current.append(done)
        elif token.startswith('"'):
            body = token[1:-1].replace('\\"', '"').replace("\\\\", "\\")
            current.append(Str(body))
        else:
            current.append(_value(token))
    return current
