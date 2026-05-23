#!/usr/bin/env python3
"""Lightweight PPTX fidelity verifier.

Checks the generated Office XML for common drift sources:
- editable text boxes crossing the content rail
- theme/scheme colors that Google Slides may remap
- risky default font fallbacks

This intentionally uses only the Python standard library so agents can run it
inside minimal workspaces.
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET

EMU_PER_INCH = 914400

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}

RISKY_FONTS = {
    "calibri",
    "arial",
    "microsoft jhenghei",
    "ms gothic",
    "times new roman",
}


@dataclass
class Finding:
    level: str
    slide: int
    message: str


def emu_to_in(value: str | None) -> float:
    try:
        return int(value or "0") / EMU_PER_INCH
    except ValueError:
        return 0.0


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_slide_size(zf: zipfile.ZipFile) -> tuple[float, float]:
    try:
        xml = zf.read("ppt/presentation.xml")
    except KeyError:
        return (13.333, 7.5)
    root = ET.fromstring(xml)
    size = root.find(".//p:sldSz", NS)
    if size is None:
        return (13.333, 7.5)
    return (emu_to_in(size.get("cx")), emu_to_in(size.get("cy")))


def slide_paths(zf: zipfile.ZipFile) -> list[str]:
    paths = [
        name
        for name in zf.namelist()
        if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
    ]
    return sorted(paths, key=lambda p: int(re.search(r"(\d+)\.xml$", p).group(1)))


def shape_bounds_in(shape: ET.Element) -> tuple[float, float, float, float] | None:
    xfrm = shape.find(".//a:xfrm", NS)
    if xfrm is None:
        return None
    off = xfrm.find("a:off", NS)
    ext = xfrm.find("a:ext", NS)
    if off is None or ext is None:
        return None
    x = emu_to_in(off.get("x"))
    y = emu_to_in(off.get("y"))
    w = emu_to_in(ext.get("cx"))
    h = emu_to_in(ext.get("cy"))
    return (x, y, w, h)


def has_text(shape: ET.Element) -> bool:
    return shape.find(".//p:txBody", NS) is not None


def text_preview(shape: ET.Element) -> str:
    parts = [node.text or "" for node in shape.findall(".//a:t", NS)]
    text = " ".join("".join(parts).split())
    return text[:80] or "(empty text)"


def audit_slide(
    xml: bytes,
    slide_index: int,
    content_max_y: float,
    footer_top: float,
) -> list[Finding]:
    findings: list[Finding] = []
    root = ET.fromstring(xml)

    for shape in root.findall(".//p:sp", NS):
        if not has_text(shape):
            continue
        bounds = shape_bounds_in(shape)
        if bounds is None:
            continue
        x, y, w, h = bounds
        bottom = y + h
        preview = text_preview(shape)
        is_footer = y >= footer_top
        if bottom > content_max_y and not is_footer:
            findings.append(
                Finding(
                    "ERROR",
                    slide_index,
                    f'text box crosses content rail: y={y:.2f}in h={h:.2f}in bottom={bottom:.2f}in :: "{preview}"',
                )
            )

    for node in root.iter():
        name = local_name(node.tag)
        if name == "schemeClr":
            val = node.get("val") or "unknown"
            findings.append(
                Finding(
                    "WARN",
                    slide_index,
                    f"theme color used instead of explicit RGB: schemeClr={val}",
                )
            )
        if name in {"latin", "ea"}:
            font = (node.get("typeface") or "").strip()
            if font.lower() in RISKY_FONTS:
                findings.append(
                    Finding(
                        "WARN",
                        slide_index,
                        f"risky/default font fallback in {name}: {font}",
                    )
                )

    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pptx", help="Path to the PPTX file to verify")
    parser.add_argument("--content-max-y", type=float, default=6.70)
    parser.add_argument("--canvas-h", type=float, default=None)
    parser.add_argument("--footer-top", type=float, default=6.85)
    args = parser.parse_args()

    pptx = Path(args.pptx)
    if not pptx.exists():
        print(f"ERROR: file not found: {pptx}", file=sys.stderr)
        return 2

    findings: list[Finding] = []
    with zipfile.ZipFile(pptx) as zf:
        width, height = read_slide_size(zf)
        if args.canvas_h is not None:
            height = args.canvas_h
        paths = slide_paths(zf)
        slide_count = len(paths)
        if not paths:
            print("ERROR: no slides found", file=sys.stderr)
            return 2
        for idx, path in enumerate(paths, start=1):
            findings.extend(
                audit_slide(
                    zf.read(path),
                    idx,
                    args.content_max_y,
                    args.footer_top,
                )
            )

    errors = [f for f in findings if f.level == "ERROR"]
    warnings = [f for f in findings if f.level == "WARN"]
    print(
        f"Verified {pptx.name}: {slide_count} slides, "
        f"canvas {width:.2f}x{height:.2f}in, "
        f"{len(errors)} rail violations, {len(warnings)} warnings"
    )
    for finding in findings:
        print(f"{finding.level} slide {finding.slide}: {finding.message}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
