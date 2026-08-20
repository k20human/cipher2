# cyberdeck-gui

The cyberdeck's home screen, under the name **CIPHER-2**: title band, simulated
AI avatar with its journal, a system status column fed by real data, shortcuts,
settings, animated background. A web page installed on the phone's home screen,
served from the phone itself. Nothing leaves the device — both the status API and
the file server listen on `127.0.0.1` only.

A complete redesign of a first version that was portrait, single-column and
plainer.

## Layout

**Landscape only.** Portrait is abandoned: there is no fallback layout, and
`manifest.json` declares `"orientation": "landscape"` so the installed app forces
the orientation however the phone is held.

```
┌──────────────────────────────────────────────────────┐
│  [LOGO CIPHER-2]  ▮▮▮ 7H3 N37 15 ▮▮▮▮ V467 ▮▮ 1NF1 173 ▮▮  │  band
├────────────────────────────┬───────────────────────────┤
│                            │  system status            │
│      CIPHER-2 avatar       │  or shortcut grid         │
│      + journal             │  (one at a time)          │
│                            │  [prompt] toggles between │
│                            │  the two                  │
├────────────────────────────┴───────────────────────────┤
│  21:48  17/08/2026                      ////////////   │  footer
└──────────────────────────────────────────────────────┘
```

The band alternates barcodes and code groups across its whole width, and the
footer's ribbon is made of two overlapping rows of slanted bars — both taken from
a reference photo of a physical cyberdeck HUD (not part of this repository),
which is the authority on appearance. The barcode segments are real elements in
`index.html`: it is the alternation that makes the band read as an instrument's
header, and that cannot come from a single pseudo-element placed after the text.

Three bands in a grid (`#deck`, height fixed at `100svh` — never `min-height`,
without which nothing bounds the middle row). The band carries the logo and a
line of decorative, meaningless codes. The left band (two thirds of the width)
carries CIPHER-2's avatar and its journal. The right band (one third) is **a
screen, not a stack**: it shows either the system status or the shortcut grid,
never both — see *Settings* for `layout.rightView`. Below the readings, a rule
separates the closing verdict (`verdictLine`, in `journal.js`): "All systems
nominal, Operator." while all is well, but **it reports, it does not reassure**.
Any of the readings above can contradict it, worst first since only one sentence
is shown: link lost, critical battery, disk nearly full, memory saturated,
sustained processor load. A lost link comes before everything else — without it,
every other line is a memory rather than a measurement.

The final address (", Operator.") is appended once, to the sentence and not to
each phrasing: that is what makes it impossible to forget in a case added later,
and a test checks it across all nine states, including the ones that fail to
read. The thresholds are gathered at the top of `journal.js`, and the battery one
is shared with `stateLines` — the verdict and the left-hand journal are read side
by side, and a threshold written twice ends up diverging. The journal itself no
longer says "ALL SYSTEMS NOMINAL": two assertions about the same thing, one of
them unconditional, was one too many, and it is the unconditional one that went.

The footer carries the clock (always on one line, time and date side by side,
always 24 h) and the ribbon, which spans exactly the width of the right column:
the footer reuses the deck's column grid (`--deck-columns`) instead of redoing
the calculation, so the two can never diverge. Its background mixes 88 % of the
theme colour (not an opaque fill) to stay readable under the rain.

**Switching between status and shortcuts:**

| Gesture | Effect |
|---|---|
| `Enter` key (outside a text field) | Next view, cyclically |
| Tapping the prompt at the foot of the view (`[ENTRÉE] ACCÉDER AU DECK` / `[ÉCHAP] RETOUR`) | The same effect, without a keyboard |
| `Escape` key | Back to the default view (the status) |

The prompt is the only clickable element that changes view; the body of each view
(tiles, status lines) stays inert for that purpose, so a tap that launches a
shortcut never switches the screen by accident.

No dimension is tuned to a particular phone: text sizes derive from `vmin` (never
`vw`, which in landscape follows the width — the dimension that is not the
constraint), and the right band scrolls for itself rather than pushing the footer
off screen when the shortcut list grows.

## What each file does

