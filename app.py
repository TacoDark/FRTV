from flask import Flask, request, send_file, render_template, jsonify
import frtv_logic
import io
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/encode', methods=['POST'])
def encode():
    if 'image' not in request.files:
        return "No image uploaded", 400
    
    file = request.files['image']
    image_bytes = file.read()
    
    quality = request.form.get('quality', 'medium')
    callsign = request.form.get('callsign', '')
    message = request.form.get('message', '')
    
    audio_bytes = frtv_logic.encode_image(image_bytes, quality=quality, callsign=callsign, message=message)
    
    return send_file(
        io.BytesIO(audio_bytes),
        mimetype='audio/wav',
        as_attachment=True,
        download_name='frtv_signal.wav'
    )

@app.route('/decode', methods=['POST'])
def decode():
    if 'audio' not in request.files:
        return "No audio uploaded", 400
    
    file = request.files['audio']
    audio_bytes = file.read()
    
    try:
        image_bytes = frtv_logic.decode_audio(audio_bytes)
        return send_file(
            io.BytesIO(image_bytes),
            mimetype='image/png'
        )
    except Exception as e:
        return str(e), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
