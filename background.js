// ===================================================================
//  Bể Cá Nhắc Nước — Service Worker (bộ não của extension)
//  Quản lý: mực nước, hẹn giờ (alarms), badge icon, âm thanh, messaging
// ===================================================================

const ALARM_REMINDER = "water-reminder";
const ALARM_TICK = "water-tick"; // cập nhật badge định kỳ để thấy nước hao dần

// Giá trị mặc định lưu trong chrome.storage.local
const DEFAULTS = {
  waterLevel: 100,        // % nước hiện tại (0–100)
  reminderMinutes: 60,    // chu kỳ nhắc (phút) — 60 = nhắc mỗi 60 phút
  drinkAmount: 25,        // mỗi lần "đã uống" +25%
  drainPerCycle: 20,      // % nước hao trong MỖI chu kỳ nhắc (cân với +25% khi uống)
                          // → drainPerHour = drainPerCycle * 60 / reminderMinutes (tự suy ra)
  lastUpdate: 0,          // mốc thời gian (ms) tính nước hao lần gần nhất
  soundOn: true,          // bật/tắt âm thanh
  pendingReminder: false, // có lời nhắc đang chờ hiện (user chưa ở tab web)
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Đọc trạng thái + tính lượng nước đã hao theo thời gian, rồi lưu lại mốc mới.
// Nhờ vậy mực nước luôn phản ánh thời gian thực, dù service worker có "ngủ".
async function refreshState() {
  const s = await chrome.storage.local.get(DEFAULTS);
  const now = Date.now();
  let level = s.waterLevel;
  if (s.lastUpdate) {
    // Rút drainPerCycle% cho mỗi reminderMinutes thời gian thực đã trôi qua.
    // → nhắc càng nhanh, nước rút càng nhanh; lượng hao mỗi chu kỳ luôn = drainPerCycle.
    const cyclesElapsed = (now - s.lastUpdate) / 60000 / s.reminderMinutes;
    level = clamp(s.waterLevel - s.drainPerCycle * cyclesElapsed);
  }
  await chrome.storage.local.set({ waterLevel: level, lastUpdate: now });
  return { ...s, waterLevel: level, lastUpdate: now };
}

async function getState() {
  return chrome.storage.local.get(DEFAULTS);
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
  return getState();
}

// ------------------------------------------------------------------
//  BADGE — hiển thị % nước + đổi màu cảnh báo trên icon
// ------------------------------------------------------------------
const COLOR_HIGH = "#2dc653"; // xanh lá — đầy nước (≥ 70%)
const COLOR_MID = "#ffb703";  // vàng — vơi (40–70%)
const COLOR_LOW = "#e63946";  // đỏ — cạn (< 40%)

// Màu badge thuần theo % nước
function colorForLevel(level) {
  if (level >= 70) return COLOR_HIGH;
  if (level >= 40) return COLOR_MID;
  return COLOR_LOW;
}

// Truyền sẵn state để tránh rút nước 2 lần (nếu caller đã refreshState).
async function updateBadge(state) {
  const { waterLevel } = state || (await refreshState());
  const level = Math.round(waterLevel);
  await chrome.action.setBadgeText({ text: `${level}%` });
  await chrome.action.setBadgeBackgroundColor({
    color: colorForLevel(level),
  });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

// Nhấp nháy badge vài nhịp khi user bỏ qua (MV3 không blink liên tục được,
// nên ta "pulse" nhanh vài lần rồi trả về đúng màu theo % nước).
async function blinkBadge(times = 6) {
  for (let i = 0; i < times; i++) {
    const on = i % 2 === 0;
    await chrome.action.setBadgeBackgroundColor({
      color: on ? COLOR_LOW : "#0a192f",
    });
    await new Promise((r) => setTimeout(r, 250));
  }
  await updateBadge(); // về lại màu theo % nước hiện tại
}

// ------------------------------------------------------------------
//  ALARMS — lập lịch nhắc
// ------------------------------------------------------------------
async function scheduleReminder(restart = false) {
  const { reminderMinutes } = await getState();
  if (restart) await chrome.alarms.clear(ALARM_REMINDER);
  chrome.alarms.create(ALARM_REMINDER, {
    delayInMinutes: reminderMinutes,
    periodInMinutes: reminderMinutes,
  });
  chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
}

// ------------------------------------------------------------------
//  ÂM THANH — qua offscreen document (MV3 SW không phát audio trực tiếp)
// ------------------------------------------------------------------
let creatingOffscreen = null;

async function ensureOffscreen() {
  const has = await chrome.offscreen
    .hasDocument()
    .catch(() => false);
  if (has) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Phát hiệu ứng âm thanh nước nhắc uống nước.",
    })
    .catch(() => {});
  await creatingOffscreen;
  creatingOffscreen = null;
}