| File | Role |
|---|---|
| `index.html` | DOM skeleton of the three bands, stylesheets, effects layer, settings button, mounting of `src/main.js`. |
| `manifest.json` | PWA manifest: `standalone` mode, `orientation: landscape`, icons. |
| `serve.sh` | One-line wrapper that launches `tools/serve.py`. |
| `sw.js` | Service worker: strict precache of everything the server serves, purges the old cache on activation, never caches itself. |
| `src/main.js` | Bootstrap: store, theme, ambience, effects, mounting of modules per band, keyboard view switching, service worker registration. |
| `src/core/schema.js` | Shape of the configuration, default values (including the four original shortcuts), field-by-field validation that never throws. |
| `src/core/store.js` | Persistence in local storage, subscriber notification, export/import, frozen exposed object. |
| `src/core/theme.js` | Palettes and hue rotation — only the ink rotates, never the background. |
| `src/core/registry.js` | Generic module registry: mount band (`containerFor`), order, view cycle (`nextInCycle`), mount/unmount. |
| `src/core/journal.js` | Boot phrases and status lines for CIPHER-2's journal. An array of sentences, no language model. |
| `src/core/telemetry.js` | Parsing of the `/api/status` response, age of a datum, staleness, formatting of the displayed lines. |
| `src/core/effects.js` | Translates the five "Effets" settings into CSS classes set on `<body>`. |
| `src/ambient/engine.js` | Render loop with a capped frame rate, suspended off screen; drives both the background and the canvas avatars. |
| `src/ambient/rain.js` | The code rain — the only effect entrusted to the background canvas. |
| `src/ai/registry.js` | Index of the twelve avatars, on the exact model of the module registry. |
| `src/ai/avatars/*.js` | One avatar per file — eight in SVG (`core`, `halo`, `halo-live`, `wave`, `wave-live`, `iris`, `lattice`, `lattice-live`), four in canvas (`nexus`, `nexus-pulse`, `vortex`, `cipher-core`) — see the table below. |
| `src/modules/cipher.js` | Left band module: mounts the chosen avatar, shows the journal below it. |
| `src/modules/clock.js` | Clock (always 24 h) and date, in the footer. |
| `src/modules/status.js` | Polls `/api/status` at a settable interval, shows the system status, handles the degraded mode. |
| `src/modules/shortcuts.js` | Shortcut grid, editor built into the panel, target normalisation. |
| `src/modules/logo.js` | Renders the logo in one of the four treatments. |
| `src/settings/panel.js` | Builds the panel from the declarations in `core-settings.js` and in each module; knows no module in particular. |
| `src/settings/core-settings.js` | Declarations of the cross-cutting settings: theme, ambience, effects, layout. |
| `src/settings/transfer.js` | The panel's "Système" section: copy/download/import/reset the configuration, storage warning. |
| `src/styles/theme.css` | Palette CSS variables (startup values, before the store is first read). |
| `src/styles/base.css` | Module styles: clock, shortcut grid, tiles, avatar, status lines, view prompt. |
| `src/styles/layout.css` | The three-band grid, sizing in `svh`/`vmin`. |
| `src/styles/panel.css` | Styles of the settings panel and the shortcut editor. |
| `src/styles/logo.css` | The four logo treatments. |
| `src/styles/avatars.css` | Styles and animations shared by the eight SVG avatars; sizing shared with the canvas avatars. |
| `src/styles/effects.css` | Implements the five surface effects on the `#overlay` layer and on `#deck`. |
| `tools/serve.py` | Development server: correct MIME types for a PWA, `GET /api/status` route. |
| `tools/status.py` | System probe: IP, battery, Wi-Fi, processor, memory, storage, uptime — each source isolated in its own guarded block. |
| `tools/make_icons.py` | Builds the PNG icons (`pip install pillow` required — the project's only tool that leaves the stdlib, a choice confined to this generator and never run on the phone). Re-run after a change; the PNGs are committed. |
| `icons/*.png` | Application icons (192, 512, 512 maskable), generated by `tools/make_icons.py`. |
| `tools/boot/` | Scripts run at device startup by Termux:Boot — see *Automatic startup*. |

## CIPHER-2: avatar and journal

An ordinary module (`src/modules/cipher.js`) occupies the left band. It draws
nothing itself: it picks an avatar from the registry according to the "Avatar"
setting, mounts it, and shows the journal below. Changing avatar remounts only
the avatar, never the whole module.

| id | Rendering | Description |
|---|---|---|
| `core` | SVG | Wireframe sphere and polyhedral heart in counter-rotation. |
| `halo` | SVG | Rings of short dashes, central sphere, halo — after Jarvis. |
| `halo-live` | SVG | The same, animated: fast rings, radar sweep, pings leaving the core. |
| `wave` | SVG | Oscilloscope: the wave contracts and swells, and rises/falls. No sideways scrolling. |
| `wave-live` | SVG | The same, pushed further: amplitudes in phase opposition, wider oscillation, level bars. |
| `iris` | SVG | A contracting iris, reticle and tick marks. |
| `lattice` | SVG | A node mesh lighting up in cascade, scanning bar. |
| `lattice-live` | SVG | The same, animated: signals run along the edges, brighter nodes, spinning hub. |
| `nexus` | Canvas | 440 points on a sphere, projected in perspective. |
| `nexus-pulse` | Canvas | The same, with a slow breathing of the sphere (~22 s cycle, 54 % measured amplitude). |
| `vortex` | Canvas | 620 particles on a turbulent ring, wire core. |
| `cipher-core` | Canvas | Code rain confined to a disc. |

`wave` lost the reference's sideways scrolling, in **both** versions, in favour
of vertical motion: the wave contracts and swells about its axis and rises and
falls, without ever moving anything sideways. The trace is therefore re-anchored
on the frame — ten arches of 18 units cover exactly x=10 to x=190, five whole
periods, where it used to overflow by 160 units to feed the scroll. The
`clipPath` moved from the viewBox to **the frame's own rectangle** (10,52 to
190,148): whatever the amplitude does, nothing is drawn outside the box — a
guarantee that arithmetic alone held only as long as nobody changed a number.
Measured over a full cycle: `wave` paints between 58.6 and 133.9, `wave-live`
between 61.3 and 140.6, for a frame running from 52 to 148.

