# Discogs Tracklist Tool

A small desktop app (Tauri, no browser needed) that turns a cue sheet or playlist into a tracklist you can paste into Discogs.

Discogs does not allow other programs to create new releases, so this tool does the typing-heavy part: it reads your file, works out positions, artists, titles and lengths, and gives you text to paste into the Add Release page (for example through the Discogs Edit Helper extension's Tracklist Import).

## Using the app

1. Open a file (button, drag and drop, or paste text anywhere in the window).
2. Check the table. Click any cell to fix it, or press x to drop a track.
3. Pick the numbering you want: `1, 2, 3`, vinyl sides, or multiple discs. For sides or discs, type how many tracks are on each, for example `5, 5`.
4. Press **Copy** and paste into Discogs.

The default output looks like `1 - Title 3:45`, which matches the shape shown in the Edit Helper's documentation. If a line is not picked up as you expect, try the `1. Artist - Title` style.

### Supported files

| Format | Extensions | Lengths read from file |
| --- | --- | --- |
| CUE sheet | `.cue` | Yes, from index points (last track needs the total length) |
| M3U / M3U8 | `.m3u`, `.m3u8` | Yes, when extended (`#EXTINF`) |
| PLS | `.pls` | Yes |
| XSPF / JSPF | `.xspf`, `.jspf` | Yes |
| Windows Media / Zune / SMIL | `.wpl`, `.zpl`, `.smil` | Yes, when present |
| ASX | `.asx`, `.wax`, `.wvx` | Yes, when present |
| Winamp | `.b4s` | Yes |
| MPC-HC | `.mpcpl` | No (file names only) |
| iTunes / Apple Music XML | `.xml`, `.plist` | Yes. Pick a playlist if there are several |
| CSV / TSV (including Apple Music text export) | `.csv`, `.tsv`, `.tab` | Yes, when a time column exists |
| Plain text | `.txt` or pasted | Yes, `3:45` at the end of a line |

Files with no titles, only paths, use the file names. Leading track numbers are removed and `Artist - Title` is split when most lines look like that (you can force it on or off).

## Developing

You need Node 20 or newer and Rust. On Linux, also install the Tauri system libraries (see the Tauri prerequisites page: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `libssl-dev`).

```bash
npm install
npm test          # parser and formatter tests
npm run dev       # run the app
npm run build     # build installers for your own system
```

The interface is plain HTML, CSS and JavaScript in `src/` with no build step. All the parsing lives in `src/engine.js`, which is tested by `tests/engine.test.js` against the files in `samples/`. The Rust side (`src-tauri/src/main.rs`) only opens the window and writes the file chosen in the Save dialog.

To change the icon, replace `app-icon.png` (1024 x 1024) and run `npm run icons`. The app identifier is set in `src-tauri/tauri.conf.json` (`dev.tracklisttool.discogs`); change it before shipping if you want your own.

## Releasing

The workflow in `.github/workflows/release.yml` runs the tests, builds for Windows, macOS (Apple Silicon and Intel) and Linux, and puts everything on a **draft** release. It never publishes by itself.

1. Set the version everywhere: `npm run bump -- 0.2.0`
2. Update `RELEASE_NOTES.md` for the new version.
3. Commit, tag and push: `git commit -am "Release v0.2.0"`, `git tag v0.2.0`, `git push && git push --tags`
4. When the run finishes, open **Releases** on GitHub, check the draft and its files, and press **Publish release**.

You can also start it from the **Actions** tab with **Run workflow**. The tag is always `v` plus the version in `tauri.conf.json`, and a pushed tag that does not match is rejected. The draft's description is filled from `RELEASE_NOTES.md`, so you can edit it on GitHub before publishing.

If the run fails with a permissions error, go to **Settings, Actions, General, Workflow permissions** in the repository and choose **Read and write permissions**.

The builds are not code signed. The release notes explain the first-launch warnings on Windows and macOS. Signing needs your own certificates; see the Tauri signing guides if you want to add it later.