async function playSound(sound) {
  const { soundOn } = await getState();
  if (!soundOn) return;
  try {
    await ensureOffscreen();
    await chrome.runtime.sendMessage({ target: "offscreen", type: "PLAY", sound });
  } catch (_) {
    /* offscreen có thể chưa sẵn sàng — bỏ qua âm thanh */
  }
}

// ------------------------------------------------------------------
//  HIỆN OVERLAY — gửi message tới tab web đang active
// ------------------------------------------------------------------
function isEligibleUrl(url = "") {
  return /^(https?:|file:)/.test(url);
}

async function tryShowOverlayNow() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab || !isEligibleUrl(tab.url)) return false;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SHOW_OVERLAY" });
    return true;
  } catch (_) {
    /* Content script chưa có hoặc đã "mồ côi" sau khi reload extension.
       Tiêm lại rồi gửi message một lần nữa. */
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/overlay.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_OVERLAY" });
      return true;
    } catch (_) {
      /* trang không cho tiêm (chrome://, web store…) — pendingReminder vẫn bật,
         sẽ tự hiện khi user mở tab web hợp lệ */
    }
  }
  return false;
}

// ------------------------------------------------------------------
//  HÀNH ĐỘNG CHÍNH
// ------------------------------------------------------------------
async function triggerReminder() {
  // nước đã tự hao theo thời gian (refreshState); chỉ cần bật cờ nhắc
  const s = await refreshState();
  await setState({ pendingReminder: true });
  await updateBadge(s); // dùng lại state vừa refresh, không rút thêm lần nữa
  await playSound("alert");
  await tryShowOverlayNow();
}

async function handleDrink() {
  const s = await refreshState();
  const newLevel = clamp(s.waterLevel + s.drinkAmount);
  await chrome.storage.local.set({
    waterLevel: newLevel,
    lastUpdate: Date.now(),
    pendingReminder: false,
  });
  await scheduleReminder(true); // reset đồng hồ nhắc từ lúc uống
  await updateBadge({ waterLevel: newLevel });
  await playSound("pour");
  return newLevel;
}

async function handleSkip() {
  // Bỏ qua: KHÔNG cộng/trừ thêm — nước chỉ rút theo thời gian (updateBadge → refreshState).
  // Reset đồng hồ nhắc cho nhất quán với "Đã uống": lần nhắc sau cách đều reminderMinutes.
  await setState({ pendingReminder: false });
  await scheduleReminder(true);
  await updateBadge();
  blinkBadge(); // không await — để chạy nền
}

// ------------------------------------------------------------------
//  VÒNG ĐỜI & SỰ KIỆN
// ------------------------------------------------------------------
// Thông số cấu hình: luôn đồng bộ theo code mỗi lần reload extension.
// (Các key còn lại là trạng thái chạy — chỉ set khi chưa tồn tại.)
const CONFIG_KEYS = ["reminderMinutes", "drinkAmount", "drainPerCycle"];

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(null);
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    // config: ghi đè theo code; trạng thái chạy: chỉ set cho key chưa tồn tại
    if (CONFIG_KEYS.includes(k) || cur[k] === undefined) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  await chrome.storage.local.set({ lastUpdate: Date.now() }); // mốc bắt đầu hao nước
  await scheduleReminder(true);
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  // mở lại Chrome: lấy mốc thời gian mới (không tính hao lúc máy tắt)
  await chrome.storage.local.set({ lastUpdate: Date.now() });
  chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
  await updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_REMINDER) triggerReminder();
  else if (alarm.name === ALARM_TICK) updateBadge(); // nước hao dần → badge giảm
});

// Router message từ popup / content / iframe bể cá
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === "offscreen") return; // để offscreen tự xử lý

  (async () => {
    switch (msg.type) {
      case "GET_STATE": {
        const state = await refreshState();
        sendResponse(state);
        await updateBadge(state); // vẽ badge từ state vừa có, không rút thêm lần nữa
        break;
      }

      case "DRINK": {
        const level = await handleDrink();
        sendResponse({ ok: true, waterLevel: level });
        break;
      }

      case "SKIP":
        await handleSkip();
        sendResponse({ ok: true });
        break;

      case "SET_SOUND":
        await setState({ soundOn: !!msg.value });
        sendResponse({ ok: true });
        break;

      case "TEST_REMINDER": // nút test trong popup
        await triggerReminder();
        sendResponse({ ok: true });
        break;

      case "CHECK_PENDING": {
        // content script hỏi: có lời nhắc đang chờ không?
        const { pendingReminder } = await getState();
        sendResponse({ show: pendingReminder });
        break;
      }

      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();

  return true; // giữ kênh mở cho sendResponse bất đồng bộ
});