`nexus-pulse` is `nexus` identically, with a breathing cycle as its only
addition: the radius traces a cosine over 660 frames, about 22 s at the 30 fps
cap. It **contracts** from its full size and returns to it, rather than growing
beyond — `nexus`'s 0.36 was chosen against the band, and exceeding that value
would push points out of the box on every breath.

Depth, not speed, is the lever on visibility. At a minimum radius of 0.72 the
breathing existed without being seen: 28 % of variation spread over half a minute
changes the radius by a fraction of a percent per second, below the threshold of
perception on a sphere of sparse points. At 0.45, the painted radius measured on
screen runs from 253 to 116 px — **54 % of amplitude** — and the cycle stays
slow.

The rotation of both Nexus avatars was halved (`frame / 280` and `frame / 600`
instead of 140 and 300): one revolution in about a minute on one axis, two on the
other. That is a drift rather than a rotation, which makes it bearable next to a
status column someone is trying to read.

The three `-live` variants exist because the originals are slow by design —
`halo`'s rings take 13 to 34 seconds for one turn — and slow enough reads as
still: measured over 1.7 s, the three moved only 1.25 %, 0.65 % and 0.54 % of
their pixels. They are added alongside the originals, not in their place, and
filed right after the one they are the counterpart of: the choice is between two
tempos of the same avatar, not among eleven unrelated avatars.

The SVG avatars animate only `transform`, `opacity` and `stroke-dashoffset`: the
first two are the compositor's business. The third is not, but it applies to a
dozen short paths and replaces the only other way of running a signal along an
edge — moving the geometry — which would cost a layout pass every frame. Nothing
here animates a property that triggers layout.

All the animations are carried by descendants of `.avatar__svg` or
`.avatar__stage`, so the `prefers-reduced-motion` rule at the bottom of
`avatars.css` reaches them with no extra line. Verified: 9, 17 and 23 active
animations under normal conditions for the three variants, zero under reduced
motion. The canvas avatars hitch onto the same ambience engine as the background
(`src/ambient/engine.js`), with their own frame-rate cap — measured at the left
band's real size on the reference phone (≈ 600 × 380) at between 0.15 and 0.58 ms
per frame depending on avatar and theme, so with headroom to spare even with the
animated background running at the same time.

The journal (under the avatar) shows a few `>`-prefixed lines: boot phrases on
opening, then lines drawn from the deck's real state (low battery, link lost).
**No language model, no network call**: an array of sentences and a selection
rule (`src/core/journal.js`). The "Journal" setting turns it off.

## Logo

Four treatments, all pure text and CSS — no image file:

| id | Treatment |
|---|---|
| `glitch` | Red and cyan fringing, halo, and the word sliced into laterally displaced bands (two bursts per 9 s cycle). |
| `plate` | Black text on a solid block, bevelled corners. |
| `frame` | Spaced lettering, double frame, glow. |
| `major` | Angular, fragmented lettering, after a separate reference image. |

