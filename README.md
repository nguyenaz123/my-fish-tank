# 🐠 Water Reminder Fish Tank

A Chrome Extension (Manifest V3) that keeps a tiny virtual fish alive in your browser. Every **2 hours**, the water level in the tank drops and an overlay pops up to remind you to drink water. Drink up and the fish happily does flips; ignore it and the fish cries while the icon turns red. 💧

<p align="center">
  <a href="https://github.com/nguyenaz123/my-fish-tank/releases/download/v1.0/water-extension.zip">
    <img src="https://img.shields.io/badge/⬇️%20Download-water--extension.zip-1e90ff?style=for-the-badge" alt="Download water-extension.zip">
  </a>
</p>

---

## ✨ Features

- **Pure HTML/CSS/SVG fish tank**: rippling water (two rotating rounded blocks), bubbles spawning every 3 seconds, seaweed and gravel at the bottom.
- **3 fish states** based on the water level:
  - `>70%` **Happy**: floats gently and waves its tail.
  - `20–70%` **Panicking**: swims erratically and keeps flipping over.
  - `<20%` **Suffocating**: belly-up with occasional twitches.
- **Water reminder overlay** on top of any web tab: dims the screen, locks scrolling, shows a speech bubble and two action buttons.
  - **I DRANK (+25%)**: ripple → rain → rising water → fish does a 360° flip + hearts ❤️.
  - **NOT YET**: the tank shakes violently, tears fall 💧, the icon flashes red with a water-% badge.
- **Badge** on the toolbar icon shows the remaining water %, turning red when empty.
- **Synthesized sound** via the Web Audio API (no mp3 files needed): water drops and pouring sounds. Toggle on/off in the popup.
- Scheduling uses `chrome.alarms` (proper MV3 approach — survives the service worker going to sleep).

---

## 📦 Installation (Developer Mode)

Since this extension is not published on the Chrome Web Store, you install it manually in developer mode.

1. **Download** the extension: click the **Download** button above (or [this link](https://github.com/nguyenaz123/my-fish-tank/releases/download/v1.0/water-extension.zip)).
2. **Unzip** `water-extension.zip` into a folder you can keep (e.g. `Documents\water-extension`). Don't delete this folder afterwards — Chrome loads the extension directly from it.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped `water-extension` folder.
6. Pin the 🐠 icon to your toolbar so you can see it easily.

> 💡 Works with any Chromium-based browser (Chrome, Edge, Brave, etc.). For Edge, use `edge://extensions` instead.

---

## 🧪 Quick Test (no need to wait 2 hours)

1. Click the icon to open the popup and view your fish tank.
2. Click **"Test Reminder"** to trigger a reminder immediately.
3. Open or switch to any web tab (http/https) — the fish tank overlay appears.
4. Try both buttons to see scenario A (drink) and scenario B (ignore).
5. Click **"Drink now 💧"** in the popup to refill the water.

> To change the reminder interval, edit `reminderMinutes` (default 120 minutes) in `background.js` or via `chrome.storage.local`.

---

## 🗂️ Project Structure

```
manifest.json        MV3 declaration
background.js        Service worker: water level, alarms, badge, audio, messaging
offscreen.html/js    Audio synthesis via Web Audio
content/
  overlay.js         Injects the overlay + tank iframe into web tabs, locks scroll
  overlay.css        Dark overlay styles
tank/
  tank.html          Tank scene + SVG fish (shared by popup & overlay)
  tank.css           Waves, bubbles, fish animations, effects, buttons
  tank.js            Logic: render by %, bubbles, scenarios A/B
popup/
  popup.html         Fish tank in popup mode
assets/              Icons 16/48/128
```

---

## ⚠️ Limitations (inherent to Chrome Extensions)

- The overlay **only appears on browser tabs** (http/https/file). If a reminder fires while you're in an external app (Word, desktop, etc.), the overlay will show up **as soon as you return to a web tab**. The extension cannot draw over the entire operating system screen.
- The icon can't "flash like an LED" continuously on MV3; it flashes a few times, then stays red with a water-% badge to keep nagging you.
- The overlay cannot be injected on `chrome://` pages, the Chrome Web Store, or blank tabs.

---

## 📜 License

Free to use and share. Made for fun — stay hydrated! 🐠💧
