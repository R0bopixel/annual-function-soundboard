# Annual Function Soundboard

A local-first soundboard and run-of-show manager for an annual function. It keeps the event list, the audio cues for each event, and the show clock in one place.

## Quick start

1. Run **`start.bat`**. It starts a small local server at `http://localhost:8080` and opens the app.
2. The app loads the run of show from `show.json` on first run.
3. Press **Start event** to begin the first cue.

The audio library is read from the folder set in **`config.json`** (`audioDir`). By default that's the local `audio/` folder next to this project — change it if you move the audio elsewhere, or point it at a different folder per machine.

## Pre-loaded run of show

On first run the app creates these events from `show.json`:

| # | Event | Audio |
| --- | --- | --- |
| — | Intro | `Intro AV` (file not linked yet) |
| 1 | Act 1 · Classical | `classical.mp3` |
| 2 | Act 2 · Choir | No audio yet |
| 3 | Act 3 · Aryabhatt | 6 ACT cues, in order |
| 4 | Act 4 · ABBA, Elvis & Beatles | `medley.mp3` |
| 5 | Act 5 · Chuck Berry | `chuckberry.mp3` |
| 6 | Act 6 · Shakuntala | 17 cues (incl. 5 blackout markers), in the order below |
| 7 | Act 7 · Charlie Chaplin | `charlie chaplin.mp3` |
| 8 | Act 8 · Bhagat Singh | 17 cues (incl. 3 blackout markers), in the order below |

**Act 3 · Aryabhatt cue order:** ACT 1 · Aryabhata, ACT 2 · Mr. Moon, ACT 3 · Planets, ACT 4 · Stars, ACT 5 · Count on Me, ACT 6 · Happy. ACT 5's file (`count on me.mpeg`) isn't in `audio/` yet — only a broken 0.3-second placeholder (`act 5 count on me.mp3`) is there.

**Act 6 · Shakuntala cue order:** Narration AV → Chanakya Dance AV → Narration AV (Aashram) → *BLACK OUT* → Act AV (Aashram) → Piya Ki Nazariya → Act AV (Aashram) → Durvasa Dance → Act AV (Aashram) → *BLACK OUT* → Act AV (Raj Mahal) → *BLACK OUT* → Act AV (Raj Mahal) → *BLACK OUT* → Narration AV (Forest) → *BLACK OUT* → Subh Din Aayo. Only Piya Ki Nazariya, Durvasa Dance, and Subh Din Aayo have files linked — the rest need one attached via Audio folder / Add audio.

**Act 8 · Bhagat Singh cue order:** Tribute AV → Nukkad Natak AV → Jhansi Laxmi AV → Nukkad Natak AV → Chota Bhagata Act AV → Baisakhi AV → *BLACK OUT (Narration)* → Ram Ram AV → *BLACK OUT (Narration)* → Desh Nhi Jhukne Dunga AV → *BLACK OUT (Narration)* → Dialogue AV → Uri Song AV → Dialogue AV → Rang De Basanti AV → Dialogue AV → Nukkad Natak AV. Tribute/Jhansi Laxmi/Chota Bhagat/Ram Ram/Desh Nhi Jhukne Dunga/Rang De Basanti have files linked (double check those are the right picks); Nukkad Natak, Baisakhi, Uri Song, and the Dialogue cues still need one.

A *BLACK OUT* line is a stage direction, not a media file — see **Keyboard shortcuts** below for the `B` blackout key. To reload `show.json` after deleting the events, clear the browser data for `localhost:8080` and reload.

## Audio folder

The folder library reads every supported audio file from the configured folder. The current folder has 35 files, including MP3 files (a handful of low-quality duplicate re-encodes were moved out to `audio/_low_quality_duplicates/` so they don't get picked by mistake).

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
- Run-of-show checklist side panel, separate from the audio cue list — see below
- Blackout key (`B`) to cut audio instantly, no fade
- Checklist items auto-tick when their linked cue finishes playing; `A` manually ticks the next anchoring/narration beat
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

## Run-of-show checklist

The **Checklist** button in the top bar opens a side panel with the tentative run of show — a coarser, stage-manager-facing list separate from the audio cue list. Every act transition is bracketed by an "Anchoring (BO)" item (the anchor talks, then a blackout before the next act):

- Anchoring (BO)
- Classical
- Anchoring (BO)
- Choir
- Aryabhatta
  - Narration / Act 1 / Narration / Act 2 / … through Act 6
- Anchoring (BO)
- ABBA, Elvis, Beatles
- Anchoring (BO)
- Chuck Berry
- Anchoring (BO)
- Shakuntala
  - Act 1, Act 2, Piya Ki Nazariya, Act 3, Durvasa Dance, Act 4–7, Shubh Din Aayo
- Anchoring (BO)
- Charlie Chaplin
- Anchoring (BO)
- Bhagat Singh
  - Tribute AV, Nukkad Natak AV, Jhansi Laxmi AV, Nukkad Natak AV, Chota Bhagata Act AV, Baisakhi AV, *BLACK OUT (Narration)*, Ram Ram AV, *BLACK OUT (Narration)*, Desh Nhi Jhukne Dunga AV, *BLACK OUT (Narration)*, Dialogue AV, Uri Song AV, Dialogue AV, Rang De Basanti AV, Dialogue AV, Nukkad Natak AV
- Blackout (closing)

None of these are linked to a song yet — that's a separate pass (see Edit → 🔗 below).

Tick items as they finish. Use **Edit** to add, rename, or delete items. **Reset** reloads the tentative list from `show.json` and clears the ticks. The checklist opens beside the main interface and shrinks the event panel instead of covering it.

Use **Edit → 🔗** to link an item to an event or a specific cue. When that audio *finishes playing*, the linked item checks itself automatically. Clicking a linked item jumps to its event/cue.

Anchoring and narration items aren't tied to audio — a human is talking, not a soundboard cue — so they're ticked with the **A** key instead: it finds the next unchecked item whose label contains "Anchoring" or "Narration" (in list order) and checks it off.

Checklist items can also be linked to one or more **song filenames** directly in `show.json` (a `songs` array per item) — not an event/cue id, a filename, matched against whatever cue just finished. An item with several songs (e.g. Shakuntala's "Act 2": horse footsteps, chirping of birds, garden music) only ticks once *all* of them have finished playing. If the same filename is reused back-to-back for several items (e.g. "Chaurasiya Alaap" backs Shakuntala's Act 3, 4, and 5 in a row), each finished play satisfies the earliest still-open item needing it, in order — so the three tick off one at a time as the track is replayed, not all at once on the first play. Currently linked this way: Classical, all of Aryabhatta's Act 1–6, ABBA/Elvis/Beatles, Chuck Berry, and all of Shakuntala's children. Charlie Chaplin and Bhagat Singh aren't linked yet.

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
| `P` | Previous cue / restart current |
| `B` | Blackout — cut audio immediately |
| `A` | Tick off the next anchoring/narration checklist item |
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
