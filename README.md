# Annual Function Soundboard

A local-first soundboard and run-of-show manager for an annual function. It keeps the event list, the audio cues for each event, and the show clock in one place.

## Quick start

1. Run **`start.bat`**. It starts a small local server at `http://localhost:8080` and opens the app.
2. The app loads the run of show from `show.json` on first run.
3. Press **Start event** to begin the first cue.

The audio library is read from:

```
C:\Users\akshu\Videos\chinmay\ffmpeg-master-latest-win64-gpl\ffmpeg-master-latest-win64-gpl\bin\Mp3s
```

That path is set in **`config.json`**. Change it if you move the audio folder.

## Pre-loaded run of show

On first run the app creates these events from `show.json`:

| # | Event | Audio |
| --- | --- | --- |
| 1 | Act 1 · Classical | `classical.mp3` |
| 3 | Act 3 · ABBA, Elvis & Beatles | `medley.mp3` |
| 4 | Act 4 · Chuck Berry | `chuckberry.mp3` |
| 5 | Act 5 · Shakuntala | 15 cues, in the order below |
| 6 | Act 6 · Charlie Chaplin | No audio yet |
| 7 | Act 7 · Bhagat Singh | No audio yet |

**Shakuntala cue order:**

1. Narration (flute music)
2. 2chankaya
3. Chirping of birds
4. Horse footsteps
5. Garden music
6. Piya ki nazariya + wedding song
7. Viraha flute
8. Chaurasiya alaap
9. Final Durvasa
10. Chaurasiya alaap (reprise)
11. Fisherman final
12. King Dushyant court music
13. Bharat Dushyant milaap
14. Final narration
15. Shubh din aayo

Acts 6 and 7 are ready and waiting for their audio files. To reload `show.json` after deleting the events, clear the browser data for `localhost:8080` and reload.

## Audio folder

The folder library reads every supported audio file from the configured folder. The current folder has 45 files, including MP3 and MPEG files.

- Click **Audio folder** on an event to see the full list.
- Tick the files you want and press **Add N cues**. They are added in the order shown.
- Press **Refresh** after adding or removing files.
- Folder cues are referenced by path, so the audio stays in the folder.
- You can still use **+ Add audio** or drag files onto the event panel to import individual files into the browser.

Supported extensions: MP3, MPEG, MPG, WAV, OGG, M4A, AAC, FLAC, OPUS, WebM, AIFF, WMA, MP4, M4B, MOV, M4V, MKV, OGV.

Cues whose file is MP4/M4V/MOV/MKV/WebM/OGV are treated as **video cues**: starting one takes the whole screen over with the video (keyboard shortcuts keep working underneath). Everything else plays as a background audio cue, same as before.

## How it works

1. **Create an event** with `+ New event`. Give it a name, start time, status, and notes.
2. **Add audio** from the folder library, with `+ Add audio`, or by dragging files onto the event panel.
3. **Start the event** with the big `Start event` button. The first cue begins immediately.
4. **Multiple cues play in order.** With `Auto-advance` on, the next cue is cued up as soon as the previous one ends — press `Space` to start it. Turn it off and the show stays on the finished cue until you press `Next cue`.
5. **Track the show** with the status pill (`Upcoming`, `Live`, `Done`) and the show clock.

## Features

- Event list with search, drag-to-reorder, and up/down buttons
- One or many audio or video cues per event, played in order
- Video mode: a video cue takes the whole screen over, with a hint for the next cue once it ends — keyboard shortcuts still work
- Audio folder library plus manual file import
- Per-cue volume, fade-in, and fade-out
- Auto-advance or manual cue-by-cue playback
- Auto-scrolls the cue list to keep the playing cue in view
- Transport controls: play/pause, previous, next, stop with fade
- Seek bar, master volume, and current/total time
- Show clock with start/pause/reset
- Event status tracking and notes
- Printable run sheet
- Keyboard shortcuts

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `Enter` | Start the selected event |
| `→` / `←` | Select next / previous event |
| `1`–`9` | Start cues 1–9. After cue 10 plays, they start cues 11–19 |
| `0` | Start cue 10 |
| `Shift + →` | Next act with audio and start its first cue |
| `Shift + ←` | Previous act with audio and start its first cue |
| `N` | Next cue |
| `B` | Previous cue / restart current |
| `Esc` | Stop with fade |
| `↑` / `↓` | Select previous / next event |
| `?` | Show the shortcut help |

For a fast act change: press `→` until the next act is selected, then press `1` to start its first cue. Or press `Shift + →` to select the next act with audio and start it in one go.

## Event-day tips

- Test every audio file on the actual laptop and sound system before the event.
- Keep the server window and the browser tab open. Disable sleep if possible.
- Use `Print run sheet` to give the stage team a paper copy.
- Folder cues stay in the configured folder; imported cues are stored in the browser. Do not clear browser data or use private/incognito mode.
- If you move the show to another computer, copy the project folder, copy the audio folder, and update `config.json`.

## Files

- `index.html` — the app shell
- `styles.css` — the dark stage-friendly interface
- `app.js` — event management, audio playback, storage, and shortcuts
- `server.py` — local server that serves the app, lists the audio folder, and streams audio with seek support
- `config.json` — points the server at the audio folder
- `show.json` — the pre-loaded run of show
- `audio/` — fallback folder used when `config.json` has no `audioDir`
- `start.bat` — starts the local server and opens the app
