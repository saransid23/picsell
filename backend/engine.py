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

    # 5b. Color Grading / 3-Way Split Toning (Shadows, Midtones, Highlights)
    sh_warmth = adjustments.get("shadows_warmth", 0.0)
    sh_tint = adjustments.get("shadows_tint", 0.0)
    mid_warmth = adjustments.get("midtones_warmth", 0.0)
    mid_tint = adjustments.get("midtones_tint", 0.0)
    hl_warmth = adjustments.get("highlights_warmth", 0.0)
    hl_tint = adjustments.get("highlights_tint", 0.0)

    if any([sh_warmth, sh_tint, mid_warmth, mid_tint, hl_warmth, hl_tint]):
        lum = (arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114) / 255.0
        s_mask = np.square(1.0 - lum)
        h_mask = np.square(lum)
        m_mask = np.clip(1.0 - s_mask - h_mask, 0.0, 1.0)

        if sh_warmth != 0 or sh_tint != 0:
            arr[:, :, 0] += (sh_warmth * 35.0 + sh_tint * 15.0) * s_mask
            arr[:, :, 1] += (-sh_tint * 25.0) * s_mask
            arr[:, :, 2] += (-sh_warmth * 35.0 + sh_tint * 15.0) * s_mask

        if mid_warmth != 0 or mid_tint != 0:
            arr[:, :, 0] += (mid_warmth * 35.0 + mid_tint * 15.0) * m_mask
            arr[:, :, 1] += (-mid_tint * 25.0) * m_mask
            arr[:, :, 2] += (-mid_warmth * 35.0 + mid_tint * 15.0) * m_mask

        if hl_warmth != 0 or hl_tint != 0:
            arr[:, :, 0] += (hl_warmth * 35.0 + hl_tint * 15.0) * h_mask
            arr[:, :, 1] += (-hl_tint * 25.0) * h_mask
            arr[:, :, 2] += (-hl_warmth * 35.0 + hl_tint * 15.0) * h_mask

    # 5c. Tone Curves LUT Engine (RGB, Red, Green, Blue Curves)
    curves = adjustments.get("curves")
    if curves and isinstance(curves, dict):
        x_nodes = np.array([0, 64, 128, 192, 255], dtype=np.float32)
        if "rgb" in curves and len(curves["rgb"]) == 5:
            y_nodes = np.array(curves["rgb"], dtype=np.float32)
            lut_rgb = np.clip(np.interp(np.arange(256), x_nodes, y_nodes), 0, 255).astype(np.uint8)
            arr_uint8 = np.clip(arr, 0, 255).astype(np.uint8)
            arr = lut_rgb[arr_uint8].astype(np.float32)

        for i, ch in enumerate(["r", "g", "b"]):
            if ch in curves and len(curves[ch]) == 5:
                y_nodes = np.array(curves[ch], dtype=np.float32)
                lut_ch = np.clip(np.interp(np.arange(256), x_nodes, y_nodes), 0, 255).astype(np.uint8)
                ch_uint8 = np.clip(arr[:, :, i], 0, 255).astype(np.uint8)
                arr[:, :, i] = lut_ch[ch_uint8].astype(np.float32)

    # 5d. Vibrance (Smart Saturation)
    vibrance = adjustments.get("vibrance", 0.0)
    if vibrance != 0.0 and not adjustments.get("mono"):
        max_c = np.maximum(np.maximum(arr[:, :, 0], arr[:, :, 1]), arr[:, :, 2])
        min_c = np.minimum(np.minimum(arr[:, :, 0], arr[:, :, 1]), arr[:, :, 2])
        sat_mask = (max_c - min_c) / (max_c + 1e-5)
        vib_factor = 1.0 + vibrance * (1.0 - sat_mask)
        gray = arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114
        arr = gray[:, :, np.newaxis] * (1.0 - vib_factor[:, :, np.newaxis]) + arr * vib_factor[:, :, np.newaxis]

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


def make_thumbnail(img, size=100):
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