`glitch`'s slicing relies on two copies of the word, superimposed on the original
and each cropped to a horizontal band. Each carries `background: var(--bg)`, and
that opacity is the whole trick: an opaque band that slides **covers** what it
crosses, so the slice reads as displaced rather than duplicated — a transparent
copy would only give a double exposure. `steps(1, end)` on both animations, so
that every keyframe is a hard cut: the default interpolation would slide the
bands smoothly, which is a different thing entirely, a fault having no
intermediate states. Both spend most of the cycle on a band of zero height,
because a permanent disturbance stops being a disturbance and becomes a texture.

The previous effect was an opacity drop at 97 % of a six-second cycle — one frame
every six seconds, indistinguishable from nothing.

The cadence is measured by driving the animation's clock frame by frame rather
than hoping a screenshot loop keeps up with real time: a screenshot costs far
more than the interval separating it from the next one, and a first measurement
made that way covered three cycles while believing it covered one. Over the 9 s
cycle, the cuts fall at 0.3-0.5 s, 1.0-1.2 s and 5.3-5.4 s: a double burst, four
seconds of calm, a lone cut, four seconds of calm. Grouped and not spread out —
evenly spaced faults sound like a metronome, grouped ones sound like a bad
connection.

## System status

A web page knows nothing of the local IP address, processor load, memory, storage
or Wi-Fi state; only the battery is sometimes exposed by the browser. That is why
`tools/serve.py` gains a `GET /api/status` route which returns:

```json
{
  "ts": 1755300000,
  "ip": "192.0.2.42",
  "battery": { "percent": 87, "charging": false, "temperature": 31.2 },
  "wifi": { "ssid": "…", "rssi": -47, "link_speed": 433 },
  "cpu": { "load": 0.34 },
  "memory": { "used_mb": 2841, "total_mb": 5734 },
  "storage": { "free_gb": 37.1, "total_gb": 58.0 },
  "uptime_s": 184922
}
```

`tools/status.py` queries each source in its own guarded block: a missing or
failing command sets its field to `null` without stopping the others from
answering. **Only `battery` and `wifi` depend on `termux-api`**
(`termux-battery-status`, `termux-wifi-connectioninfo`) — `ip`, `cpu`, `memory`,
`storage` and `uptime_s` read `/proc`, `ip -j addr`/`ifconfig` and
`shutil.disk_usage`, available with Termux alone.

**Uptime is computed, not read.** With `/proc/uptime` denied on Android, the
probe falls back to `/proc/self/stat`: a process can always read its own entry,
whose 22nd field is the instant it started, in ticks since boot. The server adds
its own lifetime to that and obtains the same number without ever touching a
forbidden path. The direct read still takes priority, so nothing changes where it
works; measured on a desktop machine, the two methods agree to the second. The
parsing splits on the **last** `)` rather than on whitespace: field 2 is the
executable's name in parentheses and may contain spaces and parentheses, the one
case that makes a naive split read the wrong field.

`src/modules/status.js` polls that route every 10 s by default (settable) and
shows one line per datum, each independently hideable.

**Degraded mode.** The link line switches to `OFFLINE` as soon as a request fails
— immediately, not after three attempts — or, without a single failure, as soon
as a snapshot exceeds three times the interval with no fresh response having
arrived in the meantime. In both cases the module does not empty itself: it keeps
the last known values, marks them with their age (`> AGE   42s`), and switches
the link line to `OFFLINE`. The battery then falls back to the browser API if it
exists (`(NAV)` marker in the line). A stopped server degrades the display, it
does not erase it — the same rule as for a corrupted configuration.

### What the device confirmed, and what it will not give

`termux-battery-status` and `termux-wifi-connectioninfo` were verified on the
device: percentage, charging state, temperature, RSSI and link speed all answer.
The SSID additionally requires the location permission granted to Termux:API
(Android has reserved it for location-aware apps since version 9, a network's
name being enough to infer a place); once granted, it comes through.

Two readings are **not** obtained, and will not be:

- **Processor load.** SELinux grants `/proc/meminfo` to an unprivileged app and
  denies it `/proc/stat` and `/proc/loadavg` — a denial confirmed on the device
  by an audit entry (`avc: denied { read } … app=com.termux`). Android exposes no
  equivalent public API. So the line is off by default rather than showing a
  permanent `N/A`; the setting remains, the probe working on a desktop machine
  and on a rooted phone.
- **`/proc/uptime`**, denied for the same reason — but that one is worked around,
  see above.

## Settings

The ⚙ button, bottom right. The panel is generated from declarations; here is
what each section actually controls, in the order it appears. Section and option
names are given as they appear on screen, in French.

