# Lirelo

Your reading, all together.

This is the working, local-first Lirelo application, built from the approved Library, Book Details, Reader, Highlights, Notes, Bookmarks, Tags, Trash, Settings and Account screens.

The app runs on your computer. It stores imported PDF and EPUB documents in a local document library and uses PyMuPDF to render their real pages. The design follows the approved Lirelo prototype, including Iconsax Linear icons and light and dark appearance options.

## Run on Windows

1. Extract the complete ZIP into a folder. Keep the folder together.
2. Install Python 3.11 or newer if your computer does not have it. During installation, enable the option to add Python to PATH.
3. Double-click `start-lirelo.cmd`. The script installs the required PDF/EPUB engine the first time.
4. When the terminal displays `Lirelo local app`, open `http://127.0.0.1:8765` in your browser.
5. Keep the terminal running while you use Lirelo. Close it to stop the service.

If you prefer a terminal, use:

```powershell
py -m pip install -r requirements.txt
py server.py
```

On macOS/Linux, run `./start-lirelo.sh` and open the same address.

## Use Lirelo

Open **Library** and choose **Add Books**. Select a PDF or EPUB from your computer. Lirelo imports its file, title, author, page structure and table of contents. Imported books persist after you restart the service.

Open **Book Details** to inspect a book and set its collection and tags. Choose **Start Reading** to enter the Reader.

The Reader supports scroll/swipe modes, PDF and EPUB page rendering, images and scanned PDF pages, chapter navigation, within-book text search, page jumps, bookmarks, notes, selected-text highlights and reading progress. EPUB books support reflow, font size and serif/sans choices. PDF typography stays faithful to the file.

Open **Settings** to choose Warm, Light, Lilac or Dark for the workspace and White, Paper or Dark for reading pages. A per-book page choice takes priority over the workspace default.

Highlights, Notes and Bookmarks show your saved reading activity across books. Tags groups books by topic. Trash supports restoring a removed book and permanent file deletion after confirmation.

## Local data and backups

- `data/library.sqlite3` stores book metadata, collection, tags, progress and Trash status.
- `data/books/` stores the original PDF and EPUB files. The application creates this folder automatically.
- Your browser's local storage holds reading annotations, profile details, theme settings and some preferences.
- **Settings > Export backup** downloads a JSON copy of the browser-side reading records. It does not include original PDF/EPUB files. Back up the `data` folder separately to preserve your complete book library.

Do not move or delete the `data` folder if you want to keep your imported files.

The local service listens only on `127.0.0.1`. It does not provide online accounts, public hosting or multi-device synchronisation. Scanned image-only pages display as images, without OCR-based text search or selection.

## Project files

- `index.html`: approved screen markup.
- `assets/style-*.css`: separated styling, including responsive and dark modes.
- `assets/script-*.js`: Library, Book Details, Reader, Highlights, Notes, Bookmarks, Settings, Account, Tags and Trash interactions.
- `assets/bridge.js`: connection between the approved interface and the local library API.
- `server.py`: persistent library API, SQLite storage, PDF/EPUB rendering, search and EPUB reflow.
- `samples/`: original demo PDF and EPUB documents for testing.
- `qa_engine.py`: automated document-engine checks.
- `qa_report.json`: record of the checks completed for this handover.
- `references/`: the previously approved design references.

## Verification

The package passed 22 backend/document checks, including PDF and EPUB imports, scanned-PDF handling, search, EPUB reflow, book metadata, Trash, restoration, permanent deletion and persisted documents after a service restart.

Chromium UI tests covered Library, Book Details, Reader, PDF page display, notes, bookmarks, text highlights, dark page tone, Settings and the tablet/mobile layouts. The browser environment blocks direct local URL navigation, so the visual tests loaded the same UI code into Chromium and connected API requests to the running local service. No JavaScript errors remained in the final interaction checks.

## Deployment

This is a local application. It has not been pushed to GitHub or deployed to Vercel. Public hosting and multi-user sign-in require a separate deployment and security plan. Do not expose the local Python service directly to the internet.
