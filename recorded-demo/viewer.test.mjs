import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const read = file => readFileSync(resolve(root, file), 'utf8');
const source = read('app.js');
const html = read('index.html');
const context = vm.createContext({});
const { makeNotes, normalizePercent, initializeViewer } = vm.runInContext(
  `${source}\n;({ makeNotes, normalizePercent, initializeViewer });`, context
);

class Element {
  constructor() {
    this.listeners = new Map(); this.attributes = new Map(); this.dataset = {};
    this.value = ''; this.checked = false; this.disabled = false; this.hidden = false;
    this.complete = true; this.naturalWidth = 1024; this.textContent = '';
    this.styles = new Map(); this.classes = new Set();
    this.style = { setProperty: (key, value) => this.styles.set(key, value) };
    this.classList = { add: value => this.classes.add(value) };
  }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  emit(name) { this.listeners.get(name)?.(); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  click() { this.clicked = true; this.emit('click'); }
  remove() { this.removed = true; }
}

function fixture({ loading = false, broken = false, downloadFails = false } = {}) {
  const ids = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element()]));
  const buttons = [0, 50, 100].map(value => Object.assign(new Element(), { dataset: { reveal: String(value) } }));
  const checks = [new Element(), new Element(), new Element()];
  const links = [], blobs = [], revoked = [], callbacks = [];
  const document = {
    getElementById: id => { assert.ok(ids.has(id), `Unknown HTML element ${id}`); return ids.get(id); },
    querySelectorAll: selector => selector === '[data-reveal]' ? buttons : checks,
    createElement: tag => { assert.equal(tag, 'a'); const link = new Element(); links.push(link); return link; },
    body: { append: link => { link.appended = true; } }
  };
  ids.get('compare').value = '50';
  if (loading) for (const id of ['original', 'result']) ids.get(id).complete = false;
  if (broken) ids.get('result').naturalWidth = 0;
  const platform = {
    Date: class extends Date { constructor() { super('2026-11-01T12:00:00Z'); } },
    Blob,
    URL: {
      createObjectURL: blob => { if (downloadFails) throw Error('Disabled download'); blobs.push(blob); return 'blob:local-note'; },
      revokeObjectURL: url => revoked.push(url)
    },
    setTimeout: fn => callbacks.push(fn)
  };
  initializeViewer(document, platform);
  return { ids, buttons, checks, links, blobs, callbacks, revoked };
}

test('original and output bytes match the recorded originals exactly', () => {
  const assets = [
    ['synthetic-adult-person-input.png', 1512065, 'd729c018fe4969390ad48f383e1c8f830d0384b027d6cc2306f0e0fcef3a24ac', '../second-look/assets/youcam-test-2026/synthetic-adult-person-input.png'],
    ['youcam-clothes-v4-output.jpg', 223949, '36bc849e0ebac23857871760184a6c50fbc1c9f2d5499718a6029c436c625523', '../second-look/live-result-2026-11-01/youcam-clothes-v4-output.jpg']
  ];
  for (const [name, size, hash, original] of assets) {
    const bytes = readFileSync(resolve(root, 'assets', name));
    assert.equal(bytes.length, size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    const sourcePath = resolve(root, original);
    if (existsSync(sourcePath)) assert.deepEqual(bytes, readFileSync(sourcePath));
  }
});

test('all loaded resources are local; connections, forms and embedded content are blocked', () => {
  const resources = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  const sourceLink = 'https://github.com/jacman1988-super/second-look-youcam-2026';
  assert.equal(resources.filter(value => value === sourceLink).length, 1);
  for (const path of resources.filter(value => value !== sourceLink && !value.startsWith('#'))) {
    assert.ok(path.startsWith('./'), `Non-relative resource: ${path}`);
    const absolute = resolve(root, path);
    assert.ok(absolute.startsWith(root + sep));
    assert.ok(existsSync(absolute), `Missing local resource: ${path}`);
  }
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.doesNotMatch(html, /<(?:iframe|form)\b/i);
  assert.doesNotMatch(read('style.css'), /@import|url\s*\(/i);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|serviceWorker|import)\b/);
  assert.match(html, /Recorded YouCam Clothes V4 result, not live generation/);
  assert.match(html, /supplementary evidence/);
  assert.match(html, /own permitted API key/);
});