**Thème** (theme) — Palette (Matrix / Night City / Arasaka); Teinte, the hue
(0-359°, an "auto" position to return to the palette's native hue). Only the ink
rotates, the background stays the palette's.

**Ambiance** (ambience) — Fond animé, the animated background (on/off); Portée,
its scope ("Colonne" confines the rain to the right band, the default; "Plein
écran" extends it behind the whole interface — full Matrix mode, which brings
back the cost the first design warned against); Densité, Vitesse, Traînée
(density, speed, trail); Glyphes (Katakana / hexadecimal / ASCII); Résolution (a
multiplier on CSS pixels, never on the screen's ratio); Images/s (frame-rate cap,
10 to 60).

The rain has its own colour, `--rain`: the theme's `--fg` hue shifted 14° round
the colour wheel and darkened to 70 % of its lightness (`RAIN_HUE_SHIFT` and
`RAIN_LIGHTNESS`, in `theme.js`). In Matrix that gives `#00b357` against the
text's `#00ff41` — another shade of the same family, not a second colour
competing for attention. Without that gap the rain borrowed exactly the text
colour and merged into it as soon as it passed behind the status column.

It is computed rather than hard-coded three times: the arithmetic is the same in
every palette, and above all it is derived from the `fg` **after** rotation, so
the gap survives the Teinte slider — which brings every rotated key back onto the
single chosen hue, and would therefore have aligned the rain with the text had it
figured in that list. The glyphs keep 15 % transparency (`GLYPH_ALPHA`, in
`rain.js`), just enough to soften their edges; the separation comes from the
colour.

**Effets** (effects) — five switches, actually wired since this redesign
(declared in the panel long before, they did nothing):

| Effect | What it does on screen |
|---|---|
| Scanlines | Repeated horizontal bands, CRT-monitor style. A single layer painted once, never animated. |
| Grain | A faint noise texture (SVG turbulence), tinted by the theme colour. |
| Vignettage | Darkens the screen's edges towards the theme's background colour. |
| Lueur | A glow (`text-shadow`) on the logo and the time only, and off by default. Both are big enough to carry it; on 10 px text the glow fills the inside of the letters instead of surrounding them, which made the status lines and the journal unreadable. |
| Glitch | Every ~4 s, a brief positional shift and an opacity flicker, on the logo and the clock only. |

**Disposition** (layout) — Three separate ink settings, all white by default, all
switchable to the theme colour: **Encre**, **Encre du logo**, **Encre de
l'avatar** (ink, logo ink, avatar ink). The first paints everything that is
*content* without being one of the other two: the header (barcodes and code
groups), the time and date, and the coarse row of the footer's ribbon. What
belongs to the *structure* — frame, brackets, gauge, rules, the ribbon's fine row
— keeps the palette colour, whatever the setting. That is the split from the
reference photo, where the content is white and the chassis green.

White is a literal value: "something other than the palette colour" has no answer
*within* the palette. Three tokens and not one (`--ink`, `--logo-ink`,
`--avatar-ink`, in `theme.css`) because the logo and the avatar are precisely the
two elements one wants to distinguish — from the rest of the deck, and from each
other.

The canvas avatars do not read a CSS variable: they paint with a colour string.
So only the avatar ink is also written into the palette object
(`colors.avatarInk`, in `main.js`) — the other two are read by stylesheets only,
and adding them there would mean two more values to keep in step with the
attributes, with no reader. Since `engine.js` re-reads `getColors()` every frame,
they follow with nothing more. Mind the trap: `resolveTheme` returns a fresh
object, so changing palette erases the ink written on the previous one —
`applyInk` is called again right after, failing which the canvas avatars would
stay on the old palette's colour until the next layout change.

Shortcut grid columns: **Auto** by default, or 2, 3, 4. In Auto, `bestFit` (in
`shortcuts.js`) tries every possible column count, computes for each the
resulting tile size — the smaller of the two constraints, width and height — and
keeps the one giving the largest tiles. A fixed number is honoured as given, only
its size being computed; if the band is too narrow to draw it legibly it falls
back to what the band can carry.

It is a computation and not a CSS rule because that is what it is: choosing
columns means comparing, for each candidate, the resulting size against both
dimensions at once. The old grid looked only at the width and kept the tiles
square through `aspect-ratio`, so its height was whatever the width implied — past
a few shortcuts, it overflowed the band and the column scrolled. The grid now
scrolls in one case only: when fitting everything in would take the tiles below
their minimum size. A tile too small to touch, or too small for its own label, is
worse than a scrollbar.

That minimum is 3.5 rem (56 px), not the 44 px of the touch target: a finger
reaches 44 px, but the tile cannot draw itself there — its icon and its label hit
their own legibility floors and overflow it, and the overflow of a grid item
propagates up to the band. The touch target is a floor beneath this one, not the
other way round.

Also: Taille de l'horloge, the clock size (Petite / Moyenne / Grande — a scale on
the clock+date line, more a composition element); Style du logo (the four
treatments above).

