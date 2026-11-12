from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FRAME_SIZE = 256
SHEET_COLUMNS = 9
SHEET_ROWS = 5
FEET_BASELINE = 236
TARGET_MEDIAN_HEIGHT = 210
STRIPS = (
    ("wave", 9, ("apollo-wave.png", "wave.png")),
    ("idle", 6, ("apollo-idle.png", "idle.png")),
    ("happy", 6, ("apollo-happy.png", "happy.png")),
    ("sad", 6, ("apollo-sad.png", "sad.png")),
    ("thumbsUp", 6, ("apollo-thumbsup.png", "thumbs up.png", "thumbsup.png")),
)


@dataclass(frozen=True)
class Component:
    left: int
    top: int
    right: int
    bottom: int
    area: int

    @property
    def center_x(self) -> float:
        return (self.left + self.right) / 2


@dataclass
class Frame:
    name: str
    image: Image.Image
    box: tuple[int, int, int, int]
    scale: float = 1.0
    left: int = 0
    top: int = 0
    width: int = 0
    height: int = 0
    feet_x: float = 0.0
    feet_y: float = 0.0
    airborne: bool = False


class DisjointSet:
    def __init__(self) -> None:
        self.parent: list[int] = []
        self.rank: list[int] = []

    def add(self) -> int:
        label = len(self.parent)
        self.parent.append(label)
        self.rank.append(0)
        return label

    def find(self, label: int) -> int:
        while self.parent[label] != label:
            self.parent[label] = self.parent[self.parent[label]]
            label = self.parent[label]
        return label

    def union(self, first: int, second: int) -> None:
        a = self.find(first)
        b = self.find(second)
        if a == b:
            return
        if self.rank[a] < self.rank[b]:
            a, b = b, a
        self.parent[b] = a
        if self.rank[a] == self.rank[b]:
            self.rank[a] += 1


def connected_components(mask: np.ndarray, connectivity: int = 8) -> list[Component]:
    """Label binary masks by row runs to avoid per-pixel Python flood fill."""
    disjoint = DisjointSet()
    all_runs: list[tuple[int, int, int, int]] = []
    previous: list[tuple[int, int, int]] = []
    margin = 1 if connectivity == 8 else 0

    for y, row in enumerate(mask):
        indexes = np.flatnonzero(row)
        if not len(indexes):
            previous = []
            continue
        breaks = np.flatnonzero(np.diff(indexes) > 1) + 1
        starts = np.split(indexes, breaks)
        current: list[tuple[int, int, int]] = []
        previous_index = 0
        for values in starts:
            left = int(values[0])
            right = int(values[-1])
            label = disjoint.add()
            while previous_index < len(previous) and previous[previous_index][1] < left - margin:
                previous_index += 1
            other_index = previous_index
            while other_index < len(previous) and previous[other_index][0] <= right + margin:
                disjoint.union(label, previous[other_index][2])
                other_index += 1
            current.append((left, right, label))
            all_runs.append((y, left, right, label))
        previous = current

    bounds: dict[int, list[int]] = {}
    for y, left, right, label in all_runs:
        root = disjoint.find(label)
        if root not in bounds:
            bounds[root] = [left, y, right, y, 0]
        box = bounds[root]
        box[0] = min(box[0], left)
        box[1] = min(box[1], y)
        box[2] = max(box[2], right)
        box[3] = max(box[3], y)
        box[4] += right - left + 1
    return [
        Component(left, top, right + 1, bottom + 1, area)
        for left, top, right, bottom, area in bounds.values()
    ]


def find_raw_directory() -> Path:
    for path in (
        ROOT / "public" / "assets" / "game" / "astronauts" / "raw",
        ROOT / "public" / "assests" / "game" / "astronauts" / "raw",
    ):
        if path.is_dir():
            return path
    raise FileNotFoundError(
        "Could not find public/assets/game/astronauts/raw or "
        "public/assests/game/astronauts/raw."
    )


def resolve_input(raw_dir: Path, aliases: Iterable[str]) -> Path:
    by_lower_name = {path.name.lower(): path for path in raw_dir.glob("*.png")}
    for alias in aliases:
        if alias.lower() in by_lower_name:
            return by_lower_name[alias.lower()]
    raise FileNotFoundError(
        f"Missing strip. Expected one of {', '.join(aliases)} in {raw_dir}"
    )


