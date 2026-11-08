#!/usr/bin/env node
/* Burn captions into a video.
   node scripts/render.js <video> <words.json> <style> [options]

   options:
     --out <file>        output path (default: <video>_<style>.mp4 next to your video)
     --hl <#hex>         highlight colour for key words (default #ffd23f)
     --y <0-100>         height of the captions on screen, % from the top (default 64)
     --size <n>          caption size, 1 = normal (default 1)
     --box               Retro Typer only: soft hazy box behind the text
     --still <seconds>   render one check frame as a PNG instead of the whole video (repeatable)

   How it works: Chrome draws only the captions on a transparent page, frame by frame, at your video's
   size and frame rate. ffmpeg lays those frames over your untouched video and keeps your audio. */
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flags = { stills: [] }; const pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--box') flags.box = true;
  else if (a === '--still') flags.stills.push(+args[++i]);
  else if (a.startsWith('--')) flags[a.slice(2)] = args[++i];
  else pos.push(a);
}
const [videoIn, wordsIn, style = 'pop-sticker'] = pos;
if (!videoIn || !wordsIn) {
  console.log('usage: node scripts/render.js <video> <words.json> <style> [--out file] [--hl #ffd23f] [--y 64] [--size 1] [--box] [--still 2.5]');
  console.log('styles: editorial-highlight, pop-sticker, paper-plane, smoke-exit, explosive-breakup, rolodex-flip, retro-typer');
  process.exit(1);
}
const video = path.resolve(videoIn), wordsPath = path.resolve(wordsIn);
const words = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
const base = path.join(path.dirname(video), path.basename(video, path.extname(video)));
const out = path.resolve(flags.out || `${base}_${style}.mp4`);

function need(bin) { try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); } catch (e) { console.error(`${bin} is missing. Install ffmpeg first (Mac: brew install ffmpeg · Windows: winget install ffmpeg).`); process.exit(1); } }
need('ffmpeg'); need('ffprobe');

/* ---- what is this video? ---- */
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_format', '-of', 'json', video]).toString());
const vs = probe.streams[0];
let W = vs.width, H = vs.height;
const rot = Math.abs(+((vs.side_data_list || []).find(d => d.rotation != null) || {}).rotation || +(vs.tags || {}).rotate || 0);
if (rot === 90 || rot === 270) [W, H] = [H, W];
const [fn, fd] = (vs.avg_frame_rate && vs.avg_frame_rate !== '0/0' ? vs.avg_frame_rate : vs.r_frame_rate).split('/').map(Number);
const fps = fn / (fd || 1);
const duration = +(probe.format.duration || vs.duration);
if (/arib-std-b67|smpte2084/.test(vs.color_transfer || '')) console.warn('Heads up: this is an HDR video (iPhone default). If colours look washed out, export it as SDR first (iPhone: Settings > Camera > Formats > Most Compatible, or export from your editor) and render again.');

/* ---- Chrome ---- */
function chromePath() {
  const c = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [];
  if (process.platform === 'darwin') c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
  else if (process.platform === 'win32') {
    const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    pf.forEach(p => c.push(path.join(p, 'Google/Chrome/Application/chrome.exe'), path.join(p, 'Microsoft/Edge/Application/msedge.exe')));
  } else c.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium');
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
function loadPuppeteer() {
  try { return { pp: require('puppeteer'), exe: undefined }; } catch (e) { }
  try { const exe = chromePath(); if (!exe) throw new Error('no chrome'); return { pp: require('puppeteer-core'), exe }; } catch (e) { }
  console.error('Chrome helper missing. Run this once inside the captions folder:  npm install   (needs Google Chrome installed)');
  process.exit(1);
}

(async () => {
  const { pp, exe } = loadPuppeteer();
  const browser = await pp.launch({ headless: true, executablePath: exe, args: ['--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb'] });
  const page = await browser.newPage();
  const dpr = W > 1200 ? 2 : 1;
  await page.setViewport({ width: Math.round(W / dpr), height: Math.round(H / dpr), deviceScaleFactor: dpr });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file://' + path.join(ROOT, 'render.html'), { waitUntil: 'networkidle0', timeout: 60000 });
  const info = await page.evaluate(cfg => window.setup(cfg), { words, style, highlight: flags.hl || '#ffd23f', y: flags.y == null ? 64 : +flags.y, size: flags.size == null ? 1 : +flags.size, options: { box: !!flags.box } });
  if (!info.lines) { console.error('No words found in ' + wordsIn + '. Each word needs {"w": "...", "s": start, "e": end}.'); process.exit(1); }
  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const shot = async t => {
    const has = await page.evaluate(async t => { window.frame(t); await new Promise(r => requestAnimationFrame(() => r())); return document.querySelector('.cs-layer').childElementCount > 0; }, t);
    if (!has) return null;
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    return Buffer.from(r.data, 'base64');
  };

  /* ---- check stills ---- */
  if (flags.stills.length) {
    for (const t of flags.stills) {
      for (let f = 0; f <= Math.round(t * fps); f += Math.max(1, Math.round(fps / 10))) await page.evaluate(x => window.frame(x), f / fps); // play up to t
      const png = await shot(t); const tmp = path.join(os.tmpdir(), `cap_${process.pid}_${t}.png`);
      const o = `${base}_${style}_still_${t}s.png`;
      if (png) { fs.writeFileSync(tmp, png); execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', video, '-i', tmp, '-filter_complex', '[0:v][1:v]overlay=0:0', '-frames:v', '1', o]); fs.unlinkSync(tmp); }
      else execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', o]);
      console.log('still:', o);
    }
    await browser.close(); if (errs.length) console.warn('page errors:', errs.slice(0, 5)); return;
  }

  /* ---- full render ---- */
  const frames = Math.floor(duration * fps);
  console.log(`Rendering ${style} on ${path.basename(video)}: ${W}x${H}, ${fps.toFixed(2)} fps, ${duration.toFixed(1)}s, ${info.lines} caption lines`);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-i', video, '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-filter_complex', `[1:v]format=rgba,scale=${W}:${H}[c];[0:v][c]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-c:a', 'copy', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', code => code === 0 ? res() : rej(new Error('ffmpeg failed: ' + code))));
  const write = buf => new Promise(r => ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r));
  // an empty frame for moments with no caption on screen
  await page.evaluate(() => { document.getElementById('stage').style.visibility = 'hidden'; });
  const blank = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64');
  await page.evaluate(() => { document.getElementById('stage').style.visibility = ''; });
  let last = -1;
  for (let i = 0; i < frames; i++) {
    const png = await shot(i / fps);
    await write(png || blank);
    const pct = Math.floor(i / frames * 10); if (pct !== last) { last = pct; process.stdout.write(`  ${pct * 10}%\n`); }
  }
  ff.stdin.end(); await done; await browser.close();
  if (errs.length) console.warn('page errors:', errs.slice(0, 5));
  console.log('Done: ' + out);
})().catch(e => { console.error(e.message || e); process.exit(1); });
