// ===================================================================
//  tank.js — logic bể cá (chạy trong popup & overlay iframe)
//  Cả 2 ngữ cảnh đều là trang chrome-extension:// nên dùng được
//  chrome.runtime / chrome.storage trực tiếp.
// ===================================================================

const params = new URLSearchParams(location.search);
const MODE = params.get("mode") || "popup"; // "overlay" | "popup"

const $ = (id) => document.getElementById(id);
const fishEl = $("fish");
const speechEl = $("speech");
const bubblesEl = $("bubbles");
const fxEl = $("fx");
const tankEl = $("tank");

document.body.classList.add(`mode-${MODE}`);

// ------------------------------------------------------------------
//  Lời thoại theo mức nước
// ------------------------------------------------------------------
function speechFor(level) {
  if (level >= 70) return "Làm cốc nước đi bạn! Siiuuu ✨";
  if (level >= 40) return "Khô quá... cho cốc nước? 🐠";
  if (level >= 20) return "Khó thở! Cho t xin một cốc nước! 😨";
  return "Cứu... khát quá... messiii! 🔥";
}

// ------------------------------------------------------------------
//  Trạng thái cá theo mức nước
// ------------------------------------------------------------------
function fishStateFor(level) {
  if (level >= 70) return "happy";
  if (level >= 20) return "panic";
  return "dying";
}

let currentLevel = 60;
let swimTimer = null;

function applyLevel(level) {
  currentLevel = level;
  document.documentElement.style.setProperty("--level", `${level}%`);

  const state = fishStateFor(level);
  fishEl.classList.remove("happy", "panic", "dying");
  fishEl.classList.add(state);

  // cá chìm dần theo mực nước (đứng trong khoảng 12%–60% chiều cao)
  const bottom = 12 + (level / 100) * 48;
  fishEl.style.bottom = `${bottom}%`;

  // nhịp bơi ngang theo trạng thái
  startSwimming(state);

  // cập nhật bảng %
  const meter = $("meter");
  const meterLabel = $("meterLabel");
  if (meter && meterLabel) {
    meterLabel.textContent = `${Math.round(level)}%`;
  }
}

// ------------------------------------------------------------------
//  Bơi ngang: định kỳ đổi vị trí + lật hướng cá
// ------------------------------------------------------------------
function startSwimming(state) {
  if (swimTimer) clearInterval(swimTimer);
  if (state === "dying") return; // cá ngất, không bơi

  const interval = state === "panic" ? 600 : 2600;
  const swim = () => {
    const tankW = tankEl.clientWidth || 320;
    const margin = 60;
    const target = margin + Math.random() * (tankW - margin * 2);
    const prevLeft = parseFloat(fishEl.style.left) || tankW / 2;
    // lật hướng theo chiều di chuyển (cá nhìn về bên phải mặc định)
    fishEl.classList.toggle("flip", target < prevLeft);
    fishEl.style.marginLeft = "0";
    fishEl.style.left = `${target}px`;
  };
  swim();
  swimTimer = setInterval(swim, interval);
}

// ------------------------------------------------------------------
//  Bong bóng: mỗi 3 giây tạo 1 bong bóng (overlay tạo dày hơn)
// ------------------------------------------------------------------
function spawnBubble() {
  const b = document.createElement("div");
  b.className = "bubble";
  const size = 4 + Math.random() * 6; // 4–10px
  b.style.width = `${size}px`;
  b.style.height = `${size}px`;
  b.style.left = `${Math.random() * 100}%`;
  const dur = 3 + Math.random() * 2.5;
  b.style.animationDuration = `${dur}s`;
  bubblesEl.appendChild(b);
  setTimeout(() => b.remove(), dur * 1000 + 100); // tự xóa khỏi DOM
}
setInterval(spawnBubble, 3000);
spawnBubble();

// ------------------------------------------------------------------
//  Hiệu ứng FX
// ------------------------------------------------------------------
function rainEffect() {
  const w = tankEl.clientWidth || 320;
  for (let i = 0; i < 24; i++) {
    const d = document.createElement("div");
    d.className = "raindrop";
    d.style.left = `${Math.random() * w}px`;
    d.style.animationDelay = `${Math.random() * 0.5}s`;
    fxEl.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }
}

function emojiBurst(emoji, count = 6) {
  const rect = fishEl.getBoundingClientRect();
  const tankRect = tankEl.getBoundingClientRect();
  const cx = rect.left - tankRect.left + rect.width / 2;
  const cy = rect.top - tankRect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    const e = document.createElement("div");
    e.className = "float-emoji";
    e.textContent = emoji;
    e.style.left = `${cx + (Math.random() * 60 - 30)}px`;
    e.style.top = `${cy + (Math.random() * 30 - 15)}px`;
    e.style.animationDelay = `${Math.random() * 0.4}s`;
    fxEl.appendChild(e);
    setTimeout(() => e.remove(), 1900);
  }
}