def border_pixels(array: np.ndarray) -> np.ndarray:
    return np.concatenate(
        (array[0, :, :], array[-1, :, :], array[1:-1, 0, :], array[1:-1, -1, :]),
        axis=0,
    )


def clean_background(image: Image.Image, name: str) -> tuple[Image.Image, bool]:
    rgba = image.convert("RGBA")
    pixels = np.asarray(rgba).copy()
    alpha = pixels[:, :, 3]
    perimeter = border_pixels(pixels)
    white_perimeter = np.max(np.abs(perimeter[:, :3].astype(np.int16) - 255), axis=1) <= 32

    # Existing transparency is retained as-is; only opaque white borders need flood fill.
    opaque_white_border = (
        float(np.mean(perimeter[:, 3] >= 250)) >= 0.98
        and float(np.mean(white_perimeter)) >= 0.95
    )
    if not opaque_white_border:
        return rgba, False

    rgb = pixels[:, :, :3].astype(np.int16)
    near_white = np.max(np.abs(rgb - 255), axis=2) <= 32
    background_candidates = (alpha < 5) | near_white
    components = connected_components(background_candidates, connectivity=4)
    background = np.zeros(alpha.shape, dtype=bool)
    height, width = alpha.shape
    for component in components:
        if (
            component.left == 0
            or component.top == 0
            or component.right == width
            or component.bottom == height
        ):
            background[
                component.top : component.bottom, component.left : component.right
            ] |= background_candidates[
                component.top : component.bottom, component.left : component.right
            ]

    pixels[background, 3] = 0
    alpha_image = Image.fromarray(pixels[:, :, 3], mode="L")
    feathered_alpha = alpha_image.filter(ImageFilter.GaussianBlur(radius=0.45))
    pixels[:, :, 3] = np.asarray(feathered_alpha)

    # Defringe the one-pixel antialias by borrowing color from the nearest opaque pixel.
    newly_visible = (pixels[:, :, 3] > 0) & (alpha == 0)
    if np.any(newly_visible):
        source_mask = alpha > 0
        source_rgb = pixels[:, :, :3].copy()
        filled = pixels[:, :, :3]
        for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            shifted_mask = np.zeros_like(source_mask)
            shifted_rgb = np.zeros_like(source_rgb)
            y0, y1 = max(0, dy), height + min(0, dy)
            x0, x1 = max(0, dx), width + min(0, dx)
            shifted_mask[y0:y1, x0:x1] = source_mask[y0 - dy : y1 - dy, x0 - dx : x1 - dx]
            shifted_rgb[y0:y1, x0:x1] = source_rgb[y0 - dy : y1 - dy, x0 - dx : x1 - dx]
            select = newly_visible & shifted_mask
            filled[select] = shifted_rgb[select]
            newly_visible[select] = False
        pixels[:, :, :3] = filled

    return Image.fromarray(pixels, mode="RGBA"), True


