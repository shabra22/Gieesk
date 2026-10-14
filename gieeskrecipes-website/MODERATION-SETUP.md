# Upload moderation — what is live, and what is waiting for you

GieesK has three layers. Only the first is switched on by the code you ship;
the other two are prepared and **do nothing until you run/deploy them**, so
nothing here touches your unrun SQL or undeployed functions.

| Layer | What it does | Status |
| --- | --- | --- |
| 1. On-device screen (`js/moderation.js`) | Checks every photo, profile picture and video on the person's device before upload and blocks nudity / sexual content | **Live** with the next deploy and app build |
| 2. Reports → automatic hold (`supabase-content-moderation.sql`) | Hides a post when enough different people report it, gives you a review queue | **Waiting** — run the SQL |
| 3. Server-side picture check (`supabase/functions/moderate-media`) | Checks post photos, video covers and profile pictures with Claude after upload | **Waiting** — deploy the function |

## Layer 1 — on-device screen (already in the code)

* Covers: Discover video upload, Share Recipe video, recipe/post photo, profile picture.
* A video is sampled at 6–12 points from start to finish; each frame is classified. One clearly explicit frame, or two frames that look explicit, blocks it.
* A photo is blocked if it is clearly explicit, or explicit and suggestive together. A swimsuit-type photo on its own is **not** blocked (cooking photos are full of skin-coloured food, and false blocks are worse than a miss that a report will catch).
* The person sees: *"This video can't be uploaded. GieesK is for cooking — nudity and sexual content aren't allowed…"* and nothing is uploaded.
* Nothing leaves the device for the check. The model (about 4 MB) is downloaded the first time someone picks a file, then cached.
* **If the checker cannot start** (very old phone, no WebGL, files missing) the upload is allowed and a warning is written to the console. This is deliberate: a cooking app should not stop working because of it.
* **Honest limits.** It is a first line of defence. Anyone technical can bypass code running on their own device, and no classifier is perfect: expect some misses and the odd false block. That is why layers 2 and 3 exist.
* Tuning: the numbers are in `T` at the top of `js/moderation.js`. To switch the screen off in an emergency, add `<script>window.GK_MODERATION = { clientScreen: false };</script>` before the scripts in `index.html`.

The upload screens and the Terms (Section 4, "What you may not upload" and "How this is enforced") now state the rules. Keep that text true: if you add layer 3, see "Privacy policy" below.

## Layer 2 — hide on report (run when ready)

1. Supabase → SQL Editor → paste `supabase-content-moderation.sql` → Run. Safe to run twice.
2. What it does: when **2 different people** report a post for *Sexual content* (3 for *Dangerous content*, 5 for anything else), the post is put on hold: hidden from every feed, and its author can't put it back. A comment report never holds the whole post.
3. Review: `select * from moderation_queue;`
   * It was fine → `select moderation_restore(123);`
   * Remove it → `select moderation_remove(123);` then delete the file in Storage (`cooking-videos` / `post-images`).
   * Hold something by hand → `select moderation_hold_post(123, 'reason');`
   * History → `select * from moderation_log order by id desc;`
4. No app change is needed. A held post simply turns into a draft, which every existing feed already hides.

Tested against a scratch Postgres: reporting by one person many times counts once; two people hold it; the author cannot re-publish or clear the hold; the functions only work from the SQL editor / service role.

## Layer 3 — server-side picture check (deploy when ready)

1. Deploy: `supabase functions deploy moderate-media --no-verify-jwt`
2. Secrets (the Anthropic key is already set for AI Chef):
   `supabase secrets set MODERATION_WEBHOOK_SECRET=<a long random string>`
   Optional: `MODERATION_MODEL=claude-haiku-4-5` (default; cheap and quick).
3. Supabase → Database → Webhooks → create two webhooks that call the function URL with header `x-webhook-secret: <the same string>`:
   * table `community_posts`, events Insert + Update
   * table `profiles`, events Update
4. Run layer 2's SQL first: a flagged post is held using its columns and `moderation_log`.
5. What it does: fetches the post photo / video cover / new avatar from your own storage, asks Claude for a verdict, and holds the post (or clears the avatar) if it is explicit, sexualises a minor, or shows graphic violence. "Suggestive" is left to reports. If anything fails it leaves the upload alone.
6. Cost: one small image call per new picture.

**Videos.** Edge Functions can't decode video, so this checks the video's *cover* only. To analyse whole videos you need a video-analysis service (for example Google Cloud Video Intelligence "explicit content detection", AWS Rekognition Video, or Sightengine). Say when you want that and I'll wire one in the same way.

**Privacy policy — do this when you deploy layer 3.** Pictures are then sent to Anthropic for the check. Add a line to the Privacy Policy (in `index.html` `#page-privacy` and `privacy.html`) such as: *"To keep GieesK safe, photos and video covers you upload may be checked automatically by an AI service (Anthropic) for nudity and graphic violence. They are not used to train models."* Confirm the "not used to train" wording against Anthropic's current commercial terms before publishing.

## Things this does not cover (worth knowing)

* **Illegal content / child safety.** If you ever receive child sexual abuse material, don't forward or keep copies yourself — report it to the authorities (in Kenya, the DCI / Communications Authority; internationally, the NCMEC CyberTipline or your local hotline) and remove it from public view. Get a lawyer's view on your obligations under Kenyan law; I'm not a lawyer.
* **Google Play's user-generated-content policy** expects: a way to report content (you have it), a way to **block abusive users** (you don't have it yet), content rules in the Terms (now added), and a way to act on reports promptly. A *Block user* button is the gap to close before a Play review — say the word and I'll build it.
* **Text.** Captions, comments and usernames aren't screened; reports and the Terms cover them.
* **Video overlay text and thumbnails** chosen in the editor are not scanned beyond the frames sampled.
