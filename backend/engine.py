"""
Core image processing engine.

Pure vectorized NumPy processing engine.
Zero intermediate PIL copies during adjustment pipeline for lightning-fast sub-50ms preview rendering.
"""

import io
import numpy as np
from PIL import Image

MAX_PREVIEW_DIMENSION = 640  # Fast crisp size for instant viewport preview rendering
MAX_FULL_DIMENSION = 3000    # Cap max size for high-resolution download exports


def load_image(file_bytes):
    img = Image.open(io.BytesIO(file_bytes))
    img = img.convert("RGB")
    if max(img.size) > MAX_FULL_DIMENSION:
        img.thumbnail((MAX_FULL_DIMENSION, MAX_FULL_DIMENSION), Image.LANCZOS)
    return img


def make_preview_image(img, max_dim=MAX_PREVIEW_DIMENSION):
    """Create scaled-down image for instant viewport editing."""
    if max(img.size) <= max_dim:
        return img.copy()
    preview = img.copy()
    preview.thumbnail((max_dim, max_dim), Image.BOX)
    return preview


def apply_adjustments(img, adjustments):
    """
    Apply ALL adjustments in a single vectorized NumPy pass.
    """
    if not adjustments:
        return img

    arr = np.asarray(img, dtype=np.float32)

    # 1. Mono / Desaturation
    if adjustments.get("mono"):
        gray = arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114
        arr = np.stack([gray, gray, gray], axis=-1)

    # 2. Saturation (if not mono)
    saturation = adjustments.get("saturation", 1.0)
    if not adjustments.get("mono") and saturation != 1.0:
        gray = arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114
        arr = gray[:, :, np.newaxis] * (1.0 - saturation) + arr * saturation

    # 3. Brightness
    brightness = adjustments.get("brightness", 1.0)
    if brightness != 1.0:
        arr *= brightness

    # 4. Contrast
    contrast = adjustments.get("contrast", 1.0)
    if contrast != 1.0:
        arr = (arr - 128.0) * contrast + 128.0

    # 5. Warmth & Tint
    warmth = adjustments.get("warmth", 0.0)
    tint = adjustments.get("tint", 0.0)
    if warmth != 0 or tint != 0:
        arr[:, :, 0] += warmth * 30.0 + tint * 10.0
        arr[:, :, 1] += -tint * 20.0
        arr[:, :, 2] += -warmth * 30.0 + tint * 10.0

    # 6. Fade (shadow lift)
    fade = adjustments.get("fade", 0.0)
    if fade > 0:
        arr = arr * (1.0 - fade * 0.15) + (fade * 40.0)

    # 7. Sepia
    sepia = adjustments.get("sepia", 0.0)
    if sepia > 0:
        sepia_matrix = np.array([
            [0.393, 0.769, 0.189],
            [0.349, 0.686, 0.168],
            [0.272, 0.534, 0.131],
        ], dtype=np.float32)
        sepia_arr = arr @ sepia_matrix.T
        arr = arr * (1.0 - sepia) + sepia_arr * sepia

    # 8. Vignette
    vignette = adjustments.get("vignette", 0.0)
    if vignette > 0:
        h, w = arr.shape[:2]
        cy, cx = h * 0.5, w * 0.5
        inv_max_sq = 1.0 / (cx * cx + cy * cy)
        y, x = np.ogrid[:h, :w]
        dist_sq = ((x - cx)**2 + (y - cy)**2) * inv_max_sq
        mask = 1.0 - np.clip(dist_sq * (vignette * 1.2), 0.0, 1.0) * vignette
        arr *= mask[:, :, np.newaxis]

    # 9. Film Grain
    grain = adjustments.get("grain", 0.0)
    if grain > 0:
        h, w = arr.shape[:2]
        noise_strength = grain * 22.0
        noise = np.random.uniform(-noise_strength, noise_strength, (h, w, 1)).astype(np.float32)
        arr += noise

    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def image_to_bytes(img, fmt="JPEG", quality=75):
    buf = io.BytesIO()
    if fmt.upper() == "JPEG":
        img.save(buf, format="JPEG", quality=quality, optimize=False)
    else:
        img.save(buf, format=fmt.upper())
    buf.seek(0)
    return buf.getvalue()


def make_thumbnail(img, size=120):
    thumb = img.copy()
    thumb.thumbnail((size, size), Image.BOX)
    return thumb


def rotate_image(img, angle):
    angle = angle % 360
    if angle == 90:
        return img.transpose(Image.ROTATE_90)
    elif angle == 180:
        return img.transpose(Image.ROTATE_180)
    elif angle == 270:
        return img.transpose(Image.ROTATE_270)
    return img


def flip_image(img, mode="horizontal"):
    if mode == "horizontal":
        return img.transpose(Image.FLIP_LEFT_RIGHT)
    elif mode == "vertical":
        return img.transpose(Image.FLIP_TOP_BOTTOM)
    return img
