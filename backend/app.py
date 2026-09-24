"""
Flask backend for the Picsell Photo Preset Editor.
High-performance async & parallel threaded image server.
"""

import base64
import io
import os
import uuid
import time
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, request, jsonify, send_file, send_from_directory

import presets
import engine

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
executor = ThreadPoolExecutor(max_workers=8)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def cors_preflight(_any):
    return "", 204


SESSIONS = {}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB
SESSION_TTL_SECONDS = 3600  # 1 hour TTL


def _clean_expired_sessions():
    now = time.time()
    expired = [sid for sid, data in SESSIONS.items() if now - data.get("updated_at", 0) > SESSION_TTL_SECONDS]
    for sid in expired:
        del SESSIONS[sid]


@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    if os.path.exists(os.path.join(FRONTEND_DIR, path)):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/api/presets", methods=["GET"])
def list_presets():
    return jsonify({
        "categories": presets.get_categories(),
        "presets": presets.get_all_presets(),
    })


@app.route("/api/presets/<int:preset_id>", methods=["GET"])
def preset_detail(preset_id):
    preset = presets.get_preset(preset_id)
    if preset is None:
        return jsonify({"error": "Unknown preset_id"}), 404
    return jsonify(preset)


@app.route("/api/upload", methods=["POST"])
def upload_image():
    _clean_expired_sessions()
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files["image"]
    file_bytes = file.read()

    if len(file_bytes) == 0:
        return jsonify({"error": "Empty file"}), 400
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "File too large (max 25MB)"}), 400

    try:
        full_img = engine.load_image(file_bytes)
        preview_img = engine.make_preview_image(full_img, max_dim=1000)
    except Exception as e:
        return jsonify({"error": f"Could not read image: {str(e)}"}), 400

    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = {
        "full_img": full_img,
        "preview_img": preview_img,
        "updated_at": time.time()
    }

    return jsonify({
        "session_id": session_id,
        "width": full_img.width,
        "height": full_img.height,
    })


def _merge_adjustments(preset_id, overrides):
    base = {}
    if preset_id is not None:
        preset = presets.get_preset(preset_id)
        if preset is None:
            return None
        base = {k: v for k, v in preset.items() if k not in ("id", "name", "category")}
    if overrides:
        base.update(overrides)
    return base


@app.route("/api/apply", methods=["POST"])
def apply_preset():
    data = request.get_json(force=True, silent=True) or {}
    session_id = data.get("session_id")
    preset_id = data.get("preset_id")
    overrides = data.get("adjustments") or {}

    if session_id not in SESSIONS:
        return jsonify({"error": "Unknown session_id. Please re-upload your photo."}), 404

    session_data = SESSIONS[session_id]
    session_data["updated_at"] = time.time()

    adjustments = _merge_adjustments(preset_id, overrides)
    if adjustments is None and preset_id is not None:
        return jsonify({"error": "Unknown preset_id"}), 400

    # Fast processing on viewport preview image
    img = session_data["preview_img"]
    result = engine.apply_adjustments(img, adjustments or {})
    result_bytes = engine.image_to_bytes(result, fmt="JPEG", quality=85)

    return send_file(io.BytesIO(result_bytes), mimetype="image/jpeg")


def _render_single_thumb(pid, small_img):
    preset = presets.get_preset(pid)
    if preset is None:
        return None
    adjustments = {k: v for k, v in preset.items() if k not in ("id", "name", "category")}
    edited = engine.apply_adjustments(small_img, adjustments)
    jpeg_bytes = engine.image_to_bytes(edited, fmt="JPEG", quality=65)
    return str(pid), base64.b64encode(jpeg_bytes).decode("ascii")


@app.route("/api/thumbnails", methods=["POST"])
def preset_thumbnails():
    data = request.get_json(force=True, silent=True) or {}
    session_id = data.get("session_id")
    preset_ids = data.get("preset_ids") or []

    if session_id not in SESSIONS:
        return jsonify({"error": "Unknown session_id. Please re-upload your photo."}), 404

    session_data = SESSIONS[session_id]
    session_data["updated_at"] = time.time()
    small_img = engine.make_thumbnail(session_data["preview_img"], size=120)

    # Parallel processing of batch thumbnails
    futures = [executor.submit(_render_single_thumb, pid, small_img) for pid in preset_ids]
    results = {}
    for f in futures:
        res = f.result()
        if res:
            results[res[0]] = res[1]

    return jsonify(results)


@app.route("/api/transform/rotate", methods=["POST"])
def rotate_image_endpoint():
    data = request.get_json(force=True, silent=True) or {}
    session_id = data.get("session_id")
    angle = data.get("angle", 90)

    if session_id not in SESSIONS:
        return jsonify({"error": "Unknown session_id. Please re-upload your photo."}), 404

    session_data = SESSIONS[session_id]
    session_data["full_img"] = engine.rotate_image(session_data["full_img"], angle)
    session_data["preview_img"] = engine.rotate_image(session_data["preview_img"], angle)
    session_data["updated_at"] = time.time()

    return jsonify({
        "status": "ok",
        "width": session_data["preview_img"].width,
        "height": session_data["preview_img"].height
    })


@app.route("/api/transform/flip", methods=["POST"])
def flip_image_endpoint():
    data = request.get_json(force=True, silent=True) or {}
    session_id = data.get("session_id")
    mode = data.get("mode", "horizontal")

    if session_id not in SESSIONS:
        return jsonify({"error": "Unknown session_id. Please re-upload your photo."}), 404

    session_data = SESSIONS[session_id]
    session_data["full_img"] = engine.flip_image(session_data["full_img"], mode)
    session_data["preview_img"] = engine.flip_image(session_data["preview_img"], mode)
    session_data["updated_at"] = time.time()

    return jsonify({
        "status": "ok",
        "width": session_data["preview_img"].width,
        "height": session_data["preview_img"].height
    })


@app.route("/api/download", methods=["POST"])
def download_image():
    data = request.get_json(force=True, silent=True) or {}
    session_id = data.get("session_id")
    preset_id = data.get("preset_id")
    overrides = data.get("adjustments") or {}

    if session_id not in SESSIONS:
        return jsonify({"error": "Unknown session_id. Please re-upload your photo."}), 404

    session_data = SESSIONS[session_id]
    session_data["updated_at"] = time.time()

    adjustments = _merge_adjustments(preset_id, overrides)
    if adjustments is None and preset_id is not None:
        return jsonify({"error": "Unknown preset_id"}), 400

    # High quality render on FULL resolution image
    img = session_data["full_img"]
    result = engine.apply_adjustments(img, adjustments or {})
    result_bytes = engine.image_to_bytes(result, fmt="JPEG", quality=95)

    return send_file(
        io.BytesIO(result_bytes),
        mimetype="image/jpeg",
        as_attachment=True,
        download_name="picsell-edited-photo.jpg",
    )


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "preset_count": len(presets.get_all_presets()),
        "active_sessions": len(SESSIONS)
    })


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000, threaded=True)
