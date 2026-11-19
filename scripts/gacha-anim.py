# GIF -> one horizontal WebP strip per species (frames cropped to their union box), plus an index.
import json, os, sys, math
from PIL import Image, ImageSequence
src, out, cap = sys.argv[1], sys.argv[2], int(sys.argv[3])
index = {}
for sub, key in [('front', ''), ('shiny', 's')]:
    for f in sorted(os.listdir(os.path.join(src, sub)), key=lambda x: int(x.split('.')[0])):
        n = int(f.split('.')[0]); im = Image.open(os.path.join(src, sub, f))
        frames, durs = [], []
        for fr in ImageSequence.Iterator(im):
            frames.append(fr.convert('RGBA')); durs.append(fr.info.get('duration', 100) or 100)
        step = max(1, math.ceil(len(frames) / cap)); frames = frames[::step]; ms = round(sum(durs) / len(durs)) * step
        box = None
        for fr in frames:
            b = fr.getchannel('A').getbbox()
            if b: box = b if not box else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        if not box: continue
        w, h = box[2] - box[0], box[3] - box[1]
        strip = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
        for i, fr in enumerate(frames): strip.paste(fr.crop(box), (i * w, 0))
        name = key + str(n) + '.webp'
        strip.save(os.path.join(out, name), 'WEBP', lossless=True, method=6)
        index[key + str(n)] = [w, h, len(frames), ms]
json.dump(index, open(os.path.join(out, 'index.json'), 'w'), separators=(',', ':'))
print(len(index), 'strips')
