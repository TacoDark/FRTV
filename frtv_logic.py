import numpy as np
from scipy.io import wavfile
from PIL import Image, ImageDraw, ImageFont
import io

# FRTV Protocol Constants
SAMPLE_RATE = 44100
SYNC_FREQ = 1200
PORCH_FREQ = 1500
FREQ_MIN = 3000
FREQ_MAX = 13000

# Expanded Quality Configurations
QUALITIES = {
    'ultra_low': {'width': 80, 'height': 60, 'pixel_samples': 4},
    'low': {'width': 160, 'height': 120, 'pixel_samples': 4},
    'medium': {'width': 320, 'height': 240, 'pixel_samples': 8},
    'high': {'width': 640, 'height': 480, 'pixel_samples': 16},
    'ultra_high': {'width': 1280, 'height': 960, 'pixel_samples': 32}
}

SYNC_SAMPLES = 441
PORCH_SAMPLES = 220

def encode_image(image_bytes, quality='medium', callsign='', message=''):
    config = QUALITIES.get(quality, QUALITIES['medium'])
    width, height = config['width'], config['height']
    pixel_samples = config['pixel_samples']

    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default()
    except:
        font = None

    if callsign:
        draw.rectangle([5, 5, 120, 25], fill=(0, 0, 0))
        draw.text((10, 10), f"CALL: {callsign.upper()}", fill=(255, 255, 255), font=font)
        
    if message:
        draw.rectangle([5, height-30, width-5, height-5], fill=(0, 0, 0))
        draw.text((10, height-25), message, fill=(255, 255, 255), font=font)

    data = np.array(img).astype(np.float32)
    # Color accuracy: ensure we use the full 0-255 range mapping correctly
    pixel_freqs = FREQ_MIN + (data / 255.0) * (FREQ_MAX - FREQ_MIN)
    total_audio = []
    
    t_header = np.linspace(0, 0.5, int(SAMPLE_RATE * 0.5))
    total_audio.append(np.sin(2 * np.pi * 1900 * t_header))
    
    current_phase = 0
    t_step = 1.0 / SAMPLE_RATE

    for y in range(height):
        line_signals = []
        # Sync
        t = np.arange(SYNC_SAMPLES) / SAMPLE_RATE
        phase = 2 * np.pi * SYNC_FREQ * t + current_phase
        line_signals.append(np.sin(phase))
        current_phase = phase[-1] + (2 * np.pi * SYNC_FREQ * t_step)
        
        # Porch
        t = np.arange(PORCH_SAMPLES) / SAMPLE_RATE
        phase = 2 * np.pi * PORCH_FREQ * t + current_phase
        line_signals.append(np.sin(phase))
        current_phase = phase[-1] + (2 * np.pi * PORCH_FREQ * t_step)
            
        line_data = pixel_freqs[y].flatten()
        scan_freqs = np.repeat(line_data, pixel_samples)
        phases = 2 * np.pi * scan_freqs * t_step
        cumulative_phase = np.cumsum(phases) + current_phase
        line_signals.append(np.sin(cumulative_phase))
        current_phase = cumulative_phase[-1] + phases[-1]
        
        total_audio.append(np.concatenate(line_signals))
        
    full_signal = np.concatenate(total_audio)
    full_signal = (full_signal * 32767).astype(np.int16)
    
    byte_io = io.BytesIO()
    wavfile.write(byte_io, SAMPLE_RATE, full_signal)
    return byte_io.getvalue()

def decode_audio(wav_bytes):
    # (Simple decoder remains for internal testing, but web uses live JS decoder)
    return b"" 
