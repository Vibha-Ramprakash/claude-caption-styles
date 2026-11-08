---
name: captions
description: "Burn animated captions into a vertical video in one of 7 styles: editorial-highlight, pop-sticker, paper-plane, smoke-exit, explosive-breakup, rolodex-flip, retro-typer. Free starter pack by @vibha.in.progress. Trigger when someone types /captions, says 'add captions', 'caption my video', 'subtitles on my reel', names one of the 7 styles, or drops a talking video and asks for captions."
---

# /captions: 7 caption styles

Turns a talking video into the same video with animated captions burned in. Words are timed to the voice, one key word per line gets the highlight colour, and the original video and audio stay untouched (captions are laid on top).

## The 7 styles
| Type this | Look |
|---|---|
| `editorial-highlight` | Magazine serif, key word on a deep-red paper strip, small page number above the line |
| `pop-sticker` | Colour blocks with black outlines and hard shadows, little stickers pop around them, key words purple with a star |
| `paper-plane` | A paper plane in the highlight colour flies across and pulls the line in behind it |
| `smoke-exit` | Chunky sans words; when the line ends it dissolves into smoke, the key word smokes in its own colour |
| `explosive-breakup` | Big condensed caps; at the end of the line every letter blasts outward, key word in sparks |
| `rolodex-flip` | The line builds word by word, each new word flips down like a rolodex card |
| `retro-typer` | Typewriter letters typed in time with the voice, blinking block cursor (option: hazy box) |

If the user gives no style, show this table and ask which one (suggest `pop-sticker`).

## Setup (first time only)
Run inside this skill folder. Check first, install only what's missing:
- `ffmpeg` and `ffprobe` (Mac: `brew install ffmpeg`, Windows: `winget install ffmpeg`)
- Node.js 18+ and Google Chrome (or Edge/Chromium). Then `npm install` in this folder (small: it uses the Chrome already on the computer).
- Python 3. `scripts/words.py` makes its own `.venv` here and installs faster-whisper on first use.

## Steps
1. **Words.** `python3 scripts/words.py <video>` writes `<video>.words.json`: `[{"w":"Hello","s":0.21,"e":0.48}, ...]`. Skip if the user already has one (`/captions words <video>` = only do this step).
2. **Tidy the words** (edit the JSON, keep the timings):
   - Fix misheard words, names and brand spellings. Ask the user if unsure.
   - Mark **one key word per line** with `"k": true`: the word that carries the point (a result, number, name or the surprising word). Not every line needs one.
   - Mark line ends with `"br": true` so each line is 2 to 4 words and under ~20 letters, breaking where the speaker naturally pauses. Once any `br` exists, lines break only at `br`, punctuation and long pauses.
   - Write symbols the way people read them on screen: "slash" → "/", "percent" → "%" when it's part of a term.
3. **Check frames before the full render.** `node scripts/render.js <video> <words.json> <style> --still 1.5 --still 4 --still 8` (pick moments mid-line). Look at the PNGs: captions readable, not over the face or the app's own UI. Too high or low? Use `--y` (64 = default, lower number = higher up). Too big? `--size 0.85`.
4. **Render.** `node scripts/render.js <video> <words.json> <style> [--hl #ff7a59] [--y 64] [--size 1] [--box]` → `<video>_<style>.mp4` next to the original. About 3 minutes for a 60s reel.
5. Tell the user where the file is. For a live look at all 7 styles on their own video, open `index.html` in Chrome and load the video and the words file.

## Options
| Flag | What it does |
|---|---|
| `--hl <#hex>` | Highlight colour for key words. Presets: yellow `#ffd23f` (default), coral `#ff7a59`, sky `#7cc4ff`, mint `#9ff0b8` |
| `--y <0-100>` | Caption height, % from the top. 64 sits under the chin on a talking head |
| `--size <n>` | Caption size, 1 = normal |
| `--box` | Retro Typer only: soft hazy box behind the text |
| `--out <file>` | Output path |
| `--still <s>` | Check frame at that second instead of a full render (repeatable) |

## Notes
- HDR iPhone footage can look washed out after rendering. Export it as SDR first, or set the iPhone to Settings > Camera > Formats > Most Compatible.
- Captions always sit on top of the video. This is the starter pack: words behind the speaker, glass and wall-text styles are not included.
- Fonts load from Google Fonts, so the render needs an internet connection.
