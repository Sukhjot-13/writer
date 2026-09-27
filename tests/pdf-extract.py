#!/usr/bin/env python3
"""Extract text from react-pdf PDFs for smoke-test assertions.

react-pdf stores text as hex-string TJ arrays in WinAnsi with subset fonts,
so `pdftotext` is unavailable on macOS and `strings` is useless. This helper
inflates content streams, decodes <hex> runs (WinAnsi = latin-1 superset for
our purposes) and prints plain text per page.

Usage:
    python3 tests/pdf-extract.py document.pdf [--page N]

Exit codes: 0 ok, 1 unreadable/not-a-pdf, 2 page out of range.
"""

import re
import sys
import zlib


def read_objects(data: bytes) -> dict:
    objects = {}
    for m in re.finditer(rb"(\d+) (\d+) obj(.*?)endobj", data, re.S):
        objects[(int(m.group(1)), int(m.group(2)))] = m.group(3)
    return objects


def inflate(stream_body: bytes) -> bytes:
    m = re.search(rb"stream\r?\n(.*)\r?\nendstream", stream_body, re.S)
    if not m:
        return b""
    raw = m.group(1)
    try:
        return zlib.decompress(raw)
    except zlib.error:
        return raw


def extract_text(content: bytes) -> str:
    # Hex runs: <00480065006C006C006F> (UTF-16BE with BOM) or <48656C6C6F> (WinAnsi bytes)
    parts: list[str] = []
    for m in re.finditer(rb"<([0-9A-Fa-f]+)>", content):
        raw = bytes.fromhex(m.group(1).decode("ascii"))
        if raw.startswith(b"\xfe\xff"):
            try:
                parts.append(raw[2:].decode("utf-16-be"))
                continue
            except UnicodeDecodeError:
                pass
        parts.append(raw.decode("cp1252", errors="replace"))
    # Literal runs: (Hello world)
    for m in re.finditer(rb"\((?:\\.|[^\\()])*\)", content):
        lit = m.group(0)[1:-1]
        lit = re.sub(rb"\\([nrtbf()\\])", lambda x: {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f"}.get(x.group(1), x.group(1)), lit)
        parts.append(lit.decode("cp1252", errors="replace"))
    return "".join(parts)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: pdf-extract.py document.pdf [--page N]", file=sys.stderr)
        return 1
    path = sys.argv[1]
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError as e:
        print(f"cannot read {path}: {e}", file=sys.stderr)
        return 1
    if not data.startswith(b"%PDF"):
        print(f"{path} is not a PDF", file=sys.stderr)
        return 1

    objects = read_objects(data)
    pages: list[str] = []
    # Find page content streams via /Type /Page objects' /Contents refs
    for (num, gen), body in objects.items():
        if b"/Type" in body and b"/Page" in body and b"/Pages" not in body.replace(b"/Pages", b""):
            # crude: any object mentioning /Page but not /Pages — collect Contents refs
            for ref in re.finditer(rb"(\d+) (\d+) R", body):
                key = (int(ref.group(1)), int(ref.group(2)))
                if key in objects:
                    text = extract_text(inflate(objects[key]))
                    if text.strip():
                        pages.append(text)
                        break

    want = None
    if "--page" in sys.argv:
        try:
            want = int(sys.argv[sys.argv.index("--page") + 1]) - 1
        except (ValueError, IndexError):
            print("bad --page value", file=sys.stderr)
            return 1
        if want < 0 or want >= len(pages):
            print(f"page out of range (1-{len(pages)})", file=sys.stderr)
            return 2
        print(pages[want])
        return 0

    for i, text in enumerate(pages, 1):
        print(f"--- page {i}/{len(pages)} ---")
        print(text)
    return 0


if __name__ == "__main__":
    main()