def detect_frames(image: Image.Image, expected: int) -> tuple[list[Component], bool]:
    alpha = np.asarray(image.getchannel("A"))
    mask = alpha > 8
    dilated = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
    components = connected_components(np.asarray(dilated) > 0, connectivity=8)
    min_area = max(18, image.width * image.height // 100_000)
    components = sorted(
        (component for component in components if component.area >= min_area),
        key=lambda component: component.left,
    )
    if len(components) == expected:
        return components, False
    return components, True


def padded_box(component: Component, image: Image.Image, padding: int = 2) -> tuple[int, int, int, int]:
    return (
        max(0, component.left - padding),
        max(0, component.top - padding),
        min(image.width, component.right + padding),
        min(image.height, component.bottom + padding),
    )


def frame_boxes(
    image: Image.Image,
    expected: int,
    components: list[Component],
    fallback: bool,
) -> list[tuple[int, int, int, int]]:
    if not fallback:
        return [padded_box(component, image) for component in components]

    # Equal-width cells identify the intended frame slots; component extents expand
    # a crop if a hand, hose, or other connected part crosses a nominal cell edge.
    boxes: list[tuple[int, int, int, int]] = []
    for index in range(expected):
        cell_left = math.floor(index * image.width / expected)
        cell_right = math.ceil((index + 1) * image.width / expected)
        assigned = [
            component
            for component in components
            if cell_left <= component.center_x < cell_right
        ]
        if assigned:
            left = min(component.left for component in assigned)
            top = min(component.top for component in assigned)
            right = max(component.right for component in assigned)
            bottom = max(component.bottom for component in assigned)
            box = (left, top, right, bottom)
        else:
            cell_alpha = image.getchannel("A").crop((cell_left, 0, cell_right, image.height))
            cell_box = cell_alpha.getbbox()
            if cell_box is None:
                boxes.append((cell_left, 0, cell_right, image.height))
                continue
            box = (
                cell_left + cell_box[0],
                cell_box[1],
                cell_left + cell_box[2],
                cell_box[3],
            )
        boxes.append(
            (
                max(0, box[0] - 2),
                max(0, box[1] - 2),
                min(image.width, box[2] + 2),
                min(image.height, box[3] + 2),
            )
        )
    return boxes


def body_and_feet_anchors(image: Image.Image) -> tuple[float, float, int]:
    alpha = np.asarray(image.getchannel("A")) > 8
    ys, xs = np.nonzero(alpha)
    if not len(xs):
        raise ValueError("A detected frame has no visible pixels.")
    top = int(ys.min())
    bottom = int(ys.max()) + 1
    height = bottom - top
    body_start = top + int(height * 0.55)
    body_end = top + int(height * 0.84)
    body_rows = []
    for y in range(body_start, max(body_start + 1, body_end)):
        row_x = np.flatnonzero(alpha[y])
        if len(row_x):
            body_rows.append(float((row_x[0] + row_x[-1]) / 2))
    feet_start = top + int(height * 0.88)
    feet_rows = []
    for y in range(feet_start, bottom):
        row_x = np.flatnonzero(alpha[y])
        if len(row_x):
            feet_rows.append(float((row_x[0] + row_x[-1]) / 2))
    body_center = float(np.median(body_rows)) if body_rows else float((xs.min() + xs.max()) / 2)
    feet_center = float(np.median(feet_rows)) if feet_rows else body_center
    return body_center, feet_center, bottom


def checkerboard(size: tuple[int, int], tile: int = 20) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, "#17243b")
    draw = ImageDraw.Draw(image)
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#263650")
    return image


def make_detection_preview(
    entries: list[tuple[str, Image.Image, list[Component], int, bool]], output: Path
) -> None:
    row_height = 230
    margin = 16
    preview = Image.new("RGB", (1480, margin + row_height * len(entries)), "#0b1425")
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default()
    for row, (name, image, components, expected, fallback) in enumerate(entries):
        y = margin + row * row_height
        draw.text((margin, y), f"{name}: {len(components)} detected, {expected} expected" +
                  (" — equal-cell fallback" if fallback else ""), fill="#f3f6ff", font=font)
        content_y = y + 22
        strip = Image.new("RGBA", image.size, (14, 23, 40, 255))
        strip.alpha_composite(image)
        scale = min(1420 / image.width, 185 / image.height)
        shown = strip.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
        preview.paste(shown.convert("RGB"), (margin, content_y))
        draw = ImageDraw.Draw(preview)
        for component in components:
            box = (
                margin + round(component.left * scale),
                content_y + round(component.top * scale),
                margin + round(component.right * scale),
                content_y + round(component.bottom * scale),
            )
            draw.rectangle(box, outline="#ff786f" if fallback else "#5ff0b2", width=2)
        if fallback:
            for index in range(expected + 1):
                x = margin + round(index * image.width / expected * scale)
                draw.line((x, content_y, x, content_y + shown.height), fill="#ffc857", width=1)
    preview.save(output)


def load_font() -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("arial.ttf", 14)
    except OSError:
        return ImageFont.load_default()


