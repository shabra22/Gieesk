# Android App Links — opening gieesk.com links in the app

Goal: someone taps a shared link on a phone that has the app, and the
app opens on that profile or recipe. No browser, no "open in app" banner.
Someone without the app gets the website, plus the invite in
`js/app-invite.js`.

Everything in the code is done, and the debug key's fingerprint is in
place, so this works today on a build installed from Android Studio.
Add Play's app-signing fingerprint when the app is published.

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

Verification is live for the debug key. A link tapped on a phone running
a Play-installed build will keep opening the browser until Play's own
signing fingerprint is added (Step 1) — nothing breaks, it just doesn't
jump into the app yet.

---

## Step 1 — fingerprints

**Done for the debug build.** `assetlinks.json` already carries the
SHA-256 of the debug key on the development machine:

```
EB:30:0F:33:92:22:1A:60:54:D6:8F:0A:FC:0D:A3:5D:89:76:84:7D:F4:2B:64:94:D2:E0:AA:DF:E2:8D:A8:55
```

That makes App Links work for builds installed from Android Studio, on
that machine. It will NOT work for anyone who installs from Play,
because Play re-signs every upload with its own key.

**At publish time**, add two more fingerprints to the array:

1. Play Console → your app → **Release → Setup → App signing** →
   **App signing key certificate** → SHA-256. This is the one that
   matters for real users.
2. Your upload key's SHA-256, once you create an upload keystore
   (there isn't one yet — `android/app/build.gradle` has no
   `signingConfigs` block).

To read a keystore's fingerprint on Windows, where `keytool` isn't on
the PATH:

```
$kt = Get-ChildItem "C:\Program Files\Android","$env:USERPROFILE\.jdks" -Recurse -Filter keytool.exe -ErrorAction SilentlyContinue | Select-Object -First 1
& $kt.FullName -list -v -keystore "PATH\TO\your-key.jks" -alias your-alias | Select-String "SHA256"
```

Listing several fingerprints is normal: the app verifies whichever key
it happens to be signed with.

## Step 2 — keep both copies in step

There are two copies of the same file, and they must match:

```
copy assetlinks.json .well-known\assetlinks.json
```

The root copy exists because Cloudflare Pages can skip dot-folders
depending on how the build is wired. Right now it serves
`/.well-known/` correctly — confirmed live — and the `_redirects` line
covers it either way.

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
