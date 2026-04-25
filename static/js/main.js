const SAMPLE_RATE = 44100;
const FREQ_MIN = 3000;
const FREQ_MAX = 13000;
const SYNC_FREQ = 1200;
const SYNC_SAMPLES = 441;
const PORCH_SAMPLES = 220;

const QUALITIES = {
    'ultra_low': { width: 80, height: 60, pixel_samples: 4 },
    'low': { width: 160, height: 120, pixel_samples: 4 },
    'medium': { width: 320, height: 240, pixel_samples: 8 },
    'high': { width: 640, height: 480, pixel_samples: 16 },
    'ultra_high': { width: 1280, height: 960, pixel_samples: 32 }
};

const canvas = document.getElementById('live-canvas');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');
const etaText = document.getElementById('eta-text');

// Encode Form
document.getElementById('encode-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = document.getElementById('image-input').files[0];
    const callsign = document.getElementById('callsign-input').value;
    const message = document.getElementById('message-input').value;
    const quality = document.getElementById('quality-select').value;
    
    if (!file) return alert("Select an image first");

    status.innerText = "Status: Encoding...";
    const formData = new FormData();
    formData.append('image', file);
    formData.append('callsign', callsign);
    formData.append('message', message);
    formData.append('quality', quality);

    try {
        const response = await fetch('/encode', { method: 'POST', body: formData });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `frtv_${quality}_signal.wav`;
            a.click();
            status.innerText = "Status: Encoded & Downloaded";
        }
    } catch (err) { status.innerText = "Status: Encode Failed"; }
});

// Live Decode Logic
document.getElementById('play-decode-btn').addEventListener('click', async () => {
    const file = document.getElementById('audio-input').files[0];
    const qualityKey = document.getElementById('quality-select').value;
    const config = QUALITIES[qualityKey];
    
    if (!file) return alert("Select audio file first");

    const { width, height, pixel_samples } = config;
    canvas.width = width; canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    status.innerText = "Status: Syncing...";
    progressBar.style.width = "0%";

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    
    let x = 0, y = 0, c = 0;
    let pixelData = [0, 0, 0];
    let windowSamples = [];
    let state = "WAIT_HEADER";
    let sampleCounter = 0;
    let lineSampleCounter = 0;
    let lastPixelIndex = -1;
    const startTime = Date.now();

    processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const output = e.outputBuffer.getChannelData(0);
        output.set(input);

        for (let i = 0; i < input.length; i++) {
            sampleCounter++;
            const s = input[i];
            windowSamples.push(s);
            if (windowSamples.length > 512) windowSamples.shift();

            if (state === "WAIT_HEADER") {
                if (sampleCounter > SAMPLE_RATE * 0.5) state = "WAIT_SYNC";
                continue;
            }

            if (state === "WAIT_SYNC") {
                const syncWindow = windowSamples.slice(-SYNC_SAMPLES);
                if (syncWindow.length === SYNC_SAMPLES) {
                    let crossings = 0;
                    for(let j=0; j<syncWindow.length-1; j++) {
                        if((syncWindow[j] > 0 && syncWindow[j+1] <= 0) || (syncWindow[j] < 0 && syncWindow[j+1] >= 0)) crossings++;
                    }
                    const freq = (crossings / 2) / (SYNC_SAMPLES / SAMPLE_RATE);
                    if (Math.abs(freq - SYNC_FREQ) < 200) {
                        state = "DECODE_LINE";
                        lineSampleCounter = 0;
                        lastPixelIndex = -1;
                        x = 0; c = 0;
                        status.innerText = `Status: Receiving Line ${y+1}/${height}`;
                    }
                }
                continue;
            }

            if (state === "DECODE_LINE") {
                lineSampleCounter++;
                if (lineSampleCounter <= PORCH_SAMPLES) continue;

                const dataSample = lineSampleCounter - PORCH_SAMPLES;
                const pixelIndex = Math.floor(dataSample / pixel_samples);

                if (pixelIndex !== lastPixelIndex) {
                    lastPixelIndex = pixelIndex;
                    const pWindow = windowSamples.slice(-pixel_samples);
                    if (pWindow.length >= pixel_samples - 1) {
                        let crossings = 0;
                        for(let j=0; j<pWindow.length-1; j++) {
                            if((pWindow[j] > 0 && pWindow[j+1] <= 0) || (pWindow[j] < 0 && pWindow[j+1] >= 0)) crossings++;
                        }
                        const freq = (crossings / 2) / (pixel_samples / SAMPLE_RATE);
                        const val = Math.max(0, Math.min(255, ((freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * 255));
                        
                        pixelData[c] = val;
                        if (c === 2) {
                            ctx.fillStyle = `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`;
                            ctx.fillRect(x, y, 1, 1);
                            x++;
                        }
                        c = (c + 1) % 3;

                        if (x >= width) {
                            state = "WAIT_SYNC";
                            y++;
                            progressBar.style.width = `${(y / height) * 100}%`;
                            const elapsed = (Date.now() - startTime) / 1000;
                            if (y > 0) {
                                const totalEst = (elapsed / y) * height;
                                const remaining = Math.max(0, totalEst - elapsed);
                                etaText.innerText = `ETA: ${Math.floor(remaining/60)}:${Math.floor(remaining%60).toString().padStart(2,'0')}`;
                            }
                        }
                    }
                }
            }
        }
    };

    source.connect(processor); processor.connect(audioCtx.destination);
    source.connect(audioCtx.destination);
    source.start();
});
