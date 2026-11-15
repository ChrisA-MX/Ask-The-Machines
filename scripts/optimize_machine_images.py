"""Create responsive WebP copies of the story illustrations without changing source JPGs."""

from pathlib import Path
from PIL import Image


IMAGE_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "mac_images"
WIDTHS = (400, 800)


def main() -> None:
    files = sorted(IMAGE_DIR.glob("*.jpg"))
    if not files:
        raise SystemExit(f"No JPG illustrations found in {IMAGE_DIR}")

    for source in files:
        with Image.open(source) as image:
            rgb = image.convert("RGB")
            for width in WIDTHS:
                # Preserve the complete illustration and its proportions; do not upscale.
                output_width = min(width, rgb.width)
                output_height = max(1, round(rgb.height * output_width / rgb.width))
                resized = rgb.resize((output_width, output_height), Image.Resampling.LANCZOS)
                destination = source.with_name(f"{source.stem}-{width}.webp")
                resized.save(destination, "WEBP", quality=84, method=6)
                print(f"{source.name} -> {destination.name} ({output_width}x{output_height})")
            rgb.close()

    print(f"Optimized {len(files)} illustrations. Original JPG files were kept.")


if __name__ == "__main__":
    main()