**CIPHER-2** — Avatar (the twelve above); Journal (on/off).

**Chrono** (timing) — Afficher les secondes, show seconds (on/off). The time is
always 24 h and the date always `DD/MM/YYYY`; neither is settable. The date is
assembled from the local accessors rather than by `toLocaleDateString`, whose
result would follow the phone's locale.

**État système** (system status) — Interval in ms (2,000 to 60,000); one checkbox
per line (IP, battery, Wi-Fi, processor, memory, storage, uptime — hidden by
default — and link state).

**Raccourcis** (shortcuts) — no checkbox: a built-in editor (icon, label, target
on its own line, arrows to reorder, a cross to delete, a button to add).

**Système** (system, at the bottom of the panel, outside any module) — copy or
download the configuration, import one, reset everything. See *Backup*.

## Shortcuts

**Defaults, from the very first launch:**

| Label | Target |
|---|---|
| YT Music | `https://music.youtube.com/` |
| Météo | `https://meteofrance.com/` |
| Actu | `https://news.google.com/` |
| Termux | `intent://#Intent;package=com.termux;end` |

The ids (`yt-music`, `meteo`, `actu`, `termux`) are fixed literals in
`defaults()`, not generated: two installations start from the same state,
identically.

**Targets.** The "target" field is handed to the system without interpretation,
except for the `javascript:`, `data:`, `vbscript:` and `file:` schemes, which are
refused. That refusal is applied at the level of the configuration itself
(`validateShortcut`, in `schema.js`), so uniformly whatever the target's origin —
creation, later edit of an existing shortcut, or import of a whole configuration:
a shortcut carrying one of those schemes is simply dropped from the list, never
displayed.

| Form | Example | Note |
|---|---|---|
| Full URL | `https://music.youtube.com/` | Always reliable — the first three default shortcuts. |
| Bare domain | `youtube.com` | `https://` is added automatically only when creating a shortcut from the editor (`normalizeTarget`); editing an existing target writes it as-is, without that prefix. The default targets are already written in full. |
| App link | `https://open.spotify.com/…` | Android opens the native app if it is installed and the link is declared for it. The recommended route. |
| App scheme | `spotify:track:…` | Depends on the installed app. |
| Android intent | `intent://#Intent;package=com.termux;end` | The default "Termux" shortcut is the test of this. Unverified: whether it works from a PWA installed in standalone mode has not been confirmed. |

## Backup

The whole configuration lives in **a single key** of Chrome's local storage
(`cyberdeck.config.v1`). **Clearing the cache or reinstalling erases it without
warning.** The panel's "Système" section offers two ways out: "Copier la
configuration" (clipboard, the main route) and "Télécharger" (download, a
fallback if the clipboard fails). **That is the only backup there is** — use it
after any run of changes to the settings or the shortcuts.

## Installing on the phone

1. Install **Termux from F-Droid**. The Play Store version is abandoned and
   receives no more packages.
2. Install **Termux:API from F-Droid** as well — the companion app, separate from
   Termux itself. Without it, the `termux-*` commands installed in the next step
   exist but return nothing: no visible error, just a `null` field in
   `/api/status`.
3. In Termux:
   ```sh
   pkg update && pkg install python openssh rsync termux-api
   ```
4. Start Termux's SSH server (`sshd`), note the user name (`whoami`) and the IP
   address (`ifconfig`), then from the workstation:
   ```sh
   rsync -av --delete -e 'ssh -p 8022' gui/ <user>@<ip>:~/cyberdeck-gui/
   ```
   Termux's SSH port is 8022, not 22 — hence the `-e 'ssh -p 8022'`: the
   `host:port:path` form does not exist for `rsync`, which splits the target on
   the colon and would read `8022` as a directory. Network-free alternative: copy
   the folder over a cable with MTP.
5. In Termux, from `~/cyberdeck-gui`:
   ```sh
   ./serve.sh
   ```
6. In Chrome, open `http://localhost:8080`.
7. Chrome's menu → "Install app".

## Updating, and how the server runs

