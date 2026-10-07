/* ═══════════════════════════════════════════════════════════════
   GieesK — the review step before a video is posted

   What it does: takes a video the person has just picked, lets them cut
   the start and end, choose the frame people see first, and put a line
   of text over it. Then hands back four values.

   What it deliberately does NOT do: re-encode anything. The file is
   uploaded whole and these values travel with the post
   (supabase-video-trim.sql); the player honours them. Real cutting
   needs ffmpeg.wasm (~25MB, minutes per clip on a mid-range phone,
   and it tends to exhaust the WebView's memory) or native Android
   code. Neither is worth it for the outcome, which inside GieesK is
   identical.

   The one honest limitation: a file downloaded or shared outside the
   app is the untrimmed original with no overlay. The planned
   watermarking pass is the right place to apply these — it can read
   the same three columns.

   Used by both upload paths: the Discover video uploader and the video
   slot on Share a Recipe. One sheet, so they can't drift apart.
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Matches community_posts_overlay_len_check, so the database can never
  // be the thing that refuses a post the UI accepted.
  const OVERLAY_MAX = 120;
  // Below this there is nothing to trim, and two handles on a 3-second
  // clip are more frustrating than useful.
  const MIN_WINDOW = 1;

  let sheet = null;
  let state = null;

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function styles() {
    if (document.getElementById('gkReviewStyles')) return;
    const css = document.createElement('style');
    css.id = 'gkReviewStyles';
    css.textContent = `
.vr-sheet {
  position: fixed; inset: 0; z-index: 1800;
  background: #000;
  display: flex; flex-direction: column;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  color: #fff; font-family: inherit;
}
.vr-head {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; flex-shrink: 0;
}
.vr-head h2 { margin: 0; font-size: 16px; font-weight: 700; flex: 1; }
.vr-x, .vr-done {
  border: none; cursor: pointer; font-family: inherit; font-weight: 700;
  border-radius: 999px;
}
.vr-x {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.12); color: #fff; font-size: 17px;
}
.vr-done {
  padding: 9px 18px; font-size: 14px;
  background: var(--gold, #D4A039); color: #0A0A09;
}
.vr-done[disabled] { opacity: 0.5; cursor: not-allowed; }

.vr-stage {
  position: relative; flex: 1; min-height: 0;
  background: #000; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.vr-stage video { width: 100%; height: 100%; object-fit: contain; background: #000; }
/* Shows the overlay exactly where the feed will draw it, so what they
   type is what they get rather than a surprise after posting. */
.vr-overlay-preview {
  position: absolute; left: 0; right: 0; top: 12%;
  padding: 0 24px; text-align: center; pointer-events: none;
}
.vr-overlay-preview span {
  font-family: var(--font-display, Georgia, serif);
  font-size: 22px; font-weight: 700; line-height: 1.25; color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.85), 0 0 18px rgba(0,0,0,0.55);
  overflow-wrap: break-word;
}