// ------------------------------------------------------------------
//  Khởi tạo theo MODE
// ------------------------------------------------------------------
async function init() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  applyLevel(state.waterLevel);

  if (MODE === "overlay") {
    setupOverlay(state);
  } else {
    setupPopup(state);
  }
}

// ---------- OVERLAY: speech + 2 nút + kịch bản A/B ----------
const AUTO_CLOSE_MS = 45000; // không phản hồi sau 45s → tự đóng, coi như bỏ qua
let acted = false;           // đã bấm nút (hoặc đã tự đóng) chưa
let autoTimer = null;
let countdownTimer = null;
let baseSpeech = "";

function clearTimers() {
  if (autoTimer) clearTimeout(autoTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  autoTimer = countdownTimer = null;
}

function setupOverlay(state) {
  speechEl.hidden = false;
  baseSpeech = speechFor(state.waterLevel);
  speechEl.textContent = baseSpeech;
  $("actions").hidden = false;

  const drinkBtn = $("drinkBtn");
  const skipBtn = $("skipBtn");

  drinkBtn.addEventListener("click", (ev) => {
    spawnRipple(drinkBtn, ev);
    onDrink();
  });
  skipBtn.addEventListener("click", onSkip);

  // Đếm ngược tự đóng (cho trường hợp người dùng đi vắng)
  let remaining = Math.round(AUTO_CLOSE_MS / 1000);
  countdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 10 && remaining > 0) {
      speechEl.textContent = `${baseSpeech}\n(Tự đóng sau ${remaining}s…)`;
    }
  }, 1000);
  autoTimer = setTimeout(onTimeout, AUTO_CLOSE_MS);
}

async function onTimeout() {
  if (acted) return;
  acted = true;
  clearTimers();
  // coi như "Bỏ qua": badge đỏ, nước vẫn cạn, chu kỳ sau lại nhắc
  await chrome.runtime.sendMessage({ type: "SKIP" });
  closeOverlay();
}

async function onDrink() {
  if (acted) return;
  acted = true;
  clearTimers();
  // Kịch bản A: mưa nước → nước dâng → cá nhào lộn 360° + tim
  rainEffect();
  const res = await chrome.runtime.sendMessage({ type: "DRINK" });
  applyLevel(res.waterLevel);

  fishEl.classList.add("flip-trick");
  setTimeout(() => fishEl.classList.remove("flip-trick"), 1000);
  emojiBurst("❤️", 6);
  speechEl.textContent = "Tuyệt vời! Siiuuuuuu! 🥰";

  setTimeout(closeOverlay, 1500);
}

async function onSkip() {
  if (acted) return;
  acted = true;
  clearTimers();
  // Kịch bản B: bể rung + nước mắt → đóng ngay → badge đỏ nhấp nháy
  tankEl.classList.add("shiver");
  emojiBurst("💧", 4);
  speechEl.textContent = "Hicc... messiii... 😢";
  await chrome.runtime.sendMessage({ type: "SKIP" });
  setTimeout(closeOverlay, 600);
}

function closeOverlay() {
  // báo content script (cửa sổ cha) đóng overlay
  window.parent.postMessage({ source: "water-tank", type: "close" }, "*");
}

function spawnRipple(btn, ev) {
  const host = btn.querySelector(".ripple-host") || btn;
  const rect = btn.getBoundingClientRect();
  const r = document.createElement("span");
  r.className = "ripple";
  const size = Math.max(rect.width, rect.height);
  r.style.width = r.style.height = `${size}px`;
  r.style.left = `${ev.clientX - rect.left - size / 2}px`;
  r.style.top = `${ev.clientY - rect.top - size / 2}px`;
  btn.appendChild(r);
  setTimeout(() => r.remove(), 600);
}

// ---------- POPUP: xem trạng thái + điều khiển ----------
function setupPopup(state) {
  $("meter").hidden = false;
  speechEl.hidden = false;
  speechEl.textContent = speechFor(state.waterLevel);

  $("popDrink").addEventListener("click", async () => {
    rainEffect();
    const res = await chrome.runtime.sendMessage({ type: "DRINK" });
    applyLevel(res.waterLevel);
    fishEl.classList.add("flip-trick");
    setTimeout(() => fishEl.classList.remove("flip-trick"), 1000);
    emojiBurst("❤️", 5);
    speechEl.textContent = speechFor(res.waterLevel);
  });

  const soundBox = $("popSound");
  soundBox.checked = state.soundOn;
  soundBox.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "SET_SOUND", value: soundBox.checked });
  });

  // popup đang mở: cập nhật mực nước rút dần theo thời gian thực
  setInterval(async () => {
    const fresh = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    applyLevel(fresh.waterLevel);
    speechEl.textContent = speechFor(fresh.waterLevel);
  }, 5000);
}

init();
