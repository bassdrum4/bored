# Recover 96x96 native SP skins from the 3x uploads: each native pixel is the most common
# colour of its 3x3 block, on whichever grid offset the drawing sits.
import sys, glob, os
from collections import Counter
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
for f in sorted(glob.glob(os.path.join(src, '*.png'))):
    im = Image.open(f).convert('RGBA'); px = im.load(); W, H = im.size; k = 3
    best = min(((sum(len({px[ox + i*k + a, oy + j*k + b] for a in range(k) for b in range(k)}) > 1
                    for j in range((H - oy) // k) for i in range((W - ox) // k)), ox, oy)
                for ox in range(k) for oy in range(k)))
    _, ox, oy = best
    # pixels outside the chosen grid (the partial edge blocks) must be empty
    lost = sum(px[x, y][3] > 0 for x in range(W) for y in range(H) if x < ox or y < oy or x >= ox + 96 * k or y >= oy + 96 * k)
    nat = Image.new('RGBA', (96, 96))
    for j in range(96):
        for i in range(96):
            cells = [px[ox + i*k + a, oy + j*k + b] for a in range(k) for b in range(k) if ox + i*k + a < W and oy + j*k + b < H]
            c = Counter(cells).most_common(1)[0][0] if cells else (0, 0, 0, 0)
            nat.putpixel((i, j), c if c[3] else (0, 0, 0, 0))
    back = nat.resize((288, 288), Image.NEAREST); bp = back.load()
    diff = sum(bp[x - ox, y - oy] != px[x, y] for x in range(ox, min(W, ox + 288)) for y in range(oy, min(H, oy + 288)) if px[x, y][3] or bp[x - ox, y - oy][3])
    nat.save(os.path.join(out, os.path.basename(f)), optimize=True)
    print(os.path.basename(f), 'offset', (ox, oy), 'off-grid blocks', best[0], 'lost px', lost, 'round-trip diff px', diff, 'bbox', nat.getbbox())
