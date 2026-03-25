import os
import uuid
import subprocess
import json
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['OUTPUT_FOLDER'] = os.path.join(os.path.dirname(__file__), 'outputs')
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

PLATFORM_PRESETS = {
    'tiktok': {'width': 1080, 'height': 1920, 'max_duration': 180, 'label': 'TikTok'},
    'reels': {'width': 1080, 'height': 1920, 'max_duration': 90, 'label': 'Instagram Reels'},
    'shorts': {'width': 1080, 'height': 1920, 'max_duration': 60, 'label': 'YouTube Shorts'},
    'twitter': {'width': 1080, 'height': 1920, 'max_duration': 140, 'label': 'Twitter/X'},
}


def get_video_info(filepath):
    cmd = [
        'ffprobe', '-v', 'quiet', '-print_format', 'json',
        '-show_format', '-show_streams', filepath
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)


def create_short(input_path, output_path, start, end, preset):
    target_w = preset['width']
    target_h = preset['height']
    target_ratio = target_w / target_h

    info = get_video_info(input_path)
    video_stream = next(s for s in info['streams'] if s['codec_type'] == 'video')
    src_w = int(video_stream['width'])
    src_h = int(video_stream['height'])
    src_ratio = src_w / src_h

    # Build crop/scale filter to fit target aspect ratio
    if src_ratio > target_ratio:
        # Source is wider — crop sides
        new_w = int(src_h * target_ratio)
        crop = f"crop={new_w}:{src_h}"
    else:
        # Source is taller — crop top/bottom
        new_h = int(src_w / target_ratio)
        crop = f"crop={src_w}:{new_h}"

    vf = f"{crop},scale={target_w}:{target_h}"

    duration = end - start
    max_dur = preset['max_duration']
    if duration > max_dur:
        duration = max_dur

    cmd = [
        'ffmpeg', '-y',
        '-ss', str(start),
        '-i', input_path,
        '-t', str(duration),
        '-vf', vf,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        output_path
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)
    return output_path


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400

    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.mp4', '.mov', '.avi', '.mkv', '.webm'):
        return jsonify({'error': 'Unsupported video format'}), 400

    video_id = str(uuid.uuid4())
    filename = f"{video_id}{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    info = get_video_info(filepath)
    duration = float(info['format'].get('duration', 0))
    video_stream = next(s for s in info['streams'] if s['codec_type'] == 'video')

    return jsonify({
        'video_id': video_id,
        'filename': filename,
        'duration': duration,
        'width': int(video_stream['width']),
        'height': int(video_stream['height']),
        'url': f'/video/{filename}'
    })


@app.route('/video/<filename>')
def serve_video(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    video_id = data.get('video_id')
    filename = data.get('filename')
    start = float(data.get('start', 0))
    end = float(data.get('end', 0))
    platforms = data.get('platforms', [])

    if not filename or not platforms:
        return jsonify({'error': 'Missing required fields'}), 400

    input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(input_path):
        return jsonify({'error': 'Video not found'}), 404

    results = []
    for platform in platforms:
        if platform not in PLATFORM_PRESETS:
            continue
        preset = PLATFORM_PRESETS[platform]
        out_filename = f"{video_id}_{platform}.mp4"
        out_path = os.path.join(app.config['OUTPUT_FOLDER'], out_filename)

        try:
            create_short(input_path, out_path, start, end, preset)
            results.append({
                'platform': platform,
                'label': preset['label'],
                'url': f'/download/{out_filename}',
                'filename': out_filename
            })
        except subprocess.CalledProcessError as e:
            results.append({
                'platform': platform,
                'label': preset['label'],
                'error': f'Processing failed: {e.stderr[:200] if e.stderr else "Unknown error"}'
            })

    return jsonify({'results': results})


@app.route('/download/<filename>')
def download(filename):
    return send_from_directory(
        app.config['OUTPUT_FOLDER'], filename,
        as_attachment=True
    )


if __name__ == '__main__':
    app.run(debug=True, port=5000)
