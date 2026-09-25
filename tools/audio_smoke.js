/* Real WebAudio integration + reproducible OfflineAudioContext listening samples.
 * Run with Playwright/Chromium installed: node tools/audio_smoke.js
 * Samples use the game's actual synthesizer, not a separately authored substitute.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'gui-test-screenshots', 'feedback-audio');
const source = fs.readFileSync(path.join(ROOT, 'src/core/audio.js'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [], results = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('about:blank');
    await page.evaluate(() => {
      const NativeContext = window.AudioContext;
      const intervals = new Set(), active = new Set(), starts = [];
      const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
      window.setInterval = (...args) => { const id = set(...args); intervals.add(id); return id; };
      window.clearInterval = id => { intervals.delete(id); clear(id); };
      const audit = window.audioAudit = { intervals, active, starts, resumes: 0, context: null };
      window.AudioContext = function () {
        const context = audit.context = new NativeContext();
        let permitted = false;
        return new Proxy(context, {
          get(target, key) {
            if (key === 'state') return permitted ? target.state : 'suspended';
            if (key === 'resume') return () => {
              audit.resumes++;
              if (audit.resumes === 1) return Promise.reject(new Error('simulated autoplay rejection'));
              permitted = true;
              return target.resume();
            };
            if (key === 'createOscillator' || key === 'createBufferSource') return () => {
              const voice = target[key](), start = voice.start.bind(voice);
              voice.start = at => { active.add(voice); starts.push(at); start(at); };
              voice.addEventListener('ended', () => active.delete(voice));
              return voice;
            };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
    });
    await page.addScriptTag({ content: source });
    await page.evaluate(() => { SF.audio.playMusic('boss', { final: true }); SF.audio.unlock(); });
    await page.waitForTimeout(80);
    assert.deepEqual(await page.evaluate(() => ({ resumes: audioAudit.resumes, starts: audioAudit.starts.length })), { resumes: 1, starts: 0 });
    await page.evaluate(() => {
      const button = document.createElement('button'); button.textContent = 'Unlock audio';
      button.onclick = () => SF.audio.unlock(); document.body.append(button);
    });
    await page.getByRole('button', { name: 'Unlock audio' }).click();
    await page.waitForFunction(() => audioAudit.context.state === 'running' && audioAudit.starts.length > 0);
    assert.equal(await page.evaluate(() => SF.audio.track), 'boss');
    results.push('Autoplay rejection can retry on a real user gesture; requested Boss track resumes');
    await page.evaluate(() => SF.audio.setBossPhase(1));
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => SF.audio.bossPhase), 1);
    assert.equal(await page.evaluate(() => audioAudit.intervals.size), 1);
    results.push('Phase change keeps one running transport');
    const muteCheck = await page.evaluate(() => {
      SF.audio.setMuted(true);
      const before = audioAudit.starts.length;
      SF.audio.sfx.iceRetaliate();
      for (const effect of ['heatReady','fireOverdrive','capacitorReady','railBurst','armorShock']) SF.audio.sfx[effect]();
      return { before, after: audioAudit.starts.length };
    });
    assert.equal(muteCheck.before, muteCheck.after);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => audioAudit.starts.length), muteCheck.after);
    await page.evaluate(() => { SF.audio.setMuted(false); SF.audio.sfx.iceRetaliate(); });
    await page.waitForTimeout(150);
    await page.evaluate(() => SF.audio.stopMusic());
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => audioAudit.intervals.size), 0);
    assert.equal(await page.evaluate(() => audioAudit.active.size), 0);
    assert.ok(await page.evaluate(() => audioAudit.starts.every(Number.isFinite)));
    results.push('Mute schedules no new voices; stop cancels queued notes and releases every source');
    await page.evaluate(() => {
      SF.audio.playMusic('menu'); SF.audio.playMusic('battle'); SF.audio.playMusic('boss', { final: true });
    });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => audioAudit.intervals.size), 1);
    await page.evaluate(() => SF.audio.stopMusic());
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => audioAudit.active.size), 0);
    results.push('Rapid track switching leaves no old voices or extra timers');
    await page.close();

    const samples = [];
    for (const spec of [
      { mode: 'ice', duration: 1.2, filename: '01-ice-fracture.wav' },
      { mode: 'boss', duration: 22, filename: '02-boss-pressure.wav' },
      { mode: 'mix', duration: 4.5, filename: '03-counter-in-boss-mix.wav' },
      { mode: 'effect', effect: 'heatReady', duration: 1.2, filename: '04-heat-ready.wav' },
      { mode: 'effect', effect: 'fireOverdrive', duration: 1.2, filename: '05-fire-overdrive.wav' },
      { mode: 'effect', effect: 'capacitorReady', duration: 1.2, filename: '06-capacitor-ready.wav' },
      { mode: 'effect', effect: 'railBurst', duration: 1.2, filename: '07-rail-burst.wav' },
      { mode: 'effect', effect: 'armorShock', duration: 1.2, filename: '08-armor-shock.wav' },
    ]) {
      const offlinePage = await browser.newPage();
      offlinePage.on('pageerror', error => errors.push(error.message));
      await offlinePage.goto('about:blank');
      await offlinePage.evaluate(({ duration }) => {
        const rate = 44100, context = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
        const transport = window.offlineTransport = { context, time: 0, timers: new Map(), index: 0 };
        let seed = 1234567;
        Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        window.AudioContext = function () {
          return new Proxy(context, {
            get(target, key) {
              if (key === 'currentTime') return transport.time;
              if (key === 'state') return 'running';
              if (key === 'resume') return () => Promise.resolve();
              const value = Reflect.get(target, key, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        };
        window.setInterval = callback => { const id = ++transport.index; transport.timers.set(id, callback); return id; };
        window.clearInterval = id => transport.timers.delete(id);
      }, spec);
      await offlinePage.addScriptTag({ content: source });
      const rendered = await offlinePage.evaluate(async ({ mode, duration, effect }) => {
        const t = offlineTransport;
        SF.audio.unlock();
        const music = mode === 'boss' || mode === 'mix';
        if (music) SF.audio.playMusic('boss', { final: true });
        let cracked = false, enraged = false, stopped = false;
        for (let i = 0; i * 0.025 < duration; i++) {
          t.time = i * 0.025;
          if (!cracked && mode === 'effect' && t.time >= 0.18) {
            SF.audio.sfx[effect](); cracked = true;
          }
          if (!cracked && (mode === 'ice' && t.time >= 0.18 || mode === 'mix' && t.time >= 2)) {
            SF.audio.sfx.iceRetaliate(); cracked = true;
          }
          if (mode === 'boss' && !enraged && t.time >= 10) { SF.audio.setBossPhase(1); enraged = true; }
          if (music && !stopped && t.time >= duration - 0.8) { SF.audio.stopMusic(); stopped = true; }
          for (const tick of t.timers.values()) tick();
        }
        const buffer = await t.context.startRendering();
        const channels = [buffer.getChannelData(0), buffer.getChannelData(1)], count = buffer.length;
        let peak = 0, sum = 0, nonfinite = 0, clipped = 0;
        for (const channel of channels) for (const value of channel) {
          if (!Number.isFinite(value)) nonfinite++;
          peak = Math.max(peak, Math.abs(value)); sum += value * value;
          if (Math.abs(value) >= 0.999) clipped++;
        }
        const rmsAt = (from, to) => {
          const a = Math.floor(from * buffer.sampleRate), b = Math.min(count, Math.floor(to * buffer.sampleRate));
          let energy = 0;
          for (const channel of channels) for (let i = a; i < b; i++) energy += channel[i] * channel[i];
          return Math.sqrt(energy / Math.max(1, (b - a) * 2));
        };
        const windows = [];
        if (mode === 'boss') for (let time = 0.25; time < duration - 1.5; time += 2) windows.push(rmsAt(time, time + 1));
        const bytes = new Uint8Array(44 + count * 4), view = new DataView(bytes.buffer);
        const ascii = (offset, text) => { for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i); };
        ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
        view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 4, true);
        view.setUint16(32, 4, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, count * 4, true);
        for (let i = 0; i < count; i++) for (let channel = 0; channel < 2; channel++) {
          const value = Math.max(-1, Math.min(1, channels[channel][i]));
          view.setInt16(44 + i * 4 + channel * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
        }
        let binary = '';
        for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
        return { wav: btoa(binary), peak, rms: Math.sqrt(sum / (count * 2)), nonfinite, clipped,
          tailRms: rmsAt(duration - 0.4, duration), windows };
      }, spec);
      assert.equal(rendered.nonfinite, 0);
      assert.equal(rendered.clipped, 0);
      assert.ok(rendered.peak > 0.04 && rendered.peak < 0.98, `Invalid peak in ${spec.filename}: ${rendered.peak}`);
      assert.ok(rendered.tailRms < 0.0001, `Audio did not stop cleanly: ${spec.filename}`);
      if (spec.mode === 'boss') assert.ok(rendered.windows.every(value => value > 0.008), 'Boss backing drops out during a phrase');
      fs.writeFileSync(path.join(OUT, spec.filename), Buffer.from(rendered.wav, 'base64'));
      delete rendered.wav;
      samples.push({ ...spec, ...rendered });
      console.log('AUDIO SAMPLE', spec.filename, JSON.stringify(rendered));
      await offlinePage.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify({ date: new Date().toISOString(), results, samples, errors }, null, 2));
    console.log('AUDIO AUDIT COMPLETE:', results.length, 'integration checks,', samples.length, 'rendered samples,', errors.length, 'errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
