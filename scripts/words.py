#!/usr/bin/env python3
"""Find every word you say and when you say it, so captions land on time.

usage: python3 scripts/words.py my-video.mp4   ->  saves my-video.words.json next to the video

The first run sets up a private Python folder (.venv) inside this skill and installs the free
faster-whisper transcriber into it (about a minute). Nothing is installed system-wide.
Set WHISPER_MODEL=small (or medium) for better accuracy on longer or noisier videos.
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV = os.path.join(ROOT, '.venv')
PY = os.path.join(VENV, 'Scripts' if os.name == 'nt' else 'bin', 'python')

if len(sys.argv) < 2:
    print(__doc__); sys.exit(1)

try:
    from faster_whisper import WhisperModel
except ImportError:
    if os.path.abspath(sys.prefix) == os.path.abspath(VENV):
        print('Installing the transcriber (one time, about a minute)...', flush=True)
        subprocess.run([PY, '-m', 'pip', 'install', '-q', 'faster-whisper'], check=True)
        from faster_whisper import WhisperModel
    else:
        if not os.path.exists(PY):
            print('Setting up the transcriber (one time)...', flush=True)
            import shutil
            # Some Python builds can't set up pip in a venv (seen on Homebrew Python 3.14), so try others on this computer too.
            tries = [sys.executable] + [p for p in (shutil.which(f'python3.{v}') for v in (13, 12, 11, 10)) if p]
            for exe in dict.fromkeys(tries):
                shutil.rmtree(VENV, ignore_errors=True)
                if subprocess.run([exe, '-m', 'venv', VENV], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0 and os.path.exists(PY):
                    break
            else:
                shutil.rmtree(VENV, ignore_errors=True)
                sys.exit('Could not set up Python for the transcriber. Install Python 3.12 from python.org and run this again.')
        sys.exit(subprocess.run([PY] + sys.argv).returncode)

src = os.path.abspath(sys.argv[1])
out = os.path.splitext(src)[0] + '.words.json'
model = WhisperModel(os.environ.get('WHISPER_MODEL', 'base'), device='cpu', compute_type='int8')
segs, _ = model.transcribe(src, word_timestamps=True, vad_filter=True)
words = [{'w': w.word.strip(), 's': round(w.start, 2), 'e': round(w.end, 2)} for s in segs for w in (s.words or []) if w.word.strip()]

with open(out, 'w') as f:
    f.write('[' + ',\n '.join(json.dumps(w, ensure_ascii=False) for w in words) + ']\n')
for w in words:
    print(f"{w['s']:7.2f}  {w['w']}")
print(f'\nSaved {len(words)} words to {out}')
