#!/usr/bin/env python3
"""Generate runtime gauge back/front layers and config without external deps."""

from __future__ import annotations

import argparse
import binascii
import json
import math
import struct
import zlib
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def read_chunks(data: bytes):
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("not a PNG file")
    offset = len(PNG_SIGNATURE)
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        offset += 4
        kind = data[offset : offset + 4]
        offset += 4
        payload = data[offset : offset + length]
        offset += length + 4
        yield kind, payload
        if kind == b"IEND":
            break


def paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(path: Path):
    width = height = bit_depth = color_type = interlace = None
    idat = bytearray()
    for kind, payload in read_chunks(path.read_bytes()):
        if kind == b"IHDR":
            width, height, bit_depth, color_type, _compression, _filter, interlace = struct.unpack(
                ">IIBBBBB", payload
            )
        elif kind == b"IDAT":
            idat.extend(payload)
    if width is None or height is None:
        raise ValueError("PNG is missing IHDR")
    if bit_depth != 8 or color_type not in (2, 6) or interlace != 0:
        raise ValueError("only 8-bit non-interlaced RGB/RGBA PNGs are supported")

    channels = 3 if color_type == 2 else 4
    stride = width * channels
    raw = zlib.decompress(bytes(idat))
    rows = []
    offset = 0
    previous = bytearray(stride)
    for _y in range(height):
        filter_type = raw[offset]
        offset += 1
        row = bytearray(raw[offset : offset + stride])
        offset += stride
        for i in range(stride):
            left = row[i - channels] if i >= channels else 0
            up = previous[i]
            upper_left = previous[i - channels] if i >= channels else 0
            if filter_type == 0:
                value = row[i]
            elif filter_type == 1:
                value = row[i] + left
            elif filter_type == 2:
                value = row[i] + up
            elif filter_type == 3:
                value = row[i] + ((left + up) // 2)
            elif filter_type == 4:
                value = row[i] + paeth(left, up, upper_left)
            else:
                raise ValueError(f"unsupported PNG filter {filter_type}")
            row[i] = value & 0xFF
        rows.append(row)
        previous = row

    rgba = bytearray(width * height * 4)
    for y, row in enumerate(rows):
        for x in range(width):
            src = x * channels
            dst = (y * width + x) * 4
            rgba[dst : dst + 3] = row[src : src + 3]
            rgba[dst + 3] = row[src + 3] if channels == 4 else 255
    return width, height, rgba


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    crc = binascii.crc32(kind)
    crc = binascii.crc32(payload, crc) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)


def write_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        start = y * stride
        raw.extend(rgba[start : start + stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(
        PNG_SIGNATURE
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + png_chunk(b"IEND", b"")
    )


def parse_rect(value: str):
    parts = [int(part.strip()) for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("rect must be left,top,right,bottom")
    left, top, right, bottom = parts
    if left >= right or top >= bottom:
        raise argparse.ArgumentTypeError("rect must have positive width and height")
    return left, top, right, bottom


def rounded_rect_contains(x: int, y: int, left: int, top: int, right: int, bottom: int, radius: int) -> bool:
    if not (left <= x < right and top <= y < bottom):
        return False
    radius = max(0, min(radius, (right - left) // 2, (bottom - top) // 2))
    if radius == 0:
        return True
    cx = left + radius if x < left + radius else right - radius - 1 if x >= right - radius else x
    cy = top + radius if y < top + radius else bottom - radius - 1 if y >= bottom - radius else y
    return math.hypot(x - cx, y - cy) <= radius


def set_pixel(rgba: bytearray, width: int, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    idx = (y * width + x) * 4
    rgba[idx : idx + 4] = bytes(color)


def make_layers(source: bytearray, width: int, height: int, rect: tuple[int, int, int, int], radius: int):
    left, top, right, bottom = rect
    front = bytearray(source)
    back = bytearray(source)
    inner = (9, 15, 25, 255)
    edge = (21, 32, 49, 255)

    for y in range(top, bottom):
        for x in range(left, right):
            if not rounded_rect_contains(x, y, left, top, right, bottom, radius):
                continue
            set_pixel(front, width, x, y, (0, 0, 0, 0))
            distance_to_edge = min(x - left, right - 1 - x, y - top, bottom - 1 - y)
            color = edge if distance_to_edge < 3 else inner
            set_pixel(back, width, x, y, color)
    return back, front


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-dir", required=True, type=Path)
    parser.add_argument("--window", required=True, type=parse_rect)
    parser.add_argument("--radius", default=0, type=int)
    parser.add_argument("--direction", default="bottom-to-top", choices=["bottom-to-top", "top-to-bottom"])
    args = parser.parse_args()

    sample_dir = args.sample_dir
    source = sample_dir / "gear-source.png"
    width, height, rgba = read_png(source)
    left, top, right, bottom = args.window

    back, front = make_layers(rgba, width, height, args.window, args.radius)
    write_png(sample_dir / "gear-back.png", width, height, back)
    write_png(sample_dir / "gear-front.png", width, height, front)

    config = {
        "canvas": {"width": width, "height": height},
        "layers": {"back": "gear-back.png", "front": "gear-front.png"},
        "gauges": [
            {
                "id": "leftAltitude",
                "label": "Left altitude",
                "window": {
                    "x": left,
                    "y": top,
                    "width": right - left,
                    "height": bottom - top,
                    "radius": args.radius,
                },
                "direction": args.direction,
                "gradient": [
                    {"at": 0, "color": "#18d7ff"},
                    {"at": 0.62, "color": "#69f5d1"},
                    {"at": 1, "color": "#ffd166"},
                ],
                "innerGlow": {"color": "#24e6ff", "blur": 18, "alpha": 0.46},
            }
        ],
    }
    (sample_dir / "skin-runtime-config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
