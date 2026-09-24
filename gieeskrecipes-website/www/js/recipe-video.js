/* ═══════════════════════════════════════════════════════════════
   GieesK — the video slot on "Share a Recipe"

   Why this exists: a recipe and a video of that recipe were two
   unconnected things. You could share a recipe (photo only) in
   Community, or post a video in Discover and optionally link it to one
   of the site's built-in recipes — but a recipe you wrote yourself
   could never have a video, and a video of your own cooking could never
   point at your own recipe.

   Now the recipe form takes a video next to the photo, and one Share
   writes ONE row that is both: it shows in the Community feed as a
   recipe and in Discover as a video, each linked to the other. No new
   table — community_posts already has video_url and poster_url, and
   Discover is simply "the posts that have a video".

   This deliberately does NOT reuse the `vu` state from the Discover
   uploader. That object is wired to the video modal's own DOM ids and
   its own lifecycle; sharing it would mean two screens fighting over
   one upload. The limits, the probe, the bucket and the XHR pattern are
   the same, so behaviour matches — the state is separate.

   Loads after community.js, which owns MAX_VIDEO_SECONDS, vuProbe(),
   vuFormatBytes(), vuFormatDuration(), releaseVideo() and
   VIDEO_BLANK_POSTER.
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Fall back to the same numbers if community.js ever stops exporting
  // them, so a load-order change degrades instead of throwing.
  const MAX_SEC = typeof MAX_VIDEO_SECONDS === 'number' ? MAX_VIDEO_SECONDS : 180;
  const MIN_SEC = typeof MIN_VIDEO_SECONDS === 'number' ? MIN_VIDEO_SECONDS : 2;
  const MAX_BYTES = typeof MAX_VIDEO_BYTES === 'number' ? MAX_VIDEO_BYTES : 150 * 1024 * 1024;
  const EXTS = typeof VIDEO_EXTENSIONS !== 'undefined' ? VIDEO_EXTENSIONS
    : ['mp4', 'mov', 'm4v', 'webm', '3gp', 'mkv'];
  const BLANK = typeof VIDEO_BLANK_POSTER === 'string' ? VIDEO_BLANK_POSTER
    : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const rv = {
    file: null,
    objectUrl: null,
    duration: 0,
    xhr: null,
    attempt: 0,
    path: null,      // storage path, so an abandoned upload can be removed
    url: null,       // public URL once uploaded
    status: 'empty', // empty | uploading | uploaded | cancelled | error
    progress: 0,
    coverBlob: null,
  };

  const el = (id) => document.getElementById(id);

  function bytes(n) {
    return typeof vuFormatBytes === 'function' ? vuFormatBytes(n)
      : (n / 1048576).toFixed(1) + ' MB';
  }
  function duration(s) {
    if (typeof vuFormatDuration === 'function') return vuFormatDuration(s);
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.round(s % 60)).padStart(2, '0');
  }
  function drop(video) {
    if (typeof releaseVideo === 'function') { releaseVideo(video); return; }
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
  }

  function error(text) {
    const box = el('rvError');
    if (!box) return;
    box.textContent = text || '';
    box.hidden = !text;
  }
  function status(text) {
    const s = el('rvStatus');
    if (s) s.textContent = text || '';
  }

  // ── What the slot looks like right now ───────────────────────────
  function paint() {
    const tile = el('rvTile');
    const panel = el('rvPanel');
    const fill = el('rvProgressFill');
    const placeholder = el('rvPlaceholder');
    if (!tile) return;

    const chosen = !!rv.file;
    if (placeholder) placeholder.hidden = chosen;
    if (panel) panel.hidden = !chosen;
    tile.classList.toggle('has-video', chosen);

    if (fill) fill.style.width = Math.round(rv.progress * 100) + '%';
    const prog = el('rvProgress');
    if (prog) prog.hidden = rv.status !== 'uploading';

    const cancel = el('rvCancelBtn');
    const retry = el('rvRetryBtn');
    const remove = el('rvRemoveBtn');
    if (cancel) cancel.hidden = rv.status !== 'uploading';
    if (retry) retry.hidden = !(rv.status === 'error' || rv.status === 'cancelled');
    if (remove) remove.hidden = !chosen || rv.status === 'uploading';

    if (rv.status === 'uploading') status(`Uploading… ${Math.round(rv.progress * 100)}%`);
    else if (rv.status === 'uploaded') status('Video ready');
    else if (rv.status === 'cancelled') status('Upload cancelled');
    else if (rv.status === 'error') status('');
    else status('');

    // Share Recipe stays tappable, but says why it is waiting.
    const submit = el('uploadSubmitBtn');
    if (submit && !submit.dataset.posting) {
      submit.innerHTML = rv.status === 'uploading'
        ? '<i class="ti ti-loader"></i> Video uploading…'
        : '<i class="ti ti-send"></i> Share Recipe';
    }
  }

  function choose() {
    if (!currentUser) { if (typeof openAuthModal === 'function') openAuthModal('login'); return; }
    el('rvInput')?.click();
  }

  async function handle(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    error('');

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    // Android pickers often report an empty MIME type, so the extension
    // is the second opinion.
    const looksVideo = (file.type && file.type.startsWith('video/')) || EXTS.includes(ext);
    if (!looksVideo) { error('That file isn’t a video. Please choose an MP4 or MOV.'); return; }
    if (file.size > MAX_BYTES) {
      error(`That video is ${bytes(file.size)}. The limit is 150 MB — try a shorter clip.`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    status('Checking video…');
    const info = typeof vuProbe === 'function'
      ? await vuProbe(file, objectUrl)
      : { duration: 0, unreadable: true };

    if (info.unreadable || !info.duration) {
      URL.revokeObjectURL(objectUrl); status('');
      error('This video can’t be played on this device. If it was recorded in HEVC/H.265, re-export it as MP4 (H.264) and try again.');
      return;
    }
    if (info.duration > MAX_SEC + 0.5) {
      URL.revokeObjectURL(objectUrl); status('');
      error(`That video is ${duration(info.duration)} long. Videos can be up to 3 minutes.`);
      return;
    }
    if (info.duration < MIN_SEC) {
      URL.revokeObjectURL(objectUrl); status('');
      error('That video is too short. Please choose one at least 2 seconds long.');
      return;
    }

    // Only replace the previous pick once this one has passed, so a bad
    // file never discards a good video already chosen.
    reset({ deleteUploaded: true });
    rv.file = file;
    rv.objectUrl = objectUrl;
    rv.duration = info.duration;

    const preview = el('rvPreview');
    if (preview) {
      preview.poster = BLANK;
      preview.src = objectUrl;
      // A frame a tenth of the way in is almost always more useful than
      // the first frame, which is often black.
      preview.addEventListener('loadeddata', () => cover(Math.min(1, info.duration * 0.1)), { once: true });
    }
    const meta = el('rvMeta');
    if (meta) meta.textContent = `${duration(info.duration)} · ${bytes(file.size)}`;

    upload();
  }

  // ── Upload ───────────────────────────────────────────────────────
  async function upload() {
    const sb = getSupabase();
    if (!rv.file || !sb || !currentUser) return;
    error('');

    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      rv.status = 'error';
      error('Your session has expired. Please sign in again.');
      paint();
      return;
    }

    const attempt = ++rv.attempt;
    const extRaw = (rv.file.name.split('.').pop() || '').toLowerCase();
    const ext = EXTS.includes(extRaw) ? extRaw : 'mp4';
    const path = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    rv.status = 'uploading';
    rv.progress = 0;
    rv.path = null;
    rv.url = null;
    paint();

    // XHR rather than supabase-js, for real progress and a real cancel —
    // the same endpoint and headers supabase-js would use.
    const xhr = new XMLHttpRequest();
    rv.xhr = xhr;
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/cooking-videos/${path.split('/').map(encodeURIComponent).join('/')}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.setRequestHeader('Content-Type', rv.file.type || (ext === 'mov' ? 'video/quicktime' : 'video/mp4'));

    xhr.upload.onprogress = (e) => {
      if (attempt !== rv.attempt || !e.lengthComputable) return;
      rv.progress = e.loaded / e.total;
      paint();
    };
    xhr.onload = () => {
      if (attempt !== rv.attempt) return;
      rv.xhr = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        rv.status = 'uploaded';
        rv.progress = 1;
        rv.path = path;
        rv.url = sb.storage.from('cooking-videos').getPublicUrl(path).data.publicUrl;
        paint();
        return;
      }
      let msg = '';
      try { const b = JSON.parse(xhr.responseText); msg = b.message || b.error || ''; } catch (e) {}
      console.error('[GieesK] Recipe video upload failed:', xhr.status, msg || xhr.responseText);
      rv.status = 'error';
      if (xhr.status === 413 || /too large|exceeded the maximum/i.test(msg)) {
        error('This video is larger than the upload limit. Try a shorter or smaller video.');
      } else if (xhr.status === 401 || xhr.status === 403) {
        error('You don’t have permission to upload right now. Try signing out and back in.');
      } else {
        error(`Upload failed${msg ? `: ${msg}` : ''}. Tap Retry.`);
      }
      paint();
    };
    xhr.onerror = () => {
      if (attempt !== rv.attempt) return;
      rv.xhr = null;
      rv.status = 'error';
      error('Upload interrupted. Check your connection and tap Retry.');
      paint();
    };
    xhr.onabort = () => {
      if (attempt !== rv.attempt) return;
      rv.xhr = null;
      rv.status = 'cancelled';
      paint();
    };
    xhr.send(rv.file);
  }

  function cancel() {
    if (rv.xhr) { try { rv.xhr.abort(); } catch (e) {} }
  }
  function retry() {
    if (rv.file) upload();
  }

  // ── Cover frame ──────────────────────────────────────────────────
  // Without one, Android shows its grey play graphic until the video
  // has buffered — which is what every video in Discover used to do.
  function cover(seconds) {
    const preview = el('rvPreview');
    if (!preview || !isFinite(seconds)) return;
    const grab = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = preview.videoWidth, h = preview.videoHeight;
        if (!w || !h) return;
        // Cap the long edge: a 4K frame is a needlessly large poster.
        const scale = Math.min(1, 1080 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d').drawImage(preview, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { if (blob) rv.coverBlob = blob; }, 'image/jpeg', 0.82);
      } catch (e) {
        // A cross-origin or DRM frame can't be read; posting still works.
        console.warn('[GieesK] Could not capture a cover frame:', e);
      }
    };
    if (Math.abs(preview.currentTime - seconds) < 0.05) { grab(); return; }
    preview.addEventListener('seeked', grab, { once: true });
    try { preview.currentTime = seconds; } catch (e) { grab(); }
  }

  async function uploadCover() {
    if (!rv.coverBlob || !currentUser) return null;
    const sb = getSupabase();
    if (!sb) return null;
    const path = `${currentUser.id}/video-covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error: e } = await sb.storage.from('post-images').upload(path, rv.coverBlob, {
      cacheControl: '31536000',
      contentType: 'image/jpeg',
    });
    if (e) { console.warn('[GieesK] Cover upload failed; posting without one:', e); return null; }
    return sb.storage.from('post-images').getPublicUrl(path).data.publicUrl;
  }

  // ── Reset ────────────────────────────────────────────────────────
  // deleteUploaded removes the file from storage. Called when the form
  // is abandoned, so a cancelled recipe doesn't leave an orphaned video
  // paid for by the bucket forever.
  function reset(opts) {
    opts = opts || {};
    cancel();
    if (opts.deleteUploaded && rv.path) {
      const sb = getSupabase();
      if (sb) {
        sb.storage.from('cooking-videos').remove([rv.path])
          .then(({ error: e }) => { if (e) console.warn('[GieesK] Could not remove the unused video:', e); });
      }
    }
    if (rv.objectUrl) { try { URL.revokeObjectURL(rv.objectUrl); } catch (e) {} }
    const preview = el('rvPreview');
    if (preview) drop(preview);

    rv.file = null; rv.objectUrl = null; rv.duration = 0;
    rv.xhr = null; rv.path = null; rv.url = null;
    rv.status = 'empty'; rv.progress = 0; rv.coverBlob = null;
    error(''); status('');
    paint();
  }

  function removeVideo() { reset({ deleteUploaded: true }); }

  // ── What community.js uses ───────────────────────────────────────
  window.recipeVideo = {
    // Blocks Share while bytes are still moving, so a post can't be
    // written with a video_url that isn't there yet.
    isUploading: () => rv.status === 'uploading',
    hasVideo: () => !!rv.url && rv.status === 'uploaded',
    // A chosen video that failed or was cancelled: worth saying so
    // rather than silently posting the recipe without it.
    isUnfinished: () => !!rv.file && rv.status !== 'uploaded',
    url: () => (rv.status === 'uploaded' ? rv.url : null),
    uploadCover,
    reset,
    // Keeps the file when the post succeeded — it is referenced now.
    keep: () => { rv.path = null; reset({ deleteUploaded: false }); },
  };

  // Inline handlers in the markup.
  window.rvChooseFile = choose;
  window.rvHandleFile = handle;
  window.rvCancelUpload = cancel;
  window.rvRetryUpload = retry;
  window.rvRemoveVideo = removeVideo;
})();
