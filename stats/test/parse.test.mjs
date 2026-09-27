import { test } from 'node:test';
import assert from 'node:assert/strict';
import { device, isBot, screen, source } from '../parse.mjs';

test('device type, OS and browser', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  assert.deepEqual(device(iphone), { type: 'Handy', os: 'iOS', browser: 'Safari' });
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  assert.deepEqual(device(ipad, true), { type: 'Tablet', os: 'iPadOS', browser: 'Safari' });
  assert.deepEqual(device(ipad, false), { type: 'Desktop', os: 'macOS', browser: 'Safari' });
  const pixel = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
  assert.deepEqual(device(pixel), { type: 'Handy', os: 'Android', browser: 'Chrome' });
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0';
  assert.deepEqual(device(edge), { type: 'Desktop', os: 'Windows', browser: 'Edge' });
  assert.equal(device(`${iphone} Instagram 300.0`).browser, 'Instagram (App)');
});

test('bots and scripts are not visitors', () => {
  assert.ok(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'));
  assert.ok(isBot('WhatsApp/2.23 A facebookexternalhit'));
  assert.ok(isBot('Mozilla/5.0 HeadlessChrome/140.0'));
  assert.ok(isBot(''));
  assert.ok(!isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'));
});

test('source from referrer or tag', () => {
  assert.equal(source('https://www.linkedin.com/in/someone/'), 'LinkedIn');
  assert.equal(source('https://lnkd.in/abc'), 'LinkedIn');
  assert.equal(source('https://www.google.de/'), 'Google');
  assert.equal(source('https://counter.hugobarthelmess.de/'), 'Eigene Projekte');
  assert.equal(source('https://hugobarthelmess.de/'), 'Direkt');
  assert.equal(source(''), 'Direkt');
  assert.equal(source('https://example.org/x'), 'example.org');
  assert.equal(source('https://www.google.de/', 'QR-Karte<script>'), 'qr-kartescript');
});

test('screen size bucket', () => {
  assert.equal(screen(402, 874), '402×874');
  assert.equal(screen('x', 5), null);
});
