## Cue/Playlist to Text Converter v0.1.0

First release. Open a cue sheet or playlist and get a text tracklist, or save it as a CSV with the total run time. No retyping track names.

### What it does

- Reads **CUE**, **M3U / M3U8**, **PLS**, **XSPF**, **JSPF**, **WPL / ZPL / SMIL**, **ASX**, **B4S**, **MPCPL**, **iTunes / Apple Music library XML**, **CSV / TSV** and plain text lists. Open a file, drop it on the window, or paste text with Ctrl+V (Cmd+V on a Mac).
- Works out track lengths from cue sheet index points, or reads them from extended M3U, PLS, XSPF and the other formats that store them.
- **Save CSV** writes `Track Number, Artist, Song Name, Track Length` with a **Total Run Time** row at the bottom. It opens correctly in Excel, including accented characters.
- Copy or save a plain text tracklist (`1 - Title 3:45`, `1. Title 3:45`, or tab separated), numbered the way Discogs expects: `1, 2, 3`, vinyl sides (`A1, A2, B1`), or multiple discs (`1-1, 1-2, 2-1`).
- Shows the total run time next to the track count and keeps it current as you edit.
- Pulls the album artist, album title, year, genre and barcode out of the file when it has them, with a Copy button for each.
- Lets you fix any artist, title or length in the table, and remove tracks, before you copy or save.
- Handles UTF-8, UTF-16 and older Windows-1252 files.

- **Help > About** shows the credits for the open source software the app is built on, who made it, and a PayPal link if you would like to support it.
- **Automatic updates.** The app checks GitHub for a newer version when it starts and offers to install it with one click. Turn this off in **Help > About**, and use **Help > Check for Updates** whenever you like. Updating works with the Windows installer (`.exe`), the macOS app and the Linux AppImage; `.msi`, `.deb` and `.rpm` installs need to be updated by hand.

### Using it with Discogs

Discogs does not let other programs create new releases, so paste the text into the Add Release page. It is designed to pair with the Discogs Edit Helper browser extension, whose Tracklist Import accepts pasted text.

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
- **macOS:** drag the app to Applications, then right-click it and choose **Open**. If macOS still refuses, run `xattr -dr com.apple.quarantine "/Applications/Cue Playlist to Text Converter.app"` in Terminal.
- **Linux:** run `chmod +x` on the AppImage, then double-click it.

### Known limits

- A cue sheet does not store the length of the last track. Type the total disc length into the options and it is calculated for you.
- A cue sheet that points to a separate audio file per track has no timing information, so lengths have to be filled in by hand or taken from an extended M3U. The CSV total leaves out any track without a length and the app says so.
- Positions typed in a plain text list are only trusted when they look like a track sequence, so a title such as "99 Luftballons" is not mistaken for track 99.
