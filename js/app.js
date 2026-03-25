// ── State ────────────────────────────────────────
let videoFile = null;
let videoDuration = 0;
let draggingHandle = null;

// ── DOM refs ─────────────────────────────────────
const $ = (s) => document.querySelector(s);
const uploadZone   = $('#uploadZone');
const fileInput    = $('#fileInput');
const stepUpload   = $('#stepUpload');
const stepEdit     = $('#stepEdit');
const videoPlayer  = $('#videoPlayer');
const playPauseBtn = $('#playPauseBtn');
const playIcon     = $('#playIcon');
const pauseIcon    = $('#pauseIcon');
const timeDisplay  = $('#timeDisplay');
const videoMeta    = $('#videoMeta');
const timeline     = $('#timeline');
const timelineSel  = $('#timelineSelection');
const handleStart  = $('#handleStart');
const handleEnd    = $('#handleEnd');
const playhead     = $('#timelinePlayhead');
const labelStart   = $('#labelStart');
const labelEnd     = $('#labelEnd');
const labelClip    = $('#labelClip');
const startInput   = $('#startTime');
const endInput     = $('#endTime');
const setStartBtn  = $('#setStart');
const setEndBtn    = $('#setEnd');
const generateBtn  = $('#generateBtn');
const progressBar  = $('#progressBar');
const progressLabel= $('#progressLabel');
const results      = $('#results');
const resultsGrid  = $('#resultsGrid');
const newVideoBtn  = $('#newVideoBtn');

// ── Upload ───────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) loadVideo(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) loadVideo(fileInput.files[0]);
});

function loadVideo(file) {
    if (!file.type.startsWith('video/')) {
        alert('Please select a video file.');
        return;
    }
    videoFile = file;
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;

    videoPlayer.addEventListener('loadedmetadata', function onMeta() {
        videoPlayer.removeEventListener('loadedmetadata', onMeta);
        videoDuration = videoPlayer.duration;

        const w = videoPlayer.videoWidth;
        const h = videoPlayer.videoHeight;
        videoMeta.textContent = `${w}x${h}`;

        startInput.value = 0;
        startInput.max = videoDuration;
        endInput.value = Math.min(videoDuration, 60).toFixed(1);
        endInput.max = videoDuration;

        stepUpload.classList.add('hidden');
        stepEdit.classList.remove('hidden');
        updateUI();
    });
}

// ── Playback ─────────────────────────────────────
playPauseBtn.addEventListener('click', () => {
    if (videoPlayer.paused) {
        videoPlayer.play();
    } else {
        videoPlayer.pause();
    }
});

videoPlayer.addEventListener('play', () => {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
});

videoPlayer.addEventListener('pause', () => {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
});

videoPlayer.addEventListener('timeupdate', () => {
    const cur = videoPlayer.currentTime;
    timeDisplay.textContent = `${fmt(cur)} / ${fmt(videoDuration)}`;

    // Move playhead
    if (videoDuration > 0) {
        const pct = (cur / videoDuration) * 100;
        playhead.style.left = pct + '%';
    }
});

// ── Timeline interaction ─────────────────────────
timeline.addEventListener('click', (e) => {
    if (draggingHandle) return;
    const rect = timeline.getBoundingClientRect();
    const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    videoPlayer.currentTime = pct * videoDuration;
});

// Handle dragging
function initHandleDrag(handleEl, inputEl) {
    handleEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        draggingHandle = { el: handleEl, input: inputEl };
        handleEl.classList.add('dragging');
    });
}

initHandleDrag(handleStart, startInput);
initHandleDrag(handleEnd, endInput);

document.addEventListener('mousemove', (e) => {
    if (!draggingHandle) return;
    const rect = timeline.getBoundingClientRect();
    const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const time = pct * videoDuration;
    draggingHandle.input.value = time.toFixed(1);
    videoPlayer.currentTime = time;
    updateUI();
});

document.addEventListener('mouseup', () => {
    if (draggingHandle) {
        draggingHandle.el.classList.remove('dragging');
        draggingHandle = null;
    }
});

// Touch support for handles
function initHandleTouch(handleEl, inputEl) {
    handleEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        draggingHandle = { el: handleEl, input: inputEl };
        handleEl.classList.add('dragging');
    }, { passive: false });
}

initHandleTouch(handleStart, startInput);
initHandleTouch(handleEnd, endInput);

document.addEventListener('touchmove', (e) => {
    if (!draggingHandle) return;
    const rect = timeline.getBoundingClientRect();
    const touch = e.touches[0];
    const pct = clamp((touch.clientX - rect.left) / rect.width, 0, 1);
    const time = pct * videoDuration;
    draggingHandle.input.value = time.toFixed(1);
    videoPlayer.currentTime = time;
    updateUI();
}, { passive: false });