def main() -> int:
    raw_dir = find_raw_directory()
    output_dir = ROOT / "public" / "assets" / "game" / "astronauts"
    output_dir.mkdir(parents=True, exist_ok=True)

    loaded: list[tuple[str, int, Image.Image, bool, list[Component], list[tuple[int, int, int, int]]]] = []
    detections = []
    fallback_names: list[str] = []
    all_frame_heights: list[int] = []

    for name, expected, aliases in STRIPS:
        path = resolve_input(raw_dir, aliases)
        source = Image.open(path).convert("RGBA")
        clean, background_removed = clean_background(source, name)
        components, fallback = detect_frames(clean, expected)
        boxes = frame_boxes(clean, expected, components, fallback)
        if fallback:
            fallback_names.append(name)
            print(
                f"Fallback: {name} has {len(components)} detected components; "
                f"expected {expected}, using {expected} equal-width cells.",
                file=sys.stderr,
            )
        print(
            f"{name}: {path.name} ({source.width}x{source.height}), "
            f"{len(components)} components, flood-filled white background: "
            f"{'yes' if background_removed else 'no (source alpha preserved)'}"
        )
        detections.append((name, clean, components, expected, fallback))
        loaded.append((name, expected, clean, fallback, components, boxes))
        for box in boxes:
            visible_box = clean.getchannel("A").crop(box).getbbox()
            if visible_box:
                all_frame_heights.append(max(1, visible_box[3] - visible_box[1]))

    make_detection_preview(detections, output_dir / "apollo-detected-boxes.png")
    if fallback_names:
        print("Fallback strips: " + ", ".join(fallback_names))
    else:
        print("Fallback strips: none")

    median_height = float(np.median(all_frame_heights))
    scale = TARGET_MEDIAN_HEIGHT / median_height
    sheet = Image.new(
        "RGBA", (FRAME_SIZE * SHEET_COLUMNS, FRAME_SIZE * SHEET_ROWS), (0, 0, 0, 0)
    )
    config_rows = []
    rendered_frames: dict[str, list[Image.Image]] = {}
    jitter: dict[str, dict[str, float | int]] = {}
    report_rows = []

    for row_index, (name, expected, strip, fallback, components, boxes) in enumerate(loaded):
        frames: list[Frame] = []
        for box in boxes:
            crop = strip.crop(box)
            frames.append(Frame(name, crop, box))
        bottoms = []
        anchors = []
        for frame in frames:
            body_x, feet_x, bottom = body_and_feet_anchors(frame.image)
            anchors.append((body_x, feet_x, bottom))
            bottoms.append(bottom)
        median_bottom = float(np.median(bottoms))
        for index, frame in enumerate(frames):
            body_x, feet_x, bottom = anchors[index]
            frame.airborne = name == "happy" and median_bottom - bottom > 8
            frame.scale = scale
            frame.width = round(frame.image.width * scale)
            frame.height = round(frame.image.height * scale)
            anchor_x = body_x * 0.1 + feet_x * 0.9
            frame.left = round(FRAME_SIZE / 2 - anchor_x * scale)
            frame.feet_x = frame.left + feet_x * scale
            target_feet_y = (
                FEET_BASELINE + (bottom - median_bottom) * scale
                if frame.airborne
                else FEET_BASELINE
            )
            frame.top = round(target_feet_y - bottom * scale)
            frame.feet_y = frame.top + bottom * scale

            if frame.left < 0 or frame.left + frame.width > FRAME_SIZE:
                raise ValueError(
                    f"{name} frame {index + 1} exceeds the 256px cell horizontally; "
                    "the single median-derived scale would clip it."
                )
            if frame.top < 0 or frame.top + frame.height > FRAME_SIZE:
                raise ValueError(
                    f"{name} frame {index + 1} exceeds the 256px cell vertically; "
                    "the single median-derived scale would clip it."
                )

        used_frames = frames[:3] if name == "idle" else frames
        rendered_frames[name] = []
        for index, frame in enumerate(used_frames):
            resized = frame.image.resize(
                (frame.width, frame.height), Image.Resampling.LANCZOS
            )
            sheet.alpha_composite(
                resized, (index * FRAME_SIZE + frame.left, row_index * FRAME_SIZE + frame.top)
            )
            # Keep the first three idle frames only; remaining sprite cells stay transparent.
            rendered_frames[name].append(resized)

        config_row = {
            "name": name,
            "frames": len(used_frames),
            "fps": {"wave": 8, "idle": 5, "happy": 10, "sad": 6, "thumbsUp": 10}[name],
            "loop": name != "thumbsUp",
        }
        if name == "idle":
            config_row["playback"] = "loop"
        if name == "thumbsUp":
            config_row["holdLast"] = True
        config_rows.append(config_row)

        grounded = [frame for frame in frames if not frame.airborne]
        x_shifts = [
            abs(grounded[i].feet_x - grounded[i - 1].feet_x)
            for i in range(1, len(grounded))
        ]
        y_shifts = [
            abs(grounded[i].feet_y - grounded[i - 1].feet_y)
            for i in range(1, len(grounded))
        ]
        row_jitter = {
            "groundedFrames": len(grounded),
            "maxHorizontalFeetShiftPx": round(max(x_shifts, default=0.0), 3),
            "maxVerticalFeetShiftPx": round(max(y_shifts, default=0.0), 3),
        }
        jitter[name] = row_jitter
        if row_jitter["maxHorizontalFeetShiftPx"] > 2.0:
            raise ValueError(
                f"{name} feet jitter is {row_jitter['maxHorizontalFeetShiftPx']}px; "
                "adjust the torso/feet horizontal anchor before accepting the sheet."
            )
        report_rows.append(
            {
                "name": name,
                "detectedFrames": len(frames),
                "renderedFrames": len(used_frames),
                "fallback": fallback,
                "airborneFrames": [index + 1 for index, frame in enumerate(frames) if frame.airborne],
                **row_jitter,
            }
        )
        print(
            f"  jitter: horizontal {row_jitter['maxHorizontalFeetShiftPx']}px, "
            f"vertical {row_jitter['maxVerticalFeetShiftPx']}px "
            f"({row_jitter['groundedFrames']} grounded frames)"
        )

    sheet_path = output_dir / "apollo-sprites.png"
    sheet.save(sheet_path, optimize=True)
    config = {
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "columns": SHEET_COLUMNS,
        "rows": config_rows,
    }
    (output_dir / "apollo-sprites.json").write_text(
        json.dumps(config, indent=2) + "\n", encoding="utf-8"
    )

    preview_cell = 160
    preview = checkerboard(
        (FRAME_SIZE * SHEET_COLUMNS * preview_cell // FRAME_SIZE,
         FRAME_SIZE * SHEET_ROWS * preview_cell // FRAME_SIZE),
        tile=20,
    ).convert("RGBA")
    for row_index, row in enumerate(config_rows):
        for frame_index in range(row["frames"]):
            frame = sheet.crop(
                (
                    frame_index * FRAME_SIZE,
                    row_index * FRAME_SIZE,
                    (frame_index + 1) * FRAME_SIZE,
                    (row_index + 1) * FRAME_SIZE,
                )
            ).resize((preview_cell, preview_cell), Image.Resampling.LANCZOS)
            preview.alpha_composite(frame, (frame_index * preview_cell, row_index * preview_cell))
    preview.convert("RGB").save(output_dir / "preview-transparent.png", optimize=True)

    contact = Image.new("RGB", (110 + SHEET_COLUMNS * 128, SHEET_ROWS * 152), "#0b1425")
    draw = ImageDraw.Draw(contact)
    font = load_font()
    for row_index, row in enumerate(config_rows):
        y = row_index * 152
        draw.text((12, y + 66), row["name"], fill="#f3f6ff", font=font)
        for frame_index in range(SHEET_COLUMNS):
            x = 110 + frame_index * 128
            background = checkerboard((128, 128), tile=16).convert("RGBA")
            if frame_index < row["frames"]:
                frame = sheet.crop(
                    (
                        frame_index * FRAME_SIZE,
                        row_index * FRAME_SIZE,
                        (frame_index + 1) * FRAME_SIZE,
                        (row_index + 1) * FRAME_SIZE,
                    )
                ).resize((128, 128), Image.Resampling.LANCZOS)
                background.alpha_composite(frame)
            contact.paste(background.convert("RGB"), (x, y + 12))
    contact.save(output_dir / "apollo-contact-sheet.png", optimize=True)

    idle_frames = []
    for index in range(config_rows[1]["frames"]):
        frame = sheet.crop((index * FRAME_SIZE, FRAME_SIZE, (index + 1) * FRAME_SIZE, 2 * FRAME_SIZE))
        canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), "#101a2d")
        canvas.alpha_composite(frame)
        idle_frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=256))
    idle_preview_path = output_dir / "apollo-idle-preview.gif"
    idle_frames[0].save(
        idle_preview_path,
        save_all=True,
        append_images=idle_frames[1:],
        duration=200,
        loop=0,
        disposal=2,
    )

    report = {
        "inputDirectory": str(raw_dir.relative_to(ROOT)).replace("\\", "/"),
        "outputSize": [sheet.width, sheet.height],
        "medianFrameHeight": median_height,
        "uniformScale": scale,
        "fallbackStrips": fallback_names,
        "rows": report_rows,
    }
    (output_dir / "apollo-jitter-report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Generated {sheet_path.relative_to(ROOT)} ({sheet.width}x{sheet.height})")
    print(f"Idle looping preview uses frames 1-3 only: {idle_preview_path.relative_to(ROOT)}")
    print(f"Diagnostics and contact sheet: {output_dir.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"apollo-sprites: {error}", file=sys.stderr)
        raise
