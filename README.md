# Cue/Playlist to Text Converter

A small desktop app (Tauri, no browser needed) that turns a cue sheet or playlist into a text tracklist or a CSV file with the total run time.

It was built to save the typing when adding a release to Discogs. Discogs does not allow other programs to create new releases, so the app prepares the text and you paste it into the Add Release page (for example through the Discogs Edit Helper extension's Tracklist Import).

## Using the app

1. Open a file (button or drag and drop), or just paste text with Ctrl+V (Cmd+V on a Mac).
2. Check the table. Click any cell to fix it, or press x to drop a track. The total run time shows next to the track count.
3. Pick the numbering you want: `1, 2, 3`, vinyl sides, or multiple discs. For sides or discs, type how many tracks are on each, for example `5, 5`.
4. Press **Copy** or **Save as text**, or press **Save CSV**.

**Save CSV** writes these columns, with a **Total Run Time** row at the bottom:

```
Track Number,Artist,Song Name,Track Length
1,Example Artist,Opening,3:45
2,Example Artist,Second Light,4:24
,,Total Run Time,8:09
```

Every row gets an artist (the album artist fills any gap) and a length. Track numbers follow the numbering option, so vinyl sides come out as A1, A2, B1. If a track has no length, the total leaves it out and the app tells you.

The default text output looks like `1 - Title 3:45`, which matches the shape shown in the Discogs Edit Helper's documentation. If a line is not picked up as you expect, try the `1. Artist - Title` style.

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

The interface is plain HTML, CSS and JavaScript in `src/` with no build step. All the parsing and output formatting lives in `src/engine.js`, which is tested by `tests/engine.test.js` against the files in `samples/`. The Rust side (`src-tauri/src/main.rs`) only opens the window and writes the file chosen in the Save dialog.

To change the icon, replace `app-icon.png` (1024 x 1024, a transparent background works well) and run `npm run icons`. The app identifier is set in `src-tauri/tauri.conf.json` (`dev.tracklisttool.discogs`); change it before shipping if you want your own.

The window and release title use the name with a slash. The installed app and installer files are called "Cue Playlist to Text Converter", because a slash cannot be part of a file name (`productName` in `tauri.conf.json`).

## Releasing

The workflow in `.github/workflows/release.yml` runs the tests, builds for Windows, macOS (Apple Silicon and Intel) and Linux, and puts everything on a **draft** release. It never publishes by itself.

1. Set the version everywhere: `npm run bump -- 0.2.0`
2. Update `RELEASE_NOTES.md` for the new version.
3. Commit, tag and push: `git commit -am "Release v0.2.0"`, `git tag v0.2.0`, `git push && git push --tags`
4. When the run finishes, open **Releases** on GitHub, check the draft and its files, and press **Publish release**.

You can also start it from the **Actions** tab with **Run workflow**. The tag is always `v` plus the version in `tauri.conf.json`, and a pushed tag that does not match is rejected. The draft's description is filled from `RELEASE_NOTES.md`, so you can edit it on GitHub before publishing.

If the run fails with a permissions error, go to **Settings, Actions, General, Workflow permissions** in the repository and choose **Read and write permissions**.

The builds are not code signed. The release notes explain the first-launch warnings on Windows and macOS. Signing needs your own certificates; see the Tauri signing guides if you want to add it later.
