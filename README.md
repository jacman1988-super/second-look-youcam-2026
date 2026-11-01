# Second Look

A local outfit exploration prototype for second-hand shopping: compare a possible style with the original image, then check the facts an AI image cannot establish.

**Observed validation:** One real YouCam Clothes V4 `full_body` task completed successfully on 1 November 2026. Its 1024 x 1536 JPEG was saved and visually inspected, and the original/result slider worked. This is one completed example, not an accuracy, fit or reliability benchmark. There is no contest submission or award claim.

**Automated validation:** 54 main tests use controlled provider stubs (23 frontend, 19 diagnostics and 12 server/connection/cache tests). A separate seven-test suite checks the recorded viewer. Stubbed tests do not establish model quality. A real read-only V2 feature-cost request also confirmed authentication separately from image generation.

## What it does

- Takes two permitted public HTTPS image URLs: a full-body source and an outfit reference.
- Implements YouCam Clothes VTO `cloth-v4` task creation and result polling through a loopback-only Node server.
- Displays an actual successful result with an original/AI comparison slider.
- Adds a checklist for actual measurements, condition, repairs, fabric, seller photographs and return terms.
- Downloads decision notes locally without automatically adding photo URLs.

The live app's offline walkthrough remains a labelled illustration. The separate [recorded example](recorded-demo/index.html) displays the genuine saved provider output, clearly labelled as recorded rather than live generation.

Public recorded-result viewer: [Open the recorded demonstration](https://second-look-youcam-jacada-2026.adamekjacek.chatgpt.site).

Public demonstration video: [Watch the Second Look demonstration](https://youtu.be/RwKl4a-7glY).

This is a style visualization, not a prediction or proof of fit, size, colour, fabric, condition, comfort or authenticity. Garment, print and body details may change. No body scoring, beauty grading, measured environmental benefit or reduction in returns is claimed. Keep actual measurements and seller evidence as the source of truth.

## Run the functional local build

Use Node.js 20 or newer. No dependencies, installation or build step is required.

```sh
node server.mjs
```

Open `http://127.0.0.1:4177`. `npm start` runs the same server. It binds only to `127.0.0.1`. Default mode makes no provider requests. Opening the page, reading local status or using the labelled illustration does not create a task.

Main tests:

```sh
node --test app.test.mjs server.test.mjs connect.test.mjs diagnostics.test.mjs
```

Recorded-viewer tests:

```sh
node --test recorded-demo/viewer.test.mjs
```

`node --test` or `npm test` discovers both suites: 61 tests in total. Provider calls in tests are stubbed; test requests target only an ephemeral loopback server or an in-process fixture.

## Human key entry and read-only authentication

Live use requires your own permitted YouCam API key, appropriate image permissions and a suitable allowance. Local credential entry is disabled by default. For read-only authentication diagnostics, explicitly enable it with generation disabled:

PowerShell:

```powershell
$env:YOUCAM_ALLOW_LOCAL_CONNECT='yes'
$env:YOUCAM_MAX_TASKS='0'
node server.mjs
```

POSIX shell:

```sh
YOUCAM_ALLOW_LOCAL_CONNECT=yes YOUCAM_MAX_TASKS=0 node server.mjs
```

Open **Connect YouCam locally** and paste the API key yourself into its password field. Supply only the key, not an Authorization header. Do not send it through chat, an agent, an issue, source files or screenshots. Copy-format whitespace is removed locally with an explicit notice; all other characters are preserved. Nonempty graphic ASCII is accepted up to the local size limit, without inventing a provider key alphabet. Control and non-ASCII characters are rejected after whitespace cleanup.

The field clears immediately and after the attempt. The key goes only to the same-origin loopback server and remains in server RAM. The app never echoes, logs or writes it to a file. Stopping that server discards its runtime copy. Loading it makes no provider request, verifies nothing and does not reset the generation cap.

**Verify key (no image generation)** is a separate explicit action. It makes one GET to the documented V2 `/credit/feature-cost?page_size=20` endpoint, sends no image URLs and creates no image task. The interface receives only authentication status or a bounded static diagnostic. One verification attempt is allowed per key load. Safe verification state survives page reload while the server remains running; no token or upstream body is returned. Authentication does not establish account allowance or a working Clothes V4 result.

An environment-key route is also supported: securely supply `YOUCAM_API_KEY` and `YOUCAM_ENABLE_LIVE=yes` to the process. Never hard-code a key. If you choose that route, manage and remove the secret from your own shell separately; stopping Node does not erase its parent shell.

## Deliberate image generation

For a separately permitted live test, start an explicitly authorized process with `YOUCAM_MAX_TASKS=1` instead of 0. Enter the key privately, confirm the current account allowance, provider cost and permissions, supply the two public HTTPS image links, check consent and press **Preview with YouCam** once. The provider retrieves those links; this prototype does not upload local files.

Wait for the actual result. Do not create duplicate tasks while processing. The default cap allows one started attempt per process; a rejected attempt still consumes it. Reconnecting a key does not reset it. Accepted and completed tasks refresh safe local status, preserving the exhausted cap and the real result. Clear/demo controls do not re-enable generation at cap 0. This is a process guard, not a provider billing guarantee. Do not restart simply to bypass a consumed limit.

Clearing the page or selecting the illustration does not cancel an already started provider task or delete provider copies. YouCam has its own processing and retention rules. The app does not inspect balance, subscriptions or payment settings.

## Saved example and provenance

Open `recorded-demo/index.html` directly with its adjacent assets. It needs no server, credential, account or internet connection. The comparison, checklist and local notes work on unchanged local copies. The source link is an intentional external navigation; the viewer otherwise loads only relative local resources and blocks connections.

The original adult and garment reference in `assets/youcam-test-2026/` are fictional AI-generated inputs, not real customer photographs. The recorded output is the actual saved YouCam Clothes V4 JPEG. No image pixels were edited, cropped, resized or recompressed for packaging; browsers scale them for display. See [safe provenance](recorded-demo/PROVENANCE.txt) for model, date, dimensions and hashes.

The recorded example is supplementary evidence. It does not offer live generation and is not claimed to satisfy contest judging access on its own. Judges receive source, assets and functional local setup instructions; that build requires their own permitted API key and input permissions. Requiring such a key is disclosed, without guaranteeing that this alone fulfils unrestricted judging-access requirements.

## Privacy and deployment boundary

**Do not publicly deploy the credential-holding Node server.** Publishing source is different from exposing a running service. It is a local single-user prototype, not a production account system or credential vault.

Host, Origin and cross-site guards protect local API routes. Local HTML, JavaScript and CSS use `Cache-Control: no-store`, and the script URL is versioned. Errors expose only bounded codes/static categories, never provider messages, keys, headers or signed media URLs. Decision-note exports omit image links. The optional viewer note contains whatever its user types; it stays in page memory until exported or the page closes/reloads.

## AI contribution and licence

OpenAI Codex prepared the concept, interface, code, tests and documentation, with independent agent review. The two synthetic input images were created with OpenAI image generation without a real person's reference image. YouCam Clothes V4 generated the recorded outfit visualization. Source code is [MIT-licensed](LICENSE); third-party services remain subject to their own terms.

Official references: [Clothes VTO API](https://docs.perfectcorp.com/reference/ai_clothes) · [Hackathon rules](https://youcam-api-skin-ai-ecommerce.devpost.com/rules) · [Resources](https://youcam-api-skin-ai-ecommerce.devpost.com/resources).