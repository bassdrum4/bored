"""Copy Poké Gacha's art into src/games/content/poke-gacha/art/.

    python3 scripts/gacha-art.py <egg_sprites dir> <pokerogue_mini_sprites/icons dir>

Eggs, the coin and the shard are copied at their native size, the gacha machine
is brought back to its native 106x129 and recoloured once per machine, and the
vouchers are brought back to their native 21x17 (the page scales
them by whole numbers). The 40x30 mini icons for species 1-1025 go into two
atlases (lossless WebP), normal and shiny, 32 icons a row: species n sits at column (n-1) % 32,
row (n-1) // 32. Species whose icon only exists per form use the default form.
"""
import colorsys
import os
import sys
from collections import Counter
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'games', 'content', 'poke-gacha', 'art')
COLS, W, H, LAST = 32, 40, 30, 1025
# Default form for species whose icon is only drawn per form.
FORMS = {201: 'a', 412: 'plant', 413: 'plant', 421: 'overcast', 422: 'west', 423: 'west', 487: 'altered', 492: 'land',
         493: 'normal', 550: 'red-striped', 585: 'spring', 586: 'spring', 641: 'incarnate', 642: 'incarnate', 645: 'incarnate',
         647: 'ordinary', 648: 'aria', 666: 'meadow', 669: 'red', 670: 'red', 671: 'red', 716: 'neutral', 778: 'disguised',
         905: 'incarnate', 925: 'four', 931: 'green-plumage', 964: 'zero', 978: 'curly', 1007: 'apex-build',
         1008: 'ultimate-mode', 1012: 'counterfeit', 1013: 'unremarkable', 1017: 'teal-mask'}
# The machine upload (500x609) is the 106x129 drawing stretched about 4.72x, so
# each native pixel is recovered as the most common colour in its cell. Then its
# reds are moved onto each machine's palette colour; Legendary UP stays red.
MACHINE = (106, 129)
MAIN_RED = (0xf6, 0x27, 0x27)
MACHINE_COLORS = {'legend': None, 'move': (0x94, 0x9a, 0x9a), 'shiny': (0xf4, 0xc4, 0x2c)}
# Only Legendary UP keeps the crown on its plate and the timer pill on its body:
# on the others the crown is painted over with the plate's grey (the page draws
# their own emblem) and the pill with the body red underneath it.
PLATE_GREY, BODY_DARK, BODY_RED = (0xe8, 0xe4, 0xe4, 255), (0xc8, 0x19, 0x19, 255), (0xd6, 0x1e, 0x1e, 255)
CROWN = (46, 35, 61, 41)
PILL = (36, 76, 69, 89)
# Vouchers, worst to best: green Regular, blue Plus, purple Premium, gold Gold.
# The uploads (50x40) are 21x17 drawings stretched about 2.4x.
TICKETS = {'regular': 'ticket_1_green', 'plus': 'ticket_2_blue', 'premium': 'ticket_3_purple', 'gold': 'ticket_4_gold'}
TICKET = (21, 17)
COIN = (17, 18)


def native(path, size):
    big = Image.open(path).convert('RGBA')
    (W, H), (w, h), px = big.size, size, big.load()
    out = Image.new('RGBA', size)
    for j in range(h):
        for i in range(w):
            x0, x1 = round(i * W / w), round((i + 1) * W / w)
            y0, y1 = round(j * H / h), round((j + 1) * H / h)
            out.putpixel((i, j), Counter(px[x, y] for x in range(x0, x1) for y in range(y0, y1)).most_common(1)[0][0])
    return out


def paint(img, box, color):
    x0, y0, x1, y1 = box
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            img.putpixel((x, y), color(y) if callable(color) else color)


def recolor(img, target):
    """Rotate every red to the target hue, scaling saturation and value so the main red lands on the target."""
    if target is None:
        return img.copy()
    hsv = lambda c: colorsys.rgb_to_hsv(*(v / 255 for v in c[:3]))
    _, ms, mv = hsv(MAIN_RED)
    th, ts, tv = hsv(target)
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            h, s, v = hsv((r, g, b))
            if a and s > 0.3 and (h < 0.06 or h > 0.93):
                nr, ng, nb = colorsys.hsv_to_rgb(th, min(1, s * ts / ms), min(1, v * tv / mv))
                px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


# Egg tiers: Common, Rare, Epic, Legendary (the banner legendary shares the Legendary egg).
EGGS = ['egg_small_cream', 'egg_small_blue', 'egg_small_dark', 'egg_small_purple']


def main(eggs, icons):
    os.makedirs(OUT, exist_ok=True)
    for tier, stem in enumerate(EGGS):
        Image.open(os.path.join(eggs, stem + '.png')).convert('RGBA').save(os.path.join(OUT, f'egg-{tier}.png'), optimize=True)
    # The coin is drawn smooth (not hard pixels), so it is resampled once to the
    # shard's 17x18 from its large copy and shown at 1x beside the shard.
    Image.open(os.path.join(eggs, 'coin.png')).convert('RGBA').resize(COIN, Image.LANCZOS).save(os.path.join(OUT, 'coin.png'), optimize=True)
    Image.open(os.path.join(eggs, 'shard.png')).convert('RGBA').save(os.path.join(OUT, 'shard.png'), optimize=True)
    machine = native(os.path.join(eggs, 'egg_machine_red_blank.png'), MACHINE)
    for name, color in MACHINE_COLORS.items():
        art = machine.copy()
        if name != 'legend':
            paint(art, CROWN, PLATE_GREY)
            paint(art, PILL, lambda y: BODY_DARK if y <= 81 else BODY_RED)
        recolor(art, color).save(os.path.join(OUT, f'machine-{name}.png'), optimize=True)
    for kind, stem in TICKETS.items():
        native(os.path.join(eggs, stem + '.png'), TICKET).save(os.path.join(OUT, f'ticket-{kind}.png'), optimize=True)
    files = {}
    for gen in os.listdir(icons):
        folder = os.path.join(icons, gen)
        if not gen.isdigit() or not os.path.isdir(folder):
            continue
        for name in os.listdir(folder):
            files[name] = os.path.join(folder, name)
    rows = (LAST + COLS - 1) // COLS
    for shiny, target in ((False, 'icons.webp'), (True, 'icons-shiny.webp')):
        sheet = Image.new('RGBA', (COLS * W, rows * H), (0, 0, 0, 0))
        tag = 's' if shiny else ''
        for n in range(1, LAST + 1):
            name = f'{n}{tag}.png' if n not in FORMS else f'{n}{tag}-{FORMS[n]}.png'
            if name not in files:
                sys.exit('missing icon ' + name)
            icon = Image.open(files[name]).convert('RGBA')
            if icon.size != (W, H):
                sys.exit(f'{name} is {icon.size}, expected {W}x{H}')
            sheet.paste(icon, (((n - 1) % COLS) * W, ((n - 1) // COLS) * H))
        # Lossless WebP: a third the size of the PNG, pixel for pixel the same.
        sheet.save(os.path.join(OUT, target), lossless=True, quality=100, method=6)
    print('wrote', sorted(os.listdir(OUT)))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
