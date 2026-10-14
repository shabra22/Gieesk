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

The GSAP licence permits free use in commercial sites and apps, but not in a
product that competes with GSAP (e.g. a visual animation-builder tool).
Read it at the link above if the project's purpose ever changes.

Loaded only by `js/motion.js`, and only in a desktop/mobile browser — never
inside the Android app, and never when the visitor asks for reduced motion.
