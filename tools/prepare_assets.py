"""Adapt MillionthVector's CC BY 4.0 sprites; requires Pillow for authoring only.

Original images and their source manifest are in assets/source/. This script
preserves their surface shading while unifying hues, cropping and downsampling.
The game itself needs no Python, Pillow or network connection.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets' / 'source'
OUT = ROOT / 'assets' / 'art'

# name: original, maximum pixels, tint, tint strength, exposure.
RECIPES = {
    'vega': ('F5S1.png', 256, '#f38c51', 0.52, 1.75),
    'firefly': ('F5S3.png', 256, '#9ccaff', 0.52, 1.9),
    'dawn': ('F5S2.png', 256, '#a6afb8', 0.60, 1.8),
    'thunder': ('F5S4.png', 256, '#55c2ff', 0.48, 1.9),
    'grub': ('RD3.png', 128, '#9976c2', 0.8, 1.25),
    'crab': ('RD1.png', 128, '#8567a5', 0.76, 1.1),
    'falcon': ('alien2.png', 128, '#cc789e', 0.38, 1.45),
    'jelly': ('alien3.png', 160, '#967ccc', 0.48, 1.6),
    'turret': ('RD2.png', 128, '#b786a5', 0.65, 1.2),
    'elite-grub': ('redship4.png', 192, '#c39764', 0.76, 1.15),
    'elite-crab': ('tribase-u3-d0.png', 192, '#b99977', 0.5, 1.5),
    'annihilation-eye': ('spacestation.png', 384, '#ad82c8', 0.95, 1.28),
    'abyss-sovereign': ('alienspaceship.png', 512, '#cc838e', 0.62, 1.0),
    'planet': ('planet.png', 640, '#6cabbc', 0.96, 0.82),
}


def specialize_frame(name, image):
    """Rework the four licensed hulls into distinct, reproducible silhouettes.

    Added fins, rails and armor plates are author-drawn adaptations. They are
    decorative: the renderer and combat collision radius stay unchanged.
    """
    ratios = {'vega': (1.10, 0.96), 'firefly': (1.05, 1.0),
              'thunder': (0.94, 1.0), 'dawn': (1.58, 0.84)}
    rx, ry = ratios[name]
    image = image.resize((round(image.width * rx), round(image.height * ry)), Image.Resampling.LANCZOS)
    image.thumbnail((235, 250), Image.Resampling.LANCZOS)
    width, height = image.size
    canvas = Image.new('RGBA', (440, 400))
    center, top = 220, 65
    draw = ImageDraw.Draw(canvas)

    def point(u, v):
        return round(center + u * width), round(top + v * height)

    def plate(points, fill, edge):
        draw.polygon([point(u, v) for u, v in points], fill=fill)
        draw.line([point(u, v) for u, v in points + [points[0]]], fill=edge, width=2, joint='curve')

    def seam(points, color, thickness=2):
        draw.line([point(u, v) for u, v in points], fill=color, width=thickness, joint='curve')

    for side in (-1, 1):
        if name == 'vega':
            plate([(side*.24,.37),(side*.66,.69),(side*.47,.78),(side*.20,.62)], '#352631', '#d8845e')
            plate([(side*.31,.48),(side*.59,.69),(side*.45,.70)], '#a95232', '#f3a263')
        elif name == 'firefly':
            plate([(side*.24,.23),(side*.62,.015),(side*.55,.48),(side*.36,.62)], '#20364f', '#91c3ec')
            plate([(side*.36,.25),(side*.58,.06),(side*.48,.43)], '#4778a4', '#d1e9ff')
            seam([(side*.58,.07),(side*.43,.36),(side*.36,.52)], '#8ed4ff')
        elif name == 'thunder':
            plate([(side*.10,-.09),(side*.21,-.09),(side*.24,.44),(side*.09,.51)], '#152b43', '#7092b0')
        else:
            plate([(side*.36,.20),(side*.66,.27),(side*.72,.74),(side*.54,.88),(side*.35,.78)], '#242c36', '#8593a3')
            plate([(side*.43,.29),(side*.60,.32),(side*.64,.70),(side*.50,.78)], '#53616e', '#a7b6c1')
            seam([(side*.44,.32),(side*.48,.71)], '#718596', 3)

    canvas.alpha_composite(image, (center-width//2, top))
    draw = ImageDraw.Draw(canvas)
    if name == 'vega':
        seam([(-.12,.28),(0,.19),(.12,.28)], '#ffe0a1', 3)
        for side in (-1, 1):
            seam([(side*.26,.57),(side*.42,.68),(side*.54,.67)], '#ff9a43', 3)
            seam([(side*.08,.71),(side*.08,.90)], '#dd6540', 2)
    elif name == 'firefly':
        plate([(0,.33),(-.10,.45),(0,.58),(.10,.45)], '#335375', '#9ed8ff')
        seam([(0,.37),(0,.54)], '#edf8ff', 2)
        seam([(-.065,.45),(.065,.45)], '#d2f1ff', 2)
    elif name == 'thunder':
        # Paired projecting barrels and transverse capacitor bands identify the railgun.
        for side in (-1, 1):
            plate([(side*.11,-.085),(side*.19,-.085),(side*.20,.40),(side*.10,.43)], '#203a51', '#729fbf')
            seam([(side*.15,-.055),(side*.15,.37)], '#74ddff', 3)
            for y in (.035,.12,.205,.29):
                seam([(side*.10,y),(side*.205,y)], '#b4ecff', 2)
    else:
        plate([(-.19,.42),(.19,.42),(.16,.67),(0,.77),(-.16,.67)], '#303e4e', '#96a8b8')
        plate([(-.105,.47),(.105,.47),(.09,.62),(0,.69),(-.09,.62)], '#53606b', '#c8bd9d')
        seam([(-.10,.49),(.10,.49)], '#dbbc80', 3)
        for side in (-1, 1):
            for y in (.46,.53,.60):
                seam([(side*.54,y),(side*.62,y+.025)], '#c8a967', 3)

    canvas = canvas.crop(canvas.getchannel('A').getbbox())
    canvas.thumbnail((256, 256), Image.Resampling.LANCZOS)
    return canvas


def prepare(name, recipe):
    original, size, tint, amount, exposure = recipe
    image = Image.open(SOURCE / original).convert('RGBA')
    bounds = image.getchannel('A').getbbox()
    if bounds:
        image = image.crop(bounds)
    alpha = image.getchannel('A')
    rgb = image.convert('RGB')
    gray = ImageOps.grayscale(rgb)
    colored = ImageOps.colorize(gray, '#0a101e', tint, whitepoint=218)
    rgb = Image.blend(rgb, colored, amount)
    rgb = ImageEnhance.Brightness(rgb).enhance(exposure)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.07)
    if name in ('vega', 'firefly', 'dawn', 'thunder'):
        # 原舰体红色灯带改为角色识别色，保留装甲的明暗和磨损纹理。
        accent = tuple(int(tint[i:i+2], 16) for i in (1, 3, 5))
        original_rgb = image.convert('RGB')
        original_pixels = [original_rgb.getpixel((x, y)) for y in range(image.height) for x in range(image.width)]
        pixels = [rgb.getpixel((x, y)) for y in range(rgb.height) for x in range(rgb.width)]
        for i, (red, green, blue) in enumerate(original_pixels):
            if red > 42 and red > green * 1.45 and red > blue * 1.3:
                light = min(1.18, 0.35 + red / 210)
                pixels[i] = tuple(min(255, int(channel * light)) for channel in accent)
        rgb.putdata(pixels)
    rgb.putalpha(alpha)
    rgb.thumbnail((size, size), Image.Resampling.LANCZOS)
    if name in ('vega', 'firefly', 'dawn', 'thunder'):
        rgb = specialize_frame(name, rgb)
    rgb.save(OUT / (name + '.webp'), lossless=True, method=6)
    return rgb.size


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, recipe in RECIPES.items():
        print(name, prepare(name, recipe))