document.addEventListener('touchend', () => {
    if (draggingHandle) {
        draggingHandle.el.classList.remove('dragging');
        draggingHandle = null;
    }
});

// ── Trim inputs ──────────────────────────────────
startInput.addEventListener('input', updateUI);
endInput.addEventListener('input', updateUI);

setStartBtn.addEventListener('click', () => {
    startInput.value = videoPlayer.currentTime.toFixed(1);
    updateUI();
});

setEndBtn.addEventListener('click', () => {
    endInput.value = videoPlayer.currentTime.toFixed(1);
    updateUI();
});

// ── Platform toggles ─────────────────────────────
document.querySelectorAll('.platform').forEach(el => {
    el.addEventListener('click', () => {
        setTimeout(() => {
            const cb = el.querySelector('input');
            el.classList.toggle('selected', cb.checked);
        }, 0);
    });
});

// ── Generate ─────────────────────────────────────
generateBtn.addEventListener('click', async () => {
    const platforms = [...document.querySelectorAll('.platform input:checked')].map(cb => cb.value);

    if (!platforms.length) {
        alert('Select at least one platform.');
        return;
    }

    const start = parseFloat(startInput.value);
    const end = parseFloat(endInput.value);

    if (end <= start) {
        alert('End time must be after start time.');
        return;
    }

    generateBtn.disabled = true;
    progressBar.classList.remove('hidden');
    progressLabel.textContent = `Processing ${platforms.length} short(s)...`;
    results.classList.add('hidden');

    // Try backend first, fall back to placeholder
    try {
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('start', start);
        formData.append('end', end);
        formData.append('platforms', JSON.stringify(platforms));

        const res = await fetch('/api/generate', { method: 'POST', body: formData });

        if (res.ok) {
            const data = await res.json();
            showResults(data.results);
        } else {
            throw new Error('Backend not available');
        }
    } catch {
        // No backend — show preview clips using the browser
        await simulateProcessing(platforms, start, end);
    }

    generateBtn.disabled = false;
    progressBar.classList.add('hidden');
});

async function simulateProcessing(platforms, start, end) {
    // Simulate a processing delay
    await new Promise(r => setTimeout(r, 1500));

    const presets = {
        tiktok:  { label: 'TikTok',          maxDur: 180 },
        reels:   { label: 'Instagram Reels',  maxDur: 90 },
        shorts:  { label: 'YouTube Shorts',   maxDur: 60 },
        twitter: { label: 'Twitter / X',      maxDur: 140 },
    };

    const items = platforms.map(p => {
        const preset = presets[p];
        const dur = Math.min(end - start, preset.maxDur);
        return {
            platform: p,
            label: preset.label,
            duration: dur.toFixed(1),
            videoSrc: videoPlayer.src,
            start: start,
        };
    });

    showResults(items);
}

function showResults(items) {
    resultsGrid.innerHTML = '';

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'result-card';

        if (item.error) {
            card.innerHTML = `
                <div class="result-body">
                    <h4>${item.label}</h4>
                    <p class="result-error">${item.error}</p>
                </div>`;
        } else {
            const videoSrc = item.url || item.videoSrc;
            const startTime = item.start || 0;
            card.innerHTML = `
                <video src="${videoSrc}#t=${startTime}" controls playsinline muted></video>
                <div class="result-body">
                    <h4>${item.label}</h4>
                    <p style="font-size:.8rem;color:var(--text-dim);margin-bottom:8px">${item.duration || ''}s &middot; 1080x1920</p>
                    ${item.url
                        ? `<a href="${item.url}" class="btn-download" download>Download</a>`
                        : `<span style="font-size:.78rem;color:var(--text-dim)">Connect backend to enable download</span>`
                    }
                </div>`;
        }
        resultsGrid.appendChild(card);
    });

    results.classList.remove('hidden');
    newVideoBtn.classList.remove('hidden');
    results.scrollIntoView({ behavior: 'smooth' });
}

newVideoBtn.addEventListener('click', () => location.reload());

// ── Helpers ──────────────────────────────────────
function updateUI() {
    if (!videoDuration) return;

    const s = clamp(parseFloat(startInput.value) || 0, 0, videoDuration);
    const e = clamp(parseFloat(endInput.value) || 0, 0, videoDuration);
    const dur = Math.max(0, e - s);

    // Timeline selection
    const sp = (s / videoDuration) * 100;
    const ep = (e / videoDuration) * 100;
    timelineSel.style.left = sp + '%';
    timelineSel.style.width = (ep - sp) + '%';

    // Handles
    handleStart.style.left = `calc(${sp}% - 5px)`;
    handleEnd.style.left = `calc(${ep}% - 5px)`;

    // Labels
    labelStart.textContent = fmt(s);
    labelEnd.textContent = fmt(e);
    labelClip.textContent = `${dur.toFixed(1)}s selected`;
}

function fmt(secs) {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
}
