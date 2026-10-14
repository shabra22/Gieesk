# Vendored libraries

Files here are third-party code, copied unmodified from their npm packages
so the site loads them from its own domain (no third-party request, and the
Privacy Policy stays accurate). The version is in each file name; to upgrade,
replace the file and update the names in `js/motion.js`.

| File | Library | Version | Licence |
| --- | --- | --- | --- |
| gsap-3.15.0.min.js | GSAP core — https://github.com/greensock/GSAP | 3.15.0 | GreenSock Standard "no charge" licence — https://gsap.com/standard-license |
| ScrollTrigger-3.15.0.min.js | GSAP ScrollTrigger plugin | 3.15.0 | same |
| SplitText-3.15.0.min.js | GSAP SplitText plugin | 3.15.0 | same |
| lenis-1.3.26.min.js | Lenis smooth scroll — https://github.com/darkroomengineering/lenis | 1.3.26 | MIT |
| tf-4.22.0.min.js | TensorFlow.js — https://github.com/tensorflow/tfjs | 4.22.0 | Apache-2.0 |
| nsfw/gk-nsfw-model.json + nsfw/gk-nsfw.bin | NSFWJS MobileNetV2 image classifier — https://github.com/infinitered/nsfwjs (model by Gant Laborde) | 4.3.0 | MIT |

The GSAP licence permits free use in commercial sites and apps, but not in a
product that competes with GSAP (e.g. a visual animation-builder tool).
Read it at the link above if the project's purpose ever changes.

Loaded only by `js/motion.js`, and only in a desktop/mobile browser — never
inside the Android app, and never when the visitor asks for reduced motion.

## Upload screening (`tf-4.22.0.min.js`, `nsfw/`)

Used only by `js/moderation.js`. A photo, profile picture or video is checked
on the person's own device before it is uploaded, and nudity or sexual content
is blocked. Nothing is sent anywhere for the check. The files are fetched the
first time someone picks a file to upload (about 4 MB), not on page load.

The model is the NSFWJS MobileNetV2 model, converted from its npm package
(`nsfwjs/dist/models/mobilenet_v2`) into a plain `model.json` plus one weights
file; the numbers inside are unchanged. If you ever replace it, give the new
files new names, because everything under `assets/` is cached for a year.