test('slider and view buttons reveal correct endpoints with matching accessible state', () => {
  const { ids, buttons } = fixture();
  const slider = ids.get('compare');
  assert.equal(slider.disabled, false);
  assert.equal(ids.get('imageStage').styles.get('--reveal'), '50%');
  buttons[0].click();
  assert.equal(slider.value, '0');
  assert.equal(ids.get('imageStage').styles.get('--reveal'), '0%');
  assert.equal(ids.get('resultBadge').hidden, true);
  assert.equal(ids.get('compareDivider').hidden, true);
  assert.equal(buttons[0].attributes.get('aria-pressed'), 'true');
  buttons[2].click();
  assert.equal(slider.value, '100');
  assert.equal(ids.get('originalBadge').hidden, true);
  assert.equal(ids.get('resultBadge').hidden, false);
  slider.value = '26'; slider.emit('input');
  assert.equal(ids.get('imageStage').styles.get('--reveal'), '26%');
  assert.equal(slider.attributes.get('aria-valuetext'), '26% recorded result revealed');
  assert.equal(ids.get('revealValue').textContent, '26% result');
  assert.equal(ids.get('compareDivider').hidden, false);
  assert.ok(buttons.every(button => button.attributes.get('aria-pressed') === 'false'));
});

test('comparison waits for both images and fails closed for missing files', () => {
  const loading = fixture({ loading: true });
  assert.equal(loading.ids.get('compare').disabled, true);
  loading.ids.get('original').complete = true;
  loading.ids.get('original').emit('load');
  assert.equal(loading.ids.get('compare').disabled, true);
  loading.ids.get('result').complete = true;
  loading.ids.get('result').emit('load');
  assert.equal(loading.ids.get('compare').disabled, false);
  loading.ids.get('result').emit('error');
  assert.equal(loading.ids.get('compare').disabled, true);
  assert.ok(loading.buttons.every(button => button.disabled));
  assert.match(loading.ids.get('imageStatus').textContent, /could not be opened/);
  const broken = fixture({ broken: true });
  assert.equal(broken.ids.get('compare').disabled, true);
  assert.match(broken.ids.get('imageStatus').textContent, /could not be opened/);
});

test('checklist changes flow into a local text download with user notes', async () => {
  const { ids, checks, links, blobs, callbacks, revoked } = fixture();
  assert.equal(ids.get('checkCount').textContent, '0 / 3 checks complete');
  checks[0].checked = true; checks[0].emit('change');
  assert.equal(ids.get('checkCount').textContent, '1 / 3 checks complete');
  checks[2].checked = true; checks[2].emit('change');
  ids.get('notes').value = 'Ask for waist measurement & fabric details.';
  ids.get('export').click();
  assert.equal(blobs.length, 1);
  const text = await blobs[0].text();
  assert.match(text, /\[x\] Actual garment measurements checked/);
  assert.match(text, /\[ \] Condition, repairs, fabric and care checked/);
  assert.match(text, /\[x\] Seller photographs/);
  assert.match(text, /Ask for waist measurement & fabric details\./);
  assert.match(text, /2026-11-01/);
  assert.doesNotMatch(text, /https?:|assets\/|d729c018|36bc849e/);
  assert.equal(links[0].href, 'blob:local-note');
  assert.equal(links[0].download, 'second-look-decision-notes.txt');
  assert.equal(links[0].clicked, true);
  assert.equal(links[0].removed, true);
  callbacks[0]();
  assert.deepEqual(revoked, ['blob:local-note']);
  checks[1].checked = true; checks[1].emit('change');
  assert.equal(ids.get('checkCount').textContent, '3 / 3 checks complete');
  assert.match(ids.get('checkMessage').textContent, /Questions checked/);
});

test('download errors produce an actionable message without claiming a saved file', () => {
  const { ids, links, blobs } = fixture({ downloadFails: true });
  ids.get('export').click();
  assert.equal(links.length, 0);
  assert.equal(blobs.length, 0);
  assert.match(ids.get('exportStatus').textContent, /could not start a download/);
});

test('out-of-range comparison values and blank or oversized notes remain bounded', () => {
  assert.equal(normalizePercent(-20), 0);
  assert.equal(normalizePercent(115), 100);
  assert.equal(normalizePercent('unusable'), 50);
  assert.equal(normalizePercent(39.7), 40);
  const date = new Date('2026-11-01T12:00:00Z');
  assert.match(makeNotes([false, false, false], '  ', date), /\(No additional note\.\)/);
  const text = makeNotes([], 'A'.repeat(5000), date);
  assert.ok(text.includes('A'.repeat(4000)));
  assert.ok(!text.includes('A'.repeat(4001)));
});