.vr-controls { flex-shrink: 0; padding: 12px 16px 18px; display: grid; gap: 14px; }
.vr-readout {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 13px; color: rgba(255,255,255,0.72);
}
.vr-readout strong { font-size: 14px; color: #fff; font-weight: 700; }

/* The timeline. Two handles over a track; the selected span is gold and
   everything outside it is dimmed, so what is being kept is obvious. */
.vr-track {
  position: relative; height: 46px; border-radius: 10px;
  background: rgba(255,255,255,0.10);
  touch-action: none;           /* the handles own the gesture */
  user-select: none;
}
.vr-keep {
  position: absolute; top: 0; bottom: 0;
  background: rgba(212,160,57,0.26);
  border-left: 3px solid var(--gold, #D4A039);
  border-right: 3px solid var(--gold, #D4A039);
}
.vr-handle {
  position: absolute; top: -6px; bottom: -6px; width: 30px;
  margin-left: -15px; cursor: grab;
  display: flex; align-items: center; justify-content: center;
}
.vr-handle::after {
  content: ''; width: 6px; height: 100%;
  border-radius: 3px; background: var(--gold, #D4A039);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.5);
}
.vr-playhead {
  position: absolute; top: 0; bottom: 0; width: 2px;
  background: #fff; opacity: 0.9; pointer-events: none;
}

.vr-field label {
  display: block; font-size: 12px; font-weight: 600;
  color: rgba(255,255,255,0.7); margin-bottom: 6px;
}
.vr-field input[type="text"] {
  width: 100%; box-sizing: border-box;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 10px; padding: 11px 13px;
  font-size: 15px; font-family: inherit; color: #fff; outline: none;
}
.vr-field input[type="text"]:focus { border-color: var(--gold, #D4A039); }
.vr-count { float: right; font-weight: 400; color: rgba(255,255,255,0.45); }
.vr-row { display: flex; gap: 10px; }
.vr-ghost {
  flex: 1; padding: 11px; border-radius: 10px; cursor: pointer;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16);
  color: #fff; font-family: inherit; font-size: 13.5px; font-weight: 600;
}
.vr-hint { font-size: 11.5px; color: rgba(255,255,255,0.45); line-height: 1.45; margin: 0; }`;
    document.head.appendChild(css);
  }

  // ── Opening ──────────────────────────────────────────────────────
  // objectUrl: a local blob/object URL for the picked file.
  // duration:  seconds, already probed by the caller.
  // Resolves with { trimStart, trimEnd, overlayText, coverBlob } or null
  // if the person backed out.
  function open(opts) {
    return new Promise((resolve) => {
      styles();
      close();

      const duration = Number(opts && opts.duration) || 0;
      state = {
        duration: duration,
        start: 0,
        end: duration,
        overlay: String((opts && opts.overlayText) || '').slice(0, OVERLAY_MAX),
        coverBlob: null,
        resolve: resolve,
        // A clip too short to trim still gets the overlay and cover.
        trimmable: duration >= MIN_WINDOW * 2,
      };

      sheet = document.createElement('div');
      sheet.className = 'vr-sheet';
      sheet.id = 'gkVideoReview';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.innerHTML = `
        <div class="vr-head">
          <button type="button" class="vr-x" id="vrCancel" aria-label="Cancel"><i class="ti ti-x"></i></button>
          <h2>Review your video</h2>
          <button type="button" class="vr-done" id="vrDone">Use video</button>
        </div>
        <div class="vr-stage">
          <video id="vrVideo" playsinline muted preload="auto"></video>
          <div class="vr-overlay-preview" id="vrOverlayPreview" ${state.overlay ? '' : 'hidden'}>
            <span>${esc(state.overlay)}</span>
          </div>
        </div>
        <div class="vr-controls">
          ${state.trimmable ? `
          <div>
            <div class="vr-readout">
              <strong id="vrSpan">${fmt(duration)}</strong>
              <span id="vrRange">${fmt(0)} – ${fmt(duration)}</span>
            </div>
            <div class="vr-track" id="vrTrack">
              <div class="vr-keep" id="vrKeep"></div>
              <div class="vr-playhead" id="vrPlayhead" style="left:0"></div>
              <div class="vr-handle" id="vrStartHandle" role="slider" tabindex="0"
                   aria-label="Trim start" style="left:0"></div>
              <div class="vr-handle" id="vrEndHandle" role="slider" tabindex="0"
                   aria-label="Trim end" style="left:100%"></div>
            </div>
          </div>` : '<p class="vr-hint">This clip is too short to trim.</p>'}

          <div class="vr-field">
            <label for="vrOverlay">Text on the video
              <span class="vr-count" id="vrCount">${state.overlay.length}/${OVERLAY_MAX}</span>
            </label>
            <input type="text" id="vrOverlay" maxlength="${OVERLAY_MAX}"
                   placeholder="e.g. Crispy on the outside, soft inside"
                   value="${esc(state.overlay)}" />
          </div>

          <div class="vr-row">
            <button type="button" class="vr-ghost" id="vrCover">
              <i class="ti ti-photo"></i> Use this frame as the cover
            </button>
          </div>
          <p class="vr-hint" id="vrCoverHint">The cover is what people see before it plays.</p>
        </div>`;
      document.body.appendChild(sheet);

      const video = sheet.querySelector('#vrVideo');
      video.src = opts.objectUrl;
      video.loop = false;
      video.play().catch(function () {});

      wire(video);
      // Default cover: a tenth of the way in, since frame zero is very
      // often black.
      video.addEventListener('loadeddata', function () {
        seek(video, Math.min(duration * 0.1, Math.max(0, duration - 0.1)));
        setTimeout(function () { grabCover(video, true); }, 300);
      }, { once: true });
    });
  }

  function seek(video, t) {
    try { video.currentTime = Math.max(0, Math.min(t, state.duration)); } catch (e) {}
  }

  function paint() {
    if (!sheet || !state.trimmable) return;
    const keep = sheet.querySelector('#vrKeep');
    const sh = sheet.querySelector('#vrStartHandle');
    const eh = sheet.querySelector('#vrEndHandle');
    const a = (state.start / state.duration) * 100;
    const b = (state.end / state.duration) * 100;
    if (keep) { keep.style.left = a + '%'; keep.style.width = (b - a) + '%'; }
    if (sh) sh.style.left = a + '%';
    if (eh) eh.style.left = b + '%';
    const span = sheet.querySelector('#vrSpan');
    const range = sheet.querySelector('#vrRange');
    if (span) span.textContent = fmt(state.end - state.start);
    if (range) range.textContent = fmt(state.start) + ' – ' + fmt(state.end);
  }

  function wire(video) {
    const done = sheet.querySelector('#vrDone');
    const cancel = sheet.querySelector('#vrCancel');
    const overlayInput = sheet.querySelector('#vrOverlay');
    const overlayPreview = sheet.querySelector('#vrOverlayPreview');
    const count = sheet.querySelector('#vrCount');
    const track = sheet.querySelector('#vrTrack');
    const playhead = sheet.querySelector('#vrPlayhead');

    cancel.addEventListener('click', function () { finish(null); });
    done.addEventListener('click', function () {
      finish({
        trimStart: state.trimmable && state.start > 0.05 ? Math.round(state.start * 100) / 100 : null,
        trimEnd: state.trimmable && state.end < state.duration - 0.05 ? Math.round(state.end * 100) / 100 : null,
        overlayText: state.overlay.trim() ? state.overlay.trim() : null,
        coverBlob: state.coverBlob,
      });
    });

    overlayInput.addEventListener('input', function () {
      state.overlay = overlayInput.value.slice(0, OVERLAY_MAX);
      if (count) count.textContent = state.overlay.length + '/' + OVERLAY_MAX;
      if (overlayPreview) {
        overlayPreview.hidden = !state.overlay;
        overlayPreview.querySelector('span').textContent = state.overlay;
      }
    });

    sheet.querySelector('#vrCover').addEventListener('click', function () {
      grabCover(video, false);
    });

    // Loop inside the chosen window, so the preview behaves exactly like
    // the feed will.
    video.addEventListener('timeupdate', function () {
      if (video.currentTime >= state.end - 0.05 || video.currentTime < state.start - 0.3) {
        seek(video, state.start);
        video.play().catch(function () {});
      }
      if (playhead && state.duration) {
        playhead.style.left = (video.currentTime / state.duration) * 100 + '%';
      }
    });
    video.addEventListener('click', function () {
      if (video.paused) video.play().catch(function () {}); else video.pause();
    });

    if (!track) return;

    // ── The two handles ────────────────────────────────────────────
    let dragging = null;
    const at = (clientX) => {
      const r = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
      return ratio * state.duration;
    };
    const grab = (which) => (e) => {
      dragging = which;
      e.preventDefault();
      e.stopPropagation();
    };
    const move = (clientX) => {
      if (!dragging) return;
      const t = at(clientX);
      if (dragging === 'start') {
        // Never let the handles cross, and never produce a window the
        // database would reject.
        state.start = Math.min(t, state.end - MIN_WINDOW);
        state.start = Math.max(0, state.start);
        seek(video, state.start);
      } else {
        state.end = Math.max(t, state.start + MIN_WINDOW);
        state.end = Math.min(state.duration, state.end);
        // Show the new out-point rather than leaving the playhead
        // wherever it was — you are choosing where it ends.
        seek(video, Math.max(state.start, state.end - 0.3));
      }
      paint();
    };
    const up = () => {
      if (!dragging) return;
      dragging = null;
      seek(video, state.start);
      video.play().catch(function () {});
    };

    const sh = sheet.querySelector('#vrStartHandle');
    const eh = sheet.querySelector('#vrEndHandle');
    sh.addEventListener('pointerdown', grab('start'));
    eh.addEventListener('pointerdown', grab('end'));
    sheet.addEventListener('pointermove', function (e) { move(e.clientX); });
    sheet.addEventListener('pointerup', up);
    sheet.addEventListener('pointercancel', up);

    // Keyboard, so the handles are not mouse-only.
    const nudge = (which, delta) => {
      if (which === 'start') state.start = Math.max(0, Math.min(state.start + delta, state.end - MIN_WINDOW));
      else state.end = Math.min(state.duration, Math.max(state.end + delta, state.start + MIN_WINDOW));
      paint();
      seek(video, which === 'start' ? state.start : Math.max(state.start, state.end - 0.3));
    };
    sh.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { nudge('start', -0.5); e.preventDefault(); }
      if (e.key === 'ArrowRight') { nudge('start', 0.5); e.preventDefault(); }
    });
    eh.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { nudge('end', -0.5); e.preventDefault(); }
      if (e.key === 'ArrowRight') { nudge('end', 0.5); e.preventDefault(); }
    });

    paint();
  }

  // ── The cover frame ──────────────────────────────────────────────
  function grabCover(video, silent) {
    try {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return;
      const canvas = document.createElement('canvas');
      // Cap the long edge — a 4K frame is a needlessly heavy poster.
      const scale = Math.min(1, 1080 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        if (!blob) return;
        state.coverBlob = blob;
        const hint = sheet && sheet.querySelector('#vrCoverHint');
        if (hint && !silent) hint.textContent = 'Cover set from this frame.';
      }, 'image/jpeg', 0.82);
    } catch (e) {
      // A frame that can't be read (rare, DRM or cross-origin) just
      // means no cover; posting still works.
      console.warn('[GieesK] Could not capture a cover frame:', e);
    }
  }

  function finish(result) {
    const resolve = state && state.resolve;
    const video = sheet && sheet.querySelector('#vrVideo');
    if (video) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {} }
    close();
    const r = state;
    state = null;
    if (resolve) resolve(result);
    return r;
  }

  function close() {
    const existing = document.getElementById('gkVideoReview');
    if (existing) existing.remove();
    sheet = null;
  }

  window.videoReview = {
    open: open,
    isOpen: function () { return !!document.getElementById('gkVideoReview'); },
    // So the hardware back button can dismiss it like any other sheet.
    cancel: function () { if (state) finish(null); },
    OVERLAY_MAX: OVERLAY_MAX,
  };
})();
