# 📸 Picsell — Professional Photo Preset Studio

> **High-performance photo preset studio powered by Python (Flask + NumPy + Pillow) and a modern dark glassmorphism Web UI.**

Picsell features **108 live presets across 9 curated categories** (*Film, Warm, Cool, Moody, Bright, Mono, Cinematic, Portrait, Nature*). Upload any photo to preview live rendered thumbnails across presets, fine-tune manual adjustments with real-time feedback, transform images (rotate/flip), compare with original photo, and export full-resolution results.

---

## ⚡ Key Features

- **108 Live Presets**: Instant batch rendering of preset thumbnails rendered directly on your uploaded image.
- **Pure Vectorized NumPy Engine**: High-performance image processing pipeline with sub-50ms rendering speeds.
- **Batched Thumbnail Engine**: Chunked 16-preset thumbnail streaming for smooth, non-blocking UI responsiveness.
- **Fine-Tune Adjustments**: Full manual control over **Brightness, Contrast, Saturation, Warmth, Tint (Green/Magenta), Vignette, Film Grain, Fade (Shadow Lift),** and **Black & White Mode**.
- **Transform Tools**: 90° rotation (left/right) and horizontal/vertical flipping.
- **Instant Comparison**: Hold **Spacebar** or click **Compare Original** to toggle instant before/after overlay.
- **Keyboard Shortcuts**:
  - `Space` — Hold to compare with original photo.
  - `R` — Reset sliders to active preset defaults.
  - `D` — Export high-resolution edited photo.
- **Full-Resolution Export**: High-quality JPEG download up to 3000px max resolution.

---

## 🚀 Quick Start

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/saransid23/picsell.git
cd picsell

# Install backend dependencies
pip install -r backend/requirements.txt
```

### 2. Run the Studio Server

```bash
python backend/app.py
```

### 3. Open in Browser

Navigate to **`http://localhost:5000`** in your browser!

> The Flask server automatically hosts both the REST API (`/api/*`) and the static web UI (`/`).

---

## 📁 Project Structure

```text
picsell/
├── .gitignore            # Excludes bytecode cache & OS clutter
├── README.md             # Project documentation
├── backend/
│   ├── app.py            # Flask REST API server & static file host
│   ├── engine.py         # Vectorized NumPy & Pillow image processing pipeline
│   ├── presets.py        # 108 preset definitions (Base looks + Light/Signature/Bold variants)
│   └── requirements.txt  # Python dependencies (Flask, Pillow, numpy)
└── frontend/
    ├── index.html        # Main web UI interface
    ├── script.js         # Interactive application logic & thumbnail chunking
    └── style.css         # Dark glassmorphism design system & responsive layout
```

---

## 📡 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/` | `GET` | Serves main web application UI |
| `/api/health` | `GET` | Health status check and active session stats |
| `/api/presets` | `GET` | Lists all 108 presets & categories with adjustments |
| `/api/upload` | `POST` | Uploads photo and creates an editing session |
| `/api/apply` | `POST` | Applies preset & adjustments to viewport preview |
| `/api/thumbnails` | `POST` | Parallel batch rendering of preset thumbnails |
| `/api/transform/rotate` | `POST` | Rotates image by specified angle (90°, 180°, 270°) |
| `/api/transform/flip` | `POST` | Flips image horizontally or vertically |
| `/api/download` | `POST` | Renders and downloads high-res final output |

---

## 🎨 Adding Custom Presets

Open `backend/presets.py` and add entries to `BASE_LOOKS`:

```python
# (name, category, brightness, contrast, saturation, warmth, tint, vignette, grain, fade, sepia, mono)
("Amber Dusk", "Film", 1.03, 1.08, 0.92, 0.35, 0.02, 0.18, 0.08, 0.10, 0.00, False),
```

The generator automatically builds **Light**, **Signature**, and **Bold** intensity variations for every look!

---

