// ── Subtitle generation using Whisper (transformers.js) ──
// This runs entirely in-browser via WebAssembly — no backend needed.

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

let subtitles = [];       // [{ start, end, text }]
let transcriber = null;
let currentStyle = 'classic';

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    const generateSubsBtn = document.getElementById('generateSubsBtn');
    const subsStatus       = document.getElementById('subsStatus');
    const subsProgressBar  = document.getElementById('subsProgressBar');
    const subsProgressText = document.getElementById('subsProgressText');
    const subsOptions      = document.getElementById('subsOptions');
    const subsList         = document.getElementById('subsList');
    const showSubsToggle   = document.getElementById('showSubsToggle');
    const subsColor        = document.getElementById('subsColor');
    const subtitleOverlay  = document.getElementById('subtitleOverlay');
    const videoPlayer      = document.getElementById('videoPlayer');

    // ── Generate subtitles button ────────────────
    generateSubsBtn.addEventListener('click', async () => {
        if (!videoPlayer.src) {
            alert('Upload a video first.');
            return;
        }

        generateSubsBtn.disabled = true;
        subsStatus.classList.remove('hidden');
        subsProgressText.textContent = 'Loading Whisper model (~40MB first time)...';
        subsProgressBar.style.width = '10%';

        try {
            // Load model if not cached
            if (!transcriber) {
                transcriber = await pipeline(
                    'automatic-speech-recognition',
                    'Xenova/whisper-tiny.en',
                    {
                        progress_callback: (progress) => {
                            if (progress.status === 'progress' && progress.progress) {
                                const pct = Math.round(progress.progress);
                                subsProgressBar.style.width = Math.min(pct, 50) + '%';
                                subsProgressText.textContent = `Downloading model... ${pct}%`;
                            }
                        }
                    }
                );
            }

            subsProgressBar.style.width = '55%';
            subsProgressText.textContent = 'Extracting audio...';

            // Extract audio from video as Float32Array
            const audioData = await extractAudio(videoPlayer);

            subsProgressBar.style.width = '65%';
            subsProgressText.textContent = 'Transcribing audio...';

            // Run Whisper
            const result = await transcriber(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: true,
            });

            subsProgressBar.style.width = '95%';
            subsProgressText.textContent = 'Processing results...';

            // Parse chunks into subtitle segments
            subtitles = [];
            if (result.chunks && result.chunks.length > 0) {
                for (const chunk of result.chunks) {
                    const text = chunk.text.trim();
                    if (!text) continue;
                    subtitles.push({
                        start: chunk.timestamp[0] || 0,
                        end: chunk.timestamp[1] || (chunk.timestamp[0] + 3),
                        text: text,
                    });
                }
            }

            if (subtitles.length === 0) {
                subsProgressText.textContent = 'No speech detected in the audio.';
                subsProgressBar.style.width = '100%';
                generateSubsBtn.disabled = false;
                return;
            }

            subsProgressBar.style.width = '100%';
            subsProgressText.textContent = `Found ${subtitles.length} subtitle segment(s)`;

            // Show options & render list
            subsOptions.classList.remove('hidden');
            renderSubtitleList();

            // Start overlay updates
            subtitleOverlay.classList.add('style-classic');

        } catch (err) {
            console.error('Subtitle generation failed:', err);
            subsProgressText.textContent = 'Failed: ' + (err.message || 'Unknown error');
        }

        generateSubsBtn.disabled = false;
    });

    // ── Render editable subtitle list ────────────
    function renderSubtitleList() {
        subsList.innerHTML = '';
        subtitles.forEach((sub, i) => {
            const item = document.createElement('div');
            item.className = 'sub-item';
            item.innerHTML = `
                <span class="sub-time">${fmtTime(sub.start)}</span>
                <input class="sub-text" type="text" value="${escapeHtml(sub.text)}" data-index="${i}">
                <button class="sub-delete" data-index="${i}" title="Remove">&times;</button>
            `;
            subsList.appendChild(item);
        });

        // Edit handlers
        subsList.querySelectorAll('.sub-text').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                subtitles[idx].text = e.target.value;
            });
        });

        // Delete handlers
        subsList.querySelectorAll('.sub-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                subtitles.splice(idx, 1);
                renderSubtitleList();
            });
        });
    }

    // ── Show/hide toggle ─────────────────────────
    showSubsToggle.addEventListener('change', () => {
        if (!showSubsToggle.checked) {
            subtitleOverlay.classList.remove('visible');
        }
    });

    // ── Style buttons ────────────────────────────
    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStyle = btn.dataset.style;
            subtitleOverlay.className = 'subtitle-overlay style-' + currentStyle;
            if (showSubsToggle.checked && subtitleOverlay.textContent) {
                subtitleOverlay.classList.add('visible');
            }
        });
    });

    // ── Color picker ─────────────────────────────
    subsColor.addEventListener('input', () => {
        subtitleOverlay.style.color = subsColor.value;
    });

    // ── Update subtitle overlay on timeupdate ────
    videoPlayer.addEventListener('timeupdate', () => {
        if (!subtitles.length || !showSubsToggle.checked) return;

        const t = videoPlayer.currentTime;
        const active = subtitles.find(s => t >= s.start && t <= s.end);

        if (active) {
            subtitleOverlay.textContent = active.text;
            subtitleOverlay.classList.add('visible');
        } else {
            subtitleOverlay.classList.remove('visible');
        }
    });

    // ── Expose subtitles for generate step ───────
    window.getSubtitles = () => subtitles;
    window.getSubtitleStyle = () => currentStyle;
});

// ── Extract audio from video element ─────────────
async function extractAudio(videoEl) {
    const response = await fetch(videoEl.src);
    const arrayBuffer = await response.arrayBuffer();

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,  // Whisper expects 16kHz
    });

    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const float32 = decoded.getChannelData(0); // mono

    audioCtx.close();
    return float32;
}

// ── Helpers ──────────────────────────────────────
function fmtTime(secs) {
    if (secs == null || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