**The server now has to run permanently.** This reverses what the first version
of this README claimed: it is no longer a file server you start to install or
update and then shut down. The status column polls `/api/status` continuously,
and that route only exists while `tools/serve.py` is running.

With the server off, the page still opens, full screen, from the service
worker's cache — the installation stays usable. But the status column shows its
last known values with their age, and the link line goes to `OFFLINE` on the
first failed request (immediately, then — the three-interval rule applies only to
silence without an explicit failure, see *System status*). That is not a fault:
it is the degraded mode documented above, which triggers whenever Termux is not
running.

**The worker goes to the network first, the cache second.** It used to be the
other way round, and cache-first was simply the wrong policy here: the server
runs on the same device, on `127.0.0.1`, over the loopback interface. There is no
latency to save and no bandwidth to spare, so preferring the cache bought nothing
— at the cost of the only thing that matters, namely that the files on disk are
the ones you see. Every change required a `CACHE_VERSION` bump **plus** a second
load, and getting either wrong gave a page mixing new and old files.

So the cache is now consulted only when there is no server to ask — the case it
exists for: the deck opens before Termux has been started. Verified with the
server fully stopped: logo, avatar, clock and shortcuts all appear, and the
verdict announces of its own accord "Link lost, running blind, Operator." It
refreshes on every successful response, so the offline copy follows the running
version rather than the one frozen at install time. Only 200s are stored: caching
a 404 would serve it indefinitely. `/api/status` is excluded — a stale reading
served offline would not be a degraded answer but a false one, and `status.js`
already has its own degraded mode for that failure.

### Automatic startup

`tools/boot/` holds the scripts **Termux:Boot** runs when the device starts.
Install the add-on from F-Droid, **open it once by hand** (it does not arm
otherwise), then, in Termux:

```sh
sh ~/cyberdeck-gui/tools/boot/install.sh
```

They read from the deck's own directory rather than from `/sdcard`, by design:
Termux has no guarantee of access to shared storage. On the reference device
(MIUI) it was granted `WRITE_EXTERNAL_STORAGE` and **denied**
`READ_EXTERNAL_STORAGE` — a script placed in `/sdcard/Download` was therefore
unreadable, where the deck's files, in Termux's private directory, always are.

`10-deck-server.sh` takes a `termux-wake-lock` before launching the server:
without that lock, Android puts the process to sleep as soon as the screen goes
off and the deck no longer answers on wake. Termux's **autostart** must also be
enabled in the OEM's settings, without which nothing will wake it at boot. (The
power-saving exemption was already granted on the reference device.)

