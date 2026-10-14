/* ═══════════════════════════════════════════════════════════════════
   GIEESK — Upload screening
   GieesK is for cooking. Nudity and sexual content are not allowed, and
   until now nothing stopped someone choosing such a file: videos, photos
   and profile pictures all went straight into public storage.

   This checks a file ON THE DEVICE, before a single byte is uploaded:

     · a photo or profile picture is looked at once
     · a video is sampled — frames from start to finish — and each frame
       is looked at

   The look is done by an open-source image classifier (NSFWJS, MIT,
   MobileNetV2) running in the browser with TensorFlow.js (Apache-2.0).
   Nothing leaves the phone or computer: the picture is never sent
   anywhere to be checked. Both the library and the model are bundled in
   assets/vendor/ and only downloaded the first time someone picks a file.

   Be honest about what this is: a first line of defence that keeps the
   obvious cases out and tells the person why. Anyone determined can get
   around code that runs on their own device, so the lasting protection is
   on the server — see MODERATION-SETUP.md (hide-on-report, review queue,
   and an optional server-side check) — plus the reporting that already
   exists and the rules in the Terms.

   If the checker cannot start (a very old browser, no WebGL, files
   missing) the upload is allowed and a note is left in the console; a
   cooking app should not stop working because of it.

   Public API (all return a Promise):
     gkModeration.checkImage(file)                      → { ok, message? }
     gkModeration.checkVideo(file, objectUrl, duration) → { ok, message? }
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var here = (document.currentScript && document.currentScript.src) || '';
  var VENDOR = here ? new URL('../assets/vendor/', here).href : 'assets/vendor/';
  var TF_URL = VENDOR + 'tf-4.22.0.min.js';
  var MODEL_URL = VENDOR + 'nsfw/gk-nsfw-model.json';

  // NSFWJS class order: the model's five outputs.
  var CLASSES = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];
  var SIZE = 224;

  /* Thresholds. Cooking photos are full of skin-coloured food (raw
     chicken, hot dogs, peaches), so the bar is deliberately high: it is
     better to let one borderline picture through to be caught by a report
     than to block somebody's dinner. */
  var T = {
    explicit: 0.60,        // Porn + Hentai in one picture
    maybe: 0.30,           // lower explicit score that still counts if…
    maybePlusSexy: 0.85,   // …explicit + Sexy together reach this
    videoCertain: 0.85,    // one frame this explicit blocks a video outright
    videoFrames: 2         // otherwise this many frames must look explicit
  };

  var MESSAGES = {
    image: 'This photo can’t be used. GieesK is for cooking — nudity and sexual content aren’t allowed. Please choose a different photo.',
    video: 'This video can’t be uploaded. GieesK is for cooking — nudity and sexual content aren’t allowed. Please choose a different video.'
  };

  /* ── Loading (once, on demand) ────────────────────────────────── */
  var loading = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function load() {
    if (loading) return loading;
    loading = (window.tf ? Promise.resolve() : loadScript(TF_URL))
      .then(function () { return window.tf.ready(); })
      .then(function () { return window.tf.loadLayersModel(MODEL_URL); })
      .then(function (model) {
        // First prediction compiles shaders; do it now, not on a user's first frame.
        window.tf.tidy(function () { model.predict(window.tf.zeros([1, SIZE, SIZE, 3])); });
        return model;
      })
      .catch(function (err) {
        loading = null;            // allow a retry on the next pick
        throw err;
      });
    return loading;
  }

  /* ── Looking at one picture ───────────────────────────────────── */
  function newCanvas() {
    var c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    return c;
  }

  // Returns { Drawing, Hentai, Neutral, Porn, Sexy } for a 224×224 canvas.
  function classify(model, canvas) {
    if (window.gkModeration && typeof window.gkModeration.__classifier === 'function') {
      return Promise.resolve(window.gkModeration.__classifier(canvas));   // test hook
    }
    var tf = window.tf;
    var out = tf.tidy(function () {
      var x = tf.browser.fromPixels(canvas).toFloat().div(255).reshape([1, SIZE, SIZE, 3]);
      return model.predict(x);
    });
    return out.data().then(function (d) {
      out.dispose();
      var r = {};
      for (var i = 0; i < CLASSES.length; i++) r[CLASSES[i]] = d[i];
      return r;
    });
  }

  function explicitness(s) { return (s.Porn || 0) + (s.Hentai || 0); }

  function looksExplicit(s) {
    var e = explicitness(s);
    return e >= T.explicit || (e >= T.maybe && e + (s.Sexy || 0) >= T.maybePlusSexy);
  }

  // Exposed so the rule can be tested without a model.
  function judgeFrames(frames, kind) {
    if (kind === 'image') return { ok: !(frames.length && looksExplicit(frames[0])) };
    var hits = 0, certain = false;
    frames.forEach(function (s) {
      if (looksExplicit(s)) hits++;
      if (explicitness(s) >= T.videoCertain) certain = true;
    });
    return { ok: !(certain || hits >= T.videoFrames), hits: hits };
  }

  function settle(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
      promise.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
                   function () { if (!done) { done = true; clearTimeout(t); resolve(null); } });
    });
  }

  /* ── Photos ───────────────────────────────────────────────────── */
  function toCanvasFromImageFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var c = newCanvas();
          c.getContext('2d').drawImage(img, 0, 0, SIZE, SIZE);
          resolve(c);
        } catch (e) { reject(e); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  }

  function checkImage(file) {
    if (enabled() === false) return Promise.resolve({ ok: true });
    return load().then(function (model) {
      return toCanvasFromImageFile(file).then(function (canvas) {
        return classify(model, canvas);
      }).then(function (scores) {
        var v = judgeFrames([scores], 'image');
        return v.ok ? { ok: true } : { ok: false, message: MESSAGES.image };
      });
    }).catch(function (err) {
      console.warn('[GieesK] Photo check skipped:', err && err.message);
      return { ok: true, skipped: true };
    });
  }

  /* ── Videos ───────────────────────────────────────────────────── */
  function frameTimes(duration) {
    var n = Math.min(12, Math.max(6, Math.ceil(duration / 10)));
    var times = [];
    for (var i = 0; i < n; i++) times.push(duration * (i + 0.5) / n);
    return times;
  }

  function seekTo(video, t) {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () { cleanup(); resolve(false); }, 5000);
      function cleanup() { clearTimeout(timer); video.removeEventListener('seeked', ok); video.removeEventListener('error', bad); }
      function ok() { cleanup(); resolve(true); }
      function bad() { cleanup(); resolve(false); }
      video.addEventListener('seeked', ok);
      video.addEventListener('error', bad);
      try { video.currentTime = t; } catch (e) { cleanup(); resolve(false); }
    });
  }

  function scanVideo(model, objectUrl, duration) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.preload = 'auto';
      video.setAttribute('playsinline', '');
      video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      var frames = [];
      function finish(err) {
        try { video.removeAttribute('src'); video.load(); } catch (e) { /* ignore */ }
        if (video.parentNode) video.parentNode.removeChild(video);
        if (err) reject(err); else resolve(frames);
      }
      video.addEventListener('error', function () { finish(new Error('Video could not be decoded for checking')); }, { once: true });
      video.addEventListener('loadeddata', function () {
        var times = frameTimes(duration || video.duration || 1);
        var canvas = newCanvas(), ctx = canvas.getContext('2d');
        var chain = Promise.resolve();
        times.forEach(function (t) {
          chain = chain.then(function () {
            return seekTo(video, t).then(function (ok) {
              if (!ok) return null;
              ctx.drawImage(video, 0, 0, SIZE, SIZE);
              return classify(model, canvas).then(function (s) { frames.push(s); });
            });
          });
        });
        chain.then(function () { finish(); }, function (e) { finish(e); });
      }, { once: true });
      document.body.appendChild(video);
      video.src = objectUrl;
    });
  }

  function checkVideo(file, objectUrl, duration) {
    if (enabled() === false) return Promise.resolve({ ok: true });
    var ownUrl = null;
    if (!objectUrl) { ownUrl = URL.createObjectURL(file); objectUrl = ownUrl; }
    return settle(load().then(function (model) {
      return scanVideo(model, objectUrl, duration);
    }), 60000).then(function (frames) {
      if (ownUrl) URL.revokeObjectURL(ownUrl);
      if (!frames || !frames.length) {
        console.warn('[GieesK] Video check skipped: no frames could be read.');
        return { ok: true, skipped: true };
      }
      var v = judgeFrames(frames, 'video');
      return v.ok ? { ok: true } : { ok: false, message: MESSAGES.video };
    }).catch(function (err) {
      if (ownUrl) URL.revokeObjectURL(ownUrl);
      console.warn('[GieesK] Video check skipped:', err && err.message);
      return { ok: true, skipped: true };
    });
  }

  /* Off switch: window.GK_MODERATION = { clientScreen: false } before this loads. */
  function enabled() {
    var c = window.GK_MODERATION;
    return !(c && c.clientScreen === false);
  }

  // Raw class scores for a photo (for testing and tuning).
  function scoreImage(file) {
    return load().then(function (model) {
      return toCanvasFromImageFile(file).then(function (canvas) { return classify(model, canvas); });
    });
  }

  window.gkModeration = {
    scoreImage: scoreImage,
    checkImage: checkImage,
    checkVideo: checkVideo,
    warm: function () { load().catch(function () { /* reported when used */ }); },
    messages: MESSAGES,
    thresholds: T,
    judge: judgeFrames
  };
})();
