## Discogs Tracklist Tool v0.1.0

First release. Open a cue sheet or playlist and get a tracklist you can paste into Discogs, without retyping every track.

### What it does

- Reads **CUE**, **M3U / M3U8**, **PLS**, **XSPF**, **JSPF**, **WPL / ZPL / SMIL**, **ASX**, **B4S**, **MPCPL**, **iTunes / Apple Music library XML**, **CSV / TSV** and plain text lists.
- Works out track lengths from cue sheet index points, or reads them from extended M3U, PLS, XSPF and the other formats that store them.
- Pulls the album artist, album title, year, genre and barcode out of the file when it has them, with a Copy button for each.
- Numbers tracks the way Discogs expects: `1, 2, 3`, vinyl sides (`A1, A2, B1`), or multiple discs (`1-1, 1-2, 2-1`).
- Leaves the artist off each track when every track has the same one, and flags tracks that are missing an artist.
- Lets you fix any artist, title or length in the table, and remove tracks, before you copy.
- Handles UTF-8, UTF-16 and older Windows-1252 files.
- Output styles: `1 - Title 3:45`, `1. Title 3:45`, tab separated, or CSV. Copy it or save it as a file.

### Using it with Discogs

Discogs does not let other programs create new releases, so this tool prepares the text and you paste it into the Add Release page. It is designed to pair with the Discogs Edit Helper browser extension, whose Tracklist Import accepts pasted text.

### Download

| Your computer | File to download |
| --- | --- |
| Windows | the file ending in `_x64-setup.exe` (or the `.msi` if you prefer an MSI) |
| Mac with Apple Silicon (M1 and newer) | the `.dmg` with `aarch64` in the name |
| Mac with an Intel chip | the `.dmg` with `x64` in the name |
| Linux | the `.AppImage` (make it executable first), or the `.deb` / `.rpm` |

### Opening the app the first time

These builds are not code signed, so your computer may warn you once.

- **Windows:** if SmartScreen appears, choose **More info**, then **Run anyway**.
- **macOS:** drag the app to Applications, then right-click it and choose **Open**. If macOS still refuses, run `xattr -dr com.apple.quarantine "/Applications/Discogs Tracklist Tool.app"` in Terminal.
- **Linux:** run `chmod +x` on the AppImage, then double-click it.

### Known limits

- A cue sheet does not store the length of the last track. Type the total disc length into the options and it is calculated for you.
- A cue sheet that points to a separate audio file per track has no timing information, so lengths have to be filled in by hand or taken from an extended M3U.
- Positions typed in a plain text list are only trusted when they look like a track sequence, so a title such as "99 Luftballons" is not mistaken for track 99.
