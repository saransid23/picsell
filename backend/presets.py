"""
Preset library for the photo editor.

Each preset is a dict of adjustment values applied by engine.py:
    brightness  : 1.0 = no change (PIL ImageEnhance.Brightness factor)
    contrast    : 1.0 = no change (PIL ImageEnhance.Contrast factor)
    saturation  : 1.0 = no change (PIL ImageEnhance.Color factor)
    warmth      : -1.0 .. 1.0   (negative = cooler/blue, positive = warmer/orange)
    tint        : -1.0 .. 1.0   (negative = green, positive = magenta)
    vignette    : 0.0 .. 1.0    (strength of darkened edges)
    grain       : 0.0 .. 1.0    (amount of film grain noise)
    fade        : 0.0 .. 1.0    (lifted blacks / faded film look)
    sepia       : 0.0 .. 1.0    (sepia tone mix)
    mono        : bool          (desaturate to black & white before other effects)

Rather than hand-writing 100+ one-off dicts, we define a curated set of
BASE_LOOKS (the actual creative direction) and generate Light / Signature / Bold
intensity variants of each. This keeps the presets coherent (a real designer's
"base look" scaled up or down) instead of random noise, while still giving
users 100+ distinct choices.
"""

BASE_LOOKS = [
    # name, category, brightness, contrast, saturation, warmth, tint, vignette, grain, fade, sepia, mono
    ("Amber Dusk",     "Film",       1.03, 1.08, 0.92,  0.35,  0.02, 0.18, 0.08, 0.10, 0.00, False),
    ("Kodak Gold",     "Film",       1.05, 1.05, 1.10,  0.25,  0.03, 0.10, 0.14, 0.06, 0.00, False),
    ("Faded Reel",     "Film",       1.00, 0.90, 0.85,  0.10, -0.02, 0.06, 0.20, 0.28, 0.00, False),
    ("Polaroid 600",   "Film",       1.06, 0.94, 0.90,  0.18,  0.05, 0.22, 0.16, 0.22, 0.05, False),
    ("Cinestill",      "Film",       0.98, 1.10, 1.05, -0.10,  0.06, 0.20, 0.18, 0.08, 0.00, False),

    ("Golden Hour",    "Warm",       1.08, 1.05, 1.08,  0.45,  0.02, 0.10, 0.02, 0.05, 0.00, False),
    ("Terracotta",     "Warm",       1.02, 1.10, 0.95,  0.40,  0.08, 0.12, 0.03, 0.04, 0.00, False),
    ("Honeyglow",      "Warm",       1.10, 1.02, 1.05,  0.30,  0.00, 0.05, 0.00, 0.06, 0.00, False),
    ("Desert Sun",     "Warm",       1.06, 1.08, 0.90,  0.50,  0.10, 0.15, 0.05, 0.10, 0.00, False),

    ("Arctic Blue",    "Cool",       1.02, 1.06, 0.95, -0.40, -0.05, 0.08, 0.02, 0.04, 0.00, False),
    ("Moonlit",        "Cool",       0.94, 1.12, 0.85, -0.35, -0.02, 0.20, 0.06, 0.06, 0.00, False),
    ("Steel Fog",      "Cool",       0.98, 1.00, 0.75, -0.20,  0.00, 0.10, 0.04, 0.14, 0.00, False),
    ("Glacier",        "Cool",       1.04, 1.04, 0.90, -0.30, -0.08, 0.06, 0.00, 0.02, 0.00, False),

    ("Midnight Noir",  "Moody",      0.90, 1.20, 0.80, -0.10,  0.00, 0.30, 0.10, 0.02, 0.00, False),
    ("Storm Front",     "Moody",     0.88, 1.15, 0.70, -0.05,  0.02, 0.28, 0.12, 0.06, 0.00, False),
    ("Velvet Shadow",  "Moody",      0.92, 1.18, 0.88,  0.08, -0.02, 0.25, 0.05, 0.00, 0.00, False),
    ("Ash & Ember",    "Moody",      0.95, 1.14, 0.82,  0.15,  0.00, 0.22, 0.10, 0.05, 0.00, False),

    ("Sunlit Pastel",  "Bright",     1.12, 0.95, 0.90,  0.10,  0.05, 0.02, 0.00, 0.12, 0.00, False),
    ("Clean Light",    "Bright",     1.15, 1.02, 1.00,  0.02,  0.00, 0.00, 0.00, 0.04, 0.00, False),
    ("Airy",           "Bright",     1.18, 0.92, 0.88,  0.06,  0.02, 0.00, 0.00, 0.18, 0.00, False),
    ("Studio White",   "Bright",     1.10, 1.05, 0.95,  0.00,  0.00, 0.00, 0.00, 0.00, 0.00, False),

    ("Classic Mono",   "Mono",       1.02, 1.10, 0.00,  0.00,  0.00, 0.10, 0.06, 0.05, 0.00, True),
    ("Ansel",          "Mono",       0.98, 1.25, 0.00,  0.00,  0.00, 0.15, 0.10, 0.00, 0.00, True),
    ("Soft Grey",      "Mono",       1.06, 0.95, 0.00,  0.00,  0.00, 0.05, 0.14, 0.20, 0.00, True),
    ("Noir Contrast",  "Mono",       0.92, 1.35, 0.00,  0.00,  0.00, 0.25, 0.08, 0.00, 0.00, True),
    ("Sepia Archive",  "Mono",       1.00, 1.05, 0.00,  0.00,  0.00, 0.12, 0.15, 0.10, 0.55, True),

    ("Cinematic Teal", "Cinematic",  1.00, 1.15, 1.00, -0.15,  0.10, 0.18, 0.06, 0.04, 0.00, False),
    ("Blockbuster",    "Cinematic",  0.96, 1.20, 1.05, -0.05,  0.06, 0.22, 0.08, 0.02, 0.00, False),
    ("Anamorphic",     "Cinematic",  0.98, 1.12, 0.95,  0.05,  0.04, 0.20, 0.10, 0.06, 0.00, False),
    ("Neo Noir",       "Cinematic",  0.90, 1.25, 0.75,  0.00,  0.00, 0.28, 0.12, 0.00, 0.00, False),

    ("Peachy Skin",    "Portrait",   1.06, 1.02, 0.95,  0.20,  0.06, 0.08, 0.02, 0.06, 0.00, False),
    ("Soft Portrait",  "Portrait",   1.08, 0.96, 0.92,  0.12,  0.04, 0.04, 0.00, 0.10, 0.00, False),
    ("Studio Glow",    "Portrait",   1.10, 1.00, 1.00,  0.08,  0.02, 0.00, 0.00, 0.02, 0.00, False),

    ("Emerald Forest", "Nature",     1.02, 1.08, 1.15, -0.05,  -0.06, 0.10, 0.04, 0.02, 0.00, False),
    ("Mossy Trail",    "Nature",     1.00, 1.05, 1.05,  0.05,  -0.04, 0.12, 0.06, 0.06, 0.00, False),
    ("Coastal Breeze", "Nature",     1.06, 1.02, 1.02, -0.15,  -0.02, 0.05, 0.02, 0.04, 0.00, False),
]

