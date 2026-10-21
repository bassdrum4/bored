"""Run after capture-previews.mjs. Pillow is a development-only dependency."""
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
source = root / '_build' / 'game-previews'
target = root / 'src' / 'games' / 'previews'
target.mkdir(parents=True, exist_ok=True)
for capture in sorted(source.glob('*.png')):
    with Image.open(capture) as image:
        # Keep the whole board, including square and portrait games.
        preview = ImageOps.pad(image.convert('RGB'), (384, 240), color='#e7e2d6')
        preview.save(target / (capture.stem + '.webp'), quality=60, method=6)
files = list(target.glob('*.webp'))
print(f'{len(files)} previews, {sum(file.stat().st_size for file in files):,} bytes total')
