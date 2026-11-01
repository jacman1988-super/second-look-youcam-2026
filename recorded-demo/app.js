'use strict';

const checkNames = Object.freeze([
  'Actual garment measurements checked',
  'Condition, repairs, fabric and care checked',
  'Seller photographs, colour, price and return terms checked'
]);

function normalizePercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 50;
}

function makeNotes(checked, note, date) {
  const lines = checkNames.map((name, index) => `${checked[index] ? '[x]' : '[ ]'} ${name}`);
  const userNote = String(note ?? '').slice(0, 4000).trim();
  return [
    'SECOND LOOK — DECISION NOTES',
    date.toISOString().slice(0, 10),
    '',
    'Recorded YouCam Clothes V4 result, not live generation.',
    'Recorded example: 1 November 2026. Original input: AI-generated fictional adult.',
    '',
    ...lines,
    '',
    'MY NEXT STEP',
    userNote || '(No additional note.)',
    '',
    'AI visualization is not proof of fit, size, colour, fabric, condition or authenticity.',
    'Verify actual measurements and seller evidence before buying.',
    'No photo URLs are added automatically. This file was created locally.',
    ''
  ].join('\n');
}

function initializeViewer(document, platform) {
  const byId = id => document.getElementById(id);
  const range = byId('compare');
  const stage = byId('imageStage');
  const viewButtons = [...document.querySelectorAll('[data-reveal]')];
  const images = [byId('original'), byId('result')];
  const checks = [...document.querySelectorAll('[name="buying-check"]')];
  let assetFailed = images.some(image => image.complete && image.naturalWidth === 0);

  function reveal(value) {
    const percent = normalizePercent(value);
    stage.style.setProperty('--reveal', `${percent}%`);
    range.value = String(percent);
    range.setAttribute('aria-valuetext', `${percent}% recorded result revealed`);
    byId('revealValue').textContent = `${percent}% result`;
    byId('compareDivider').hidden = percent === 0 || percent === 100;
    byId('resultBadge').hidden = percent === 0;
    byId('originalBadge').hidden = percent === 100;
    for (const button of viewButtons) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.reveal) === percent));
    }
  }

  function imageState() {
    const ready = !assetFailed && images.every(img => img.complete && img.naturalWidth > 0);
    range.disabled = !ready;
    for (const button of viewButtons) button.disabled = !ready;
    if (ready) byId('imageStatus').textContent = 'Both local images are ready. No generation is running.';
    if (assetFailed) {
      stage.classList.add('asset-error');
      byId('imageStatus').textContent = 'An image file could not be opened. Keep the assets folder beside index.html, then reopen the page. No generation was requested.';
    }
  }

  for (const image of images) {
    image.addEventListener('load', imageState);
    image.addEventListener('error', () => {
      assetFailed = true;
      imageState();
    });
  }
  range.addEventListener('input', () => reveal(range.value));
  for (const button of viewButtons) button.addEventListener('click', () => reveal(button.dataset.reveal));

  function updateChecks() {
    const count = checks.filter(check => check.checked).length;
    byId('checkCount').textContent = `${count} / ${checkNames.length} checks complete`;
    byId('checkMessage').textContent = count === checkNames.length
      ? 'Questions checked. Make the choice that works for you.'
      : 'Keep the listing photographs as your source of truth.';
  }
  for (const check of checks) check.addEventListener('change', updateChecks);

  byId('export').addEventListener('click', () => {
    const status = byId('exportStatus');
    let url;
    let link;
    try {
      const text = makeNotes(checks.map(check => check.checked), byId('notes').value, new platform.Date());
      url = platform.URL.createObjectURL(new platform.Blob([text], { type: 'text/plain;charset=utf-8' }));
      link = document.createElement('a');
      link.href = url;
      link.download = 'second-look-decision-notes.txt';
      document.body.append(link);
      link.click();
      status.textContent = 'Note download requested. Check your browser’s downloads.';
    } catch {
      status.textContent = 'This browser could not start a download. You can copy your note from the text box.';
    } finally {
      if (link) link.remove();
      if (url) platform.setTimeout(() => platform.URL.revokeObjectURL(url), 1000);
    }
  });

  reveal(range.value);
  updateChecks();
  imageState();
}

if (typeof document !== 'undefined') initializeViewer(document, globalThis);