INTENSITIES = [
    ("Light", 0.5),
    ("Signature", 1.0),
    ("Bold", 1.5),
]


def _scale(value, factor, center=1.0):
    """Scale a value toward/away from its neutral center by factor."""
    return center + (value - center) * factor


def _build_presets():
    presets = []
    pid = 1
    for (name, category, brightness, contrast, saturation, warmth, tint,
         vignette, grain, fade, sepia, mono) in BASE_LOOKS:
        for suffix, factor in INTENSITIES:
            preset_name = name if suffix == "Signature" else f"{name} {suffix}"
            presets.append({
                "id": pid,
                "name": preset_name,
                "category": category,
                "brightness": round(_scale(brightness, factor), 4),
                "contrast": round(_scale(contrast, factor), 4),
                "saturation": round(_scale(saturation, factor) if not mono else 0.0, 4),
                "warmth": round(warmth * factor, 4),
                "tint": round(tint * factor, 4),
                "vignette": round(min(vignette * factor, 1.0), 4),
                "grain": round(min(grain * factor, 1.0), 4),
                "fade": round(min(fade * factor, 1.0), 4),
                "sepia": round(min(sepia * factor, 1.0), 4),
                "mono": mono,
            })
            pid += 1
    return presets


PRESETS = _build_presets()
PRESETS_BY_ID = {p["id"]: p for p in PRESETS}
CATEGORIES = sorted({p["category"] for p in PRESETS})


def get_all_presets():
    return PRESETS


def get_preset(preset_id):
    return PRESETS_BY_ID.get(int(preset_id))


def get_categories():
    return CATEGORIES
