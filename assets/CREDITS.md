# Artwork credits

Spaceships, alien vessels, space stations and the planet are adapted from
**MillionthVector — Free Sprites**.

- Author: **MillionthVector**
- Original collection: https://millionthvector.blogspot.com/p/free-sprites.html
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**
- License terms: https://creativecommons.org/licenses/by/4.0/
- Retrieved: 2026-09-06

The author expressly permits commercial and noncommercial use with credit.
Credit must be retained when redistributing these images or adapted versions.
No endorsement by the original artist is implied.

Changes for Starfall Survivors: transparent-edge cropping, color grading,
exposure/contrast adjustment, downsampling and lossless WebP conversion.
The four player hulls additionally have revised proportions and newly drawn
flame vanes, crystalline fins, paired electromagnetic rails or layered armor
plates to identify their combat roles. These are adaptations of the credited
original hulls, not unmodified sprites supplied by the original artist.
Runtime engine lighting, thrusters, shields and animated Boss effects are added
separately. Original source URLs and SHA-256 hashes are recorded in
`source/manifest.json`; the original images are retained alongside it.
`tools/prepare_assets.py` reproduces the adapted images in `art/`.

The game's credits panel also attributes MillionthVector and CC BY 4.0.

## Frost Projectile And Impact

- Author: Kenney (https://kenney.nl/assets/particle-pack)
- License: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
- Sources: Particle Pack 1.1, `trace_01.png` and `muzzle_01.png` (transparent).
- Adaptations: cyan/white tint, cropping, six radial impact rays, lossless WebP.
  The projectile adds crystalline facets at runtime.
- Original archive and license: `source/kenney_particle-pack.zip`,
  `source/kenney-particle-license.txt`; hashes: `source/frost-manifest.json`.
- Reproduce with `python tools/prepare_frost_assets.py`.
