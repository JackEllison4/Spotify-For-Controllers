# Spotify for Controllers

This Project was done with AI. I can't be arsed to do GUI stuff and I have to much School Stuff to do. So AI was used to fix a annoyance I have had. Is there bugs. Absolutely. So put in a issue and I will get round to fixing it eventually. 



A TV-friendly, big-screen Spotify client designed to be controlled entirely with a gamepad (Xbox controller).

Works across **Windows**, **Linux** (including Steam Deck / SteamOS), and as a **standalone website** in any modern browser (including Microsoft Edge on Xbox consoles).

---

## Pre-Built Downloads (No Coding Required!)

If you just want to install or run the app without messing with source code, grab the pre-built releases directly:

* **Windows**:
  * **[Download Setup Installer (.exe)](https://github.com)** — standard one-click Windows installer with desktop and Start Menu shortcuts.
  * **Portable Executable** — available in the [Releases](https://github.com) section (runs instantly without installation).
* **Linux** (Ubuntu, Debian, Fedora, Arch, SteamOS / Steam Deck):
  * **AppImage**: Download `SpotifyForControllers-1.0.0.AppImage`
    ```bash
    chmod +x SpotifyForControllers-1.0.0.AppImage
    ./SpotifyForControllers-1.0.0.AppImage
    ```
  * **Debian / Ubuntu / Mint / Pop!_OS package**: Download `.deb`
    ```bash
    sudo dpkg -i spotify-for-controllers_1.0.0_amd64.deb
    ```

---

## Platforms & How to Run

### 1. Windows (Desktop App)
- **Install from Pre-Built:** Run `SpotifyForControllers Setup 1.0.0.exe` from `dist/` or Releases.
- **Run from Source:**
  ```bash
  npm install
  npm start
  ```
- **Build Windows Executable Yourself:**
  ```bash
  npm run build
  ```

---

### 2. Linux (Desktop App & Steam Deck)

Spotify for Controllers has full Linux support:

#### Running the AppImage (Universal Linux):
1. Download `SpotifyForControllers-1.0.0.AppImage`.
2. Make it executable:
   ```bash
   chmod +x SpotifyForControllers-1.0.0.AppImage
   ```
3. Run it:
   ```bash
   ./SpotifyForControllers-1.0.0.AppImage
   ```

#### Installing via `.deb` (Ubuntu, Debian, Mint, Pop!_OS):
```bash
sudo dpkg -i spotify-for-controllers_1.0.0_amd64.deb
```

#### Running on Steam Deck / SteamOS:
1. Switch to **Desktop Mode** on your Steam Deck.
2. Download or copy `SpotifyForControllers-1.0.0.AppImage`.
3. Open Steam in Desktop Mode → click **Games** → **Add a Non-Steam Game to My Library...**
4. Select `SpotifyForControllers-1.0.0.AppImage`.
5. Switch back to **Gaming Mode** — launch it directly with the built-in Steam Deck controller!

#### Controller Support on Linux:
- Standard Xbox 360, Xbox One, and Xbox Series X/S controllers work out of the box using the Linux kernel's built-in `xpad` driver.
- For Xbox Wireless Dongles or Bluetooth controllers, [`xone`](https://github.com/medusalix/xone) or [`xpadneo`](https://github.com/atar-axis/xpadneo) can be used.

#### Build for Linux from Source:
```bash
npm install
npm run build:linux
```
This generates both `.AppImage` and `.deb` packages inside the `dist/` directory.

---

### 3. As a Website (Browser & Xbox Console)

The project also works directly in web browsers without needing Electron:
- **Xbox Console (Microsoft Edge)** — connect your Xbox controller and browse from your couch!
- **PC, Mac & Linux Browsers** (Chrome, Edge, Firefox, Brave)
- **Smart TVs** with modern browsers

#### Quick Local Website Start:
```bash
npx serve .
# Or: python -m http.server 3000
```
Open `http://localhost:3000` (or `http://localhost:5000`) in your browser.

> **Web Redirect URI:**  
> In your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), add your website's URL as a Redirect URI (e.g. `http://localhost:3000/` or your hosted domain).

---

## Xbox Controller Mapping

| Button | Action | Description |
| :--- | :--- | :--- |
| <kbd>A</kbd> | Confirm / Select | Select item, open playlist / album / artist, toggle play/pause |
| <kbd>B</kbd> | Back | Return to previous screen, close controller guide |
| <kbd>X</kbd> | Like / Unlike | Save or remove current track from Liked Songs |
| <kbd>Y</kbd> | Shuffle | Toggle playback shuffle mode |
| <kbd>LB</kbd> | Previous Track | Skip to previous song |
| <kbd>RB</kbd> | Next Track | Skip to next song |
| <kbd>LT</kbd> | Volume Down | Decrease volume (hold for continuous adjustment) |
| <kbd>RT</kbd> | Volume Up | Increase volume (hold for continuous adjustment) |
| <kbd>L-Stick ↕</kbd> | **Smooth Analog Scroll** | Glide through long playlists, Liked Songs, and menus |
| <kbd>R-Stick ↕</kbd> | **Smooth Analog Scroll** | Free analog scrolling with your right hand |
| <kbd>D-Pad Up / Down</kbd> | Precise Step | Crisp 1-by-1 step navigation between items |
| <kbd>D-Pad ◄ / ►</kbd> | Page Up / Page Down | Skip 6 songs at a time in lists |
| <kbd>Start (Menu)</kbd> | Search | Jump straight to Search screen |
| <kbd>Select (View)</kbd> | Controller Guide | Toggle on-screen controller helper guide |

> **Keyboard Shortcuts (Fallback for testing without a controller):**
> - <kbd>Enter</kbd> / <kbd>Space</kbd> = A
> - <kbd>Esc</kbd> / <kbd>Backspace</kbd> = B
> - <kbd>X</kbd> = X (Like / Unlike)
> - <kbd>Y</kbd> = Y (Shuffle)
> - <kbd>[</kbd> / <kbd>]</kbd> = LB / RB
> - <kbd>-</kbd> / <kbd>=</kbd> = LT / RT
> - <kbd>Arrow Keys</kbd> / <kbd>WASD</kbd> = Navigation
> - <kbd>PageUp</kbd> / <kbd>PageDown</kbd> = Skip 6 tracks
> - <kbd>/</kbd> = Search
> - <kbd>Tab</kbd> = Controller Guide

---

## Spotify Developer Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app**.
3. Fill in:
   - **App name**: `Spotify for Controllers`
   - **App description**: `Controller-driven Spotify client`
   - **Redirect URIs**:
     - For Desktop App (Windows & Linux): `spotifyxbox://callback`
     - For Website mode: Add your website URL (e.g. `http://localhost:3000/`)
   - **APIs used**: Select **Web API**.
4. Click **Save** and copy your **Client ID**.
5. Paste your **Client ID** directly into the on-screen input box on the app login screen and click **Save & Sign In**.

---

## Project Structure

```
Spotify For Controllers/
├── assets/
│   ├── icon.ico         # Spotify Windows application icon
│   └── icon.png         # Spotify 512x512 PNG application icon
├── index.html           # Universal 10-foot TV UI shell
├── style.css            # Dark Xbox dashboard theme & glowing focus rings
├── app.js               # Application coordinator, screen routing & Jump Back In
├── spotify.js           # Spotify Web API client with PKCE OAuth flow (no secret needed)
├── controller.js        # HTML5 Gamepad loop, dual-stick smooth scrolling & debounce
├── ui.js                # Focus management, screen transitions & DOM renderers
├── config.js            # Universal configuration (Node & Browser)
├── main.js              # Electron main process, window icon & deep link handler
├── preload.js           # Secure contextBridge IPC bridge
├── package.json         # Build targets for Windows (.exe) and Linux (.AppImage, .deb)
├── .github/workflows/
│   └── build-release.yml# Automatic multi-platform release builder
└── README.md            # Documentation
```

---

## Notes & Requirements

- **Spotify Premium Account**: Required by Spotify's Web API for third-party playback control.
- **Active Playback Device**: Spotify's API controls active Spotify Connect players. Make sure you have Spotify running on at least one device on your network (your PC, TV, phone, or console).
