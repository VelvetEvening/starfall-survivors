"""Adapt Kenney CC0 particles to the game's ice palette; retain source provenance."""
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/source'
URL = 'https://kenney.nl/media/pages/assets/particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip'


def main():
    archive = SOURCE / 'kenney_particle-pack.zip'
    with ZipFile(archive) as pack:
        names = [n for n in pack.namelist() if n.startswith('PNG (Transparent)/')
                 and n.count('/') == 1 and any(k in n for k in ('muzzle_', 'flame_', 'trace_'))]
        preview = Image.new('RGB', (600, ((len(names) + 4) // 5) * 120), '#162633')
        draw = ImageDraw.Draw(preview)
        for i, name in enumerate(names):
            image = Image.open(io.BytesIO(pack.read(name))).convert('RGBA')
            image.thumbnail((88, 88))
            x, y = (i % 5) * 120, (i // 5) * 120
            preview.paste(image, (x + (120 - image.width) // 2, y), image)
            draw.text((x + 6, y + 92), Path(name).name, fill='white')
        preview.save(SOURCE / 'frost-candidates.png')
        records = []
        for stem, source_name in [('frost-shard', 'trace_01.png'), ('frost-burst', 'muzzle_01.png')]:
            member = 'PNG (Transparent)/' + source_name
            raw = pack.read(member)
            image = Image.open(io.BytesIO(raw)).convert('RGBA')
            image = image.crop(image.getbbox())
            alpha = image.getchannel('A')
            color = ImageOps.colorize(alpha, '#449cca', '#efffff').convert('RGBA')
            color.putalpha(alpha)
            color.thumbnail((128, 128), Image.Resampling.LANCZOS)
            if stem == 'frost-burst':
                color.thumbnail((38, 58), Image.Resampling.LANCZOS)
                ray = Image.new('RGBA', (128, 128))
                ray.alpha_composite(color, ((128 - color.width) // 2, 8))
                radial = Image.new('RGBA', (128, 128))
                for angle in range(0, 360, 60):
                    radial = Image.alpha_composite(radial, ray.rotate(angle, Image.Resampling.BICUBIC))
                color = radial
            color.save(ROOT / 'assets/art' / (stem + '.webp'), lossless=True)
            records.append({'output': stem + '.webp', 'member': member,
                            'sha256': hashlib.sha256(raw).hexdigest()})
        (SOURCE / 'kenney-particle-license.txt').write_bytes(pack.read('License.txt'))
    (SOURCE / 'frost-manifest.json').write_text(json.dumps({
        'author': 'Kenney', 'license': 'CC0-1.0', 'url': URL,
        'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        'changes': 'Transparent crop, cyan/white tint, downsample, lossless WebP.',
        'assets': records,
    }, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