`20-deck-launch.sh` opens the deck twelve seconds later, and that is the fragile
half: Android 10+ restricts launching an activity from the background, and OEM
skins gate it behind a permission of their own (on MIUI, "display pop-up windows
while running in the background"). If nothing opens, deleting that file leaves the
server to start on its own. Install the PWA **before** testing this script: once
the WebAPK is in place the URL opens in the app, full screen; without it, it
would open in Chrome with its address bar.

The script's `WEBAPK_PKG` is empty on purpose. Chrome mints the WebAPK's package
name from a hash of the manifest, so it belongs to one install and is re-minted
whenever the manifest changes; read yours with `adb shell pm list packages | grep
webapk`. Left empty, the script falls back to the ambiguous open, which works
once the chooser has been answered with "always".

To publish a code update:

1. Redeploy the changed files (`rsync`, see above) and restart `./serve.sh` if
   the server had been stopped.
2. Open the app. It reloads itself once as soon as the new worker takes over
   (`controllerchange`, in `main.js`), so the update applies on the first launch
   and not the next.

Without that reload, `skipWaiting()` + `clients.claim()` had the new worker adopt
the page while it was already running the previous version's HTML, CSS and
modules — nothing replaced them before the next navigation. This was not
theoretical: we obtained a page holding a new `registry.js` (a file the old worker
had never cached, so served from the network) next to an old `avatars.css` (a file
it had), and therefore avatars whose animations simply did not exist in the
stylesheet. The guard matters: `clients.claim()` also fires `controllerchange` on
the very first visit, when the page started with no controller, and reloading
there would be a reload on every first visit, for nothing.

One nuance: the automatic reload cannot help the transition *to* the version that
introduces it, since it is the old page that is running at that moment and it does
not yet contain the listener. It counts from the following update onwards.

`CACHE_VERSION` no longer governs whether an update is visible; it only names the
offline copy, to be bumped only to discard it deliberately. That was not always
the case, and the trap is worth remembering: `cache.addAll()` goes through the
browser's HTTP cache, and `tools/serve.py` used to send `Cache-Control` on `sw.js`
only, so the browser applied its heuristic caching to the rest and the worker
faithfully copied stale files into a cache bearing the new version name. Symptom:
`caches.keys()` announces `cipher2-v25` and the screen still shows the previous
version. Fixed on both sides — `no-cache` on every file served, and a precache
built on `Request(url, { cache: 'reload' })` so the worker stays correct whatever
server is in front of it.

## Tests

```sh
node --test "gui/test/**/*.js"
```

No npm dependency. `python3` must be on the `PATH`: some tests launch the real
`tools/serve.py` as a subprocess and query it over HTTP rather than simulating
the server.

**Covered automatically**: the configuration and its validation (including the
four default shortcuts), the store and its degraded modes, the theme's colour
conversions, the module registry (mount band, view cycle, tolerance of modules
that throw), the avatar registry (all of them, agreement with the schema,
SVG/canvas contract), the clock, the logo, the rain and the ambience engine
(frame-rate cap, resizing, off-screen suspension), the five surface effects
(configuration → CSS classes), the parsing and staleness of the `/api/status`
telemetry, the settings panel (declarations, enabling/disabling a module), export
and import, and the agreement between the files actually served and `sw.js`'s
precache list.

The `/api/status` route and `tools/serve.py` itself are covered **as a black box
from Node** (`test/api.test.js`, `test/serve.test.js`): the real Python process is
launched and queried over HTTP, never simulated. **`tools/status.py`, the
collector, has no unit tests of its own** — its functions (`battery()`, `wifi()`,
`cpu()`…) are exercised only indirectly, through the full JSON response those
black-box tests observe. On a development machine the `termux-*` commands do not
exist, so only the degraded path (`null` field) is really exercised by the suite;
the populated path is exercised only on the phone (see *System status*).

**Not covered automatically**, as in the first version: rendering, the DOM, the
canvas, actually opening a target, and everything `termux-api` returns once
really installed. Hence the list below.

## Manual checks

To be run again after any change touching rendering:

- [ ] The page opens full screen from the home-screen icon.
- [ ] The landscape fit holds at several screen sizes (at least the reference
      phone and a much larger window): band and footer always visible, nothing
      pushes the footer off screen.
- [ ] The background rain runs smoothly; the phone does not heat up after ten
      minutes.
- [ ] "Ambiance" scope: "Colonne" confines the rain to the right band; "Plein
      écran" (full Matrix mode) extends it behind the whole interface.
- [ ] Lowering Résolution and Images/s visibly lightens the animation.
- [ ] Screen off then on again: the animation had stopped and resumes.
- [ ] Changing palette repaints everything, including the tiles and the avatars.
- [ ] The hue slider changes the ink and leaves the background black; "auto"
      returns to the native hue.
- [ ] Each CIPHER-2 avatar selects, mounts and unmounts cleanly (no orphaned
      animation or canvas after repeated changes).
- [ ] CIPHER-2's journal goes off with its setting.
- [ ] Each effect acts immediately and visibly: scanlines, grain, vignette, glow,
      glitch.
- [ ] View switching works both from the keyboard (`Enter` from the status,
      `Escape` from the shortcuts) and by touch (tapping the prompt at the foot of
      the view) — both must produce the same result.
- [ ] `Enter` typed in a settings-panel field stays usable for typing and does
      not switch the view behind the panel.
- [ ] Status column: stop the Termux server and observe the degraded mode — last
      values kept, age shown, link line on `OFFLINE`, screen never emptied.
- [ ] A long press on a tile opens the panel on that tile's field.
- [ ] A short tap on a tile opens the target, without opening the editor or
      changing view.
- [ ] The arrows reorder the shortcuts; the cross deletes one.
- [ ] Disabling a module removes it from the screen and keeps its settings;
      re-enabling it restores its original position, not the end of the list.
- [ ] Reloading the page preserves the whole configuration.
- [ ] "Copier la configuration" then "Importer" restores the same state.
- [ ] Importing `{ broken` shows a refusal and changes nothing.
- [ ] Stop Termux, force-close the app, reopen it: it opens from the cache, status
      column in degraded mode from the start.

## Still unverified

Two points cannot be checked from a development machine, and are marked as such
where they appear above:

1. **Installing from `localhost`** — whether Chrome accepts installing this page
   as an app from a `localhost` address. See *Installing on the phone*.
2. **`intent://` in standalone mode** — whether an `intent://` target opens from
   the app installed in standalone mode. The default "Termux" shortcut is the
   test. See *Shortcuts*.
