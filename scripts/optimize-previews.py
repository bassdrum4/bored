"""Run after capture-previews.mjs. Pillow is a development-only dependency.

Landscape captures fill the 8:5 card. Square, portrait and phone-shaped games
keep their whole board, centered on paper, because cropping one would cut the
thing you are supposed to recognize. With no captures in _build/ the script
refits the previews already in src/games/previews, stripping the paper border
the old optimizer left around every board.
"""
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
source = root / '_build' / 'game-previews'
target = root / 'src' / 'games' / 'previews'
target.mkdir(parents=True, exist_ok=True)

# The paper the captures are padded with, and the widest board that still reads
# as landscape. Below this the board is left whole.
PAPER = (0xE7, 0xE2, 0xD6)
FILL_ASPECT = 1.2
SIZE = (384, 240)
QUALITY = 60


def is_paper(pixel):
    return all(abs(pixel[i] - PAPER[i]) <= 6 for i in range(3))


def trim_paper(image):
    """Strip the uniform paper border left by an earlier padded capture."""
    width, height = image.size
    pixels = image.load()
    left, top, right, bottom = 0, 0, width, height
    while left < right and all(is_paper(pixels[left, y]) for y in range(height)):
        left += 1
    while right > left and all(is_paper(pixels[right - 1, y]) for y in range(height)):
        right -= 1
    while top < bottom and all(is_paper(pixels[x, top]) for x in range(left, right)):
        top += 1
    while bottom > top and all(is_paper(pixels[x, bottom - 1]) for x in range(left, right)):
        bottom -= 1
    if (left, top, right, bottom) == (0, 0, width, height):
        return image, False
    return image.crop((left, top, right, bottom)), True


def preview(image, strip_padding):
    """Return the new preview, or None when the file already fills the card."""
    board = image.convert('RGB')
    if strip_padding:
        board, trimmed = trim_paper(board)
        # No paper border means the old preview already covers its card, and
        # re-encoding it would only lose a little more quality.
        if not trimmed:
            return None
    if board.width / board.height >= FILL_ASPECT:
        # Cover the card: crop the overhang, keep the middle of the board.
        return ImageOps.fit(board, SIZE, method=Image.LANCZOS)
    # Square and portrait boards keep the paper they were shot in; cropping one
    # would cut the board itself.
    return None if strip_padding else ImageOps.pad(board, SIZE, color='#e7e2d6', method=Image.LANCZOS)


captures = sorted(source.glob('*.png'))
# Fresh captures are the raw board, so there is no paper to strip. Previews on
# disk were padded by the old optimizer and still carry it.
for image_path in captures or sorted(target.glob('*.webp')):
    with Image.open(image_path) as image:
        result = preview(image, strip_padding=not captures)
        if result is not None:
            result.save(target / (image_path.stem + '.webp'), quality=QUALITY, method=6)

files = list(target.glob('*.webp'))
print(f'{len(files)} previews, {sum(file.stat().st_size for file in files):,} bytes total')
