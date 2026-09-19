# Android App Links — opening gieesk.com links in the app

Goal: someone taps a shared link on a phone that has the app, and the
app opens on that profile or recipe. No browser, no "open in app" banner.
Someone without the app gets the website, plus the invite in
`js/app-invite.js`.

Everything in the code is done. Two things need you: the signing
fingerprints, and a deploy.

---

## What is already wired

| Piece | Where | What it does |
|---|---|---|
| Intent filter | `android/app/src/main/AndroidManifest.xml` | Declares that this app handles `https://gieesk.com/u/*` and `/recipes/*`, with `autoVerify="true"` |
| Digital asset links | `assetlinks.json` + `.well-known/assetlinks.json` | Proves the app and the domain belong to the same owner |
| Routing rules | `_redirects` | Serves `index.html` for `/u/<username>`, and guarantees the well-known URL resolves |
| Content type | `_headers` | Serves `assetlinks.json` as JSON with a one-hour cache |
| Link handling | `js/deep-links.js` | Turns `/u/<name>`, `#u/<name>` and `/recipes/<id>.html` into the right screen, in the app and on the website |
| Share links | `js/community.js` | Shares now produce `https://gieesk.com/u/<username>?ref=share` |

Verification currently **fails on purpose** — the fingerprints below are
placeholders. Until you replace them, links open in the browser exactly
as they do today. Nothing is broken in the meantime.

---

## Step 1 — get the two fingerprints

**The one that matters in production** comes from Google, not from your
machine, because Play re-signs your app:

> Play Console → your app → **Release → Setup → App signing** →
> **App signing key certificate** → copy the **SHA-256 certificate
> fingerprint**

**The upload key** is the one on your computer. It lets App Links work
in internal testing and in builds you install over USB:

```
keytool -list -v -keystore "C:\path\to\your-upload-key.jks" -alias your-alias
```

(For a debug build it's the debug keystore:
`keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android`)

Both come out as 32 hex pairs — `AB:CD:EF:...`. Keep the colons.

## Step 2 — put them in the file

Open `assetlinks.json` and replace the two placeholders:

```json
"sha256_cert_fingerprints": [
  "AB:CD:...:99",   ← Play app signing
  "12:34:...:FF"    ← your upload key
]
```

Then copy the same file over `.well-known/assetlinks.json` so both
copies match:

```
copy assetlinks.json .well-known\assetlinks.json
```

Listing both keys is normal and safe: it means the app verifies whether
it was installed from Play or straight from your machine.

## Step 3 — deploy and confirm the URL

```
git add -A
git commit -m "Android App Links"
git push
```

Then open `https://gieesk.com/.well-known/assetlinks.json` in a browser.
You must see your JSON, served over HTTPS, no redirect. If it 404s,
Cloudflare skipped the dot-folder — the `_redirects` line covers that,
but check `https://gieesk.com/assetlinks.json` resolves too.

Google's own checker:

```
https://digitalassetlinks.googleapis.com/v1/statements:List?source.web.site=https://gieesk.com&relation=delegate_permission/common.handle_all_urls
```

## Step 4 — rebuild the app

```
node sync-app.js
npx cap sync
```

Then a full **Stop → Run** in Android Studio. The manifest changed, so a
reload isn't enough.

## Step 5 — check it on the phone

Android verifies the domain on install, using the network, so give it a
moment after installing. Then:

```
adb shell am start -a android.intent.action.VIEW -d "https://gieesk.com/u/shab"
```

The app should open on that profile. To see what Android actually thinks:

```
adb shell pm get-app-links com.gieesk.recipes
```

`gieesk.com: verified` is what you want. If it says `legacy_failure` or
`none`, the fingerprint doesn't match what the app was signed with — the
usual cause is using the upload key where Play's app signing key was
needed.

You can also force it on for testing without waiting for verification:

```
adb shell pm set-app-links --package com.gieesk.recipes 0 all
adb shell pm verify-app-links --re-verify com.gieesk.recipes
```

---

## Notes worth knowing

**Only the apex domain is declared.** `autoVerify` covers every host in
the filter, and if one host fails the others can fail with it.
`www.gieesk.com` redirects to the apex rather than serving its own
`assetlinks.json`, so including it would risk the whole verification.
Shares are generated with the apex host, so this costs nothing.

**Only two path prefixes are claimed** — `/u/` and `/recipes/`. The
homepage, the legal pages and everything else stay with the browser.
Claiming `/*` would mean every gieesk.com link anywhere yanked people
into the app, which is how apps earn uninstalls.

**Old shared links still work.** `#u/<username>` is still understood by
`js/deep-links.js`; it just can't open the app, because a fragment never
reaches Android's intent matcher. That's why new shares use `/u/`.

**The invite and App Links do not collide.** If the app is installed the
link never reaches the browser, so the invite is never seen. If it isn't,
Android hands the link to the browser and the invite offers the app.
