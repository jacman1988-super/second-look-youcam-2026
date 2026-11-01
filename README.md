# Second Look

A local outfit exploration prototype for second-hand shopping: visualize a possible style, compare it with the original photo, then check the details an AI image cannot establish.

**Status:** 51 automated tests pass using controlled provider stubs. Two authorized live-generation attempts failed: one request was rejected and another returned a local error whose cause is unconfirmed. No provider image has been produced, so live generation is **not validated**. The offline walkthrough is a labelled illustration, not a YouCam result. No contest submission or award is claimed here.

## What it does

- Takes two permitted public HTTPS image URLs: a full-body source image and an outfit reference.
- Implements YouCam Clothes VTO `cloth-v4` task creation and result polling through a loopback-only Node server.
- Provides an original/AI comparison slider after a genuine result is available.
- Keeps a practical checklist for measurements, condition, repairs, fabric, seller photos and return terms.
- Downloads decision notes locally without photo URLs.

The preview is a style visualization, **not** a prediction or proof of fit, size, colour, condition or authenticity. There is no body scoring, beauty grading, measured environmental benefit or claimed reduction in returns. Keep the listing photographs and actual measurements as the source of truth.

## Run locally

Use Node.js 20 or newer. There are no third-party dependencies and no installation/build step.

```sh
node server.mjs
```

Open `http://127.0.0.1:4177`. `npm start` runs the same server if npm is available. It binds only to `127.0.0.1`; default mode makes no provider requests. Opening the page, checking status or exploring the offline walkthrough does not create a generation.

Run tests:

```sh
node --test
```

`npm test` is equivalent. Tests cover request validation, disabled live mode, local credential handoff, cross-site/Host guards, task-cap preservation, read-only authentication diagnostics and interrupted browser workflows. Provider responses are stubbed; these tests are not evidence of a successful live generation.

## Optional private key entry

Local key entry is **disabled by default**. Enable it explicitly only after reviewing the provider terms, image permissions and intended test cost. Keep the process cap at one generation.

PowerShell:

```powershell
$env:YOUCAM_ALLOW_LOCAL_CONNECT='yes'
$env:YOUCAM_MAX_TASKS='1'
node server.mjs
```

POSIX shell:

```sh
YOUCAM_ALLOW_LOCAL_CONNECT=yes YOUCAM_MAX_TASKS=1 node server.mjs
```

In the local page, expand **Connect YouCam locally** and paste the key yourself into its password field. Do not send it through chat, an agent, an issue, source code or a screenshot. The field clears after every attempt. Copying spaces and line breaks are removed locally, with an explicit notice; all other key characters are preserved. Pasted Authorization/Bearer headers are identified before cleanup. The resulting key is sent only to this same-origin loopback server and held in server RAM; it is never echoed, logged or written to a file by the app. Stopping the server discards that runtime copy. The server transport guard accepts a nonempty opaque key up to4096characters, preserving all visible ASCII punctuation. It rejects any remaining whitespace, control and non-ASCII characters before constructing the fixed Authorization header, rather than inventing the provider's key alphabet or minimum length. Invalid input produces only a static reason, never the key, a fragment, its length or an offset. Only the explicit read-only provider check can establish authentication; local loading does not verify a credential.

Local HTML, JavaScript and CSS use `Cache-Control: no-store`. The HTML references a versioned script URL so earlier cached credential-form code cannot survive this update.

Loading a key enables the live path but does **not** verify the credential with YouCam, send image URLs, create a task or consume API units. `/api/connect` and `/api/status` make no provider requests. Status returns only safe local state, never the key. A loaded key is not a successful provider test.

For authentication diagnostics without image generation, start the server with `YOUCAM_MAX_TASKS=0`. This zero limit is enforced by both the server and interface. After loading a key, **Verify key (no image generation)** makes one authenticated GET to the documented V2 `/credit/feature-cost` metadata endpoint. It sends no image URLs, creates no task and does not reset the generation cap. The interface receives only authentication status or a bounded diagnostic; no provider body is exposed. One verification attempt is allowed per key load. Successful authentication does not establish a free-unit balance or a working Clothes V4 result.

The existing environment-key route is also supported: securely supply `YOUCAM_API_KEY` to the process and set `YOUCAM_ENABLE_LIVE=yes`. Never hard-code a key. If using that route, manage and remove the secret from your own shell/environment separately; stopping Node does not clear the parent shell.

## One deliberate live test

1. Confirm the applicable provider terms, available allowance and current cost before starting. The app does not check balance or billing settings.
2. Supply two public **HTTPS** image URLs without embedded credentials. Use only images you have permission to share with the provider. This prototype does not upload local files; the provider retrieves those URLs.
3. Confirm the image-permission checkbox, then choose **Preview with YouCam** once.
4. Wait for the task result. Do not create duplicate tasks while one is processing. Use the comparison only after a genuine output appears.
5. Review the real image and the verification checklist; stop the local server when finished.

The default process cap allows **one generation attempt**. Reconnecting or replacing a key does not reset it, and a rejected started request still consumes the local attempt. This is a process guard, not a provider billing guarantee. Do not raise it or restart merely to bypass the limit. Clearing the page or selecting the walkthrough does not cancel a task already started at YouCam or delete provider copies.

## Synthetic test inputs

The planned controlled-test fixtures belong in [assets/youcam-test-2026/](assets/youcam-test-2026/). They are **AI-generated, fictional input images**, not provider output, a real-person photograph or proof of a completed YouCam request. Their presence does not imply that hosting or processing has occurred. Any actual test must use permitted, accessible source/reference URLs.

## Privacy and deployment boundary

**Never publicly deploy this credential-holding server.** Publishing source code is different from exposing a running server. It is a local, single-user prototype, not a production service with accounts, authentication or a credential vault.

Host, Origin and cross-site guards restrict the local API. No key is served to the browser, saved in exports or included in error responses. Photos load only after the relevant user action; decision-note exports contain no image URLs. YouCam has its own processing and retention policies. Clear photos before screenshots and keep all credentials, private codes and authorization material out of the repository and demo.

## AI contribution and licence

OpenAI Codex prepared the concept, interface, code and documentation, with independent agent review and automated tests. YouCam is intended to produce the outfit visualization; no live-result claim is made before an observed provider result. The source licence is [MIT](LICENSE); third-party services remain subject to their own terms.

Official references: [YouCam Clothes VTO API](https://docs.perfectcorp.com/reference/ai_clothes) · [hackathon resources](https://youcam-api-skin-ai-ecommerce.devpost.com/resources).
