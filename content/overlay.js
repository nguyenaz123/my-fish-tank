// ===================================================================
//  content/overlay.js — chạy trên mọi tab web
//  Nhiệm vụ: dựng lớp phủ tối + iframe bể cá khi tới giờ nhắc,
//  khóa scroll trang, và dọn dẹp khi đóng.
// ===================================================================

(() => {
  if (window.__waterTankInjected) return;
  window.__waterTankInjected = true;

  const OVERLAY_ID = "water-tank-overlay";
  let scrollHandlers = null;

  function isShowing() {
    return !!document.getElementById(OVERLAY_ID);
  }

  function lockScroll() {
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const block = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const blockKeys = (e) => {
      const keys = [32, 33, 34, 35, 36, 37, 38, 39, 40]; // space, pgup/dn, end, home, arrows
      if (keys.includes(e.keyCode)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("wheel", block, { passive: false, capture: true });
    window.addEventListener("touchmove", block, { passive: false, capture: true });
    window.addEventListener("keydown", blockKeys, { capture: true });
    scrollHandlers = { prevOverflow, block, blockKeys };
  }

  function unlockScroll() {
    if (!scrollHandlers) return;
    const { prevOverflow, block, blockKeys } = scrollHandlers;
    document.documentElement.style.overflow = prevOverflow;
    window.removeEventListener("wheel", block, { capture: true });
    window.removeEventListener("touchmove", block, { capture: true });
    window.removeEventListener("keydown", blockKeys, { capture: true });
    scrollHandlers = null;
  }

  function showOverlay() {
    if (isShowing()) return;

    const backdrop = document.createElement("div");
    backdrop.id = OVERLAY_ID;

    const frame = document.createElement("iframe");
    frame.className = "water-tank-frame";
    frame.src = chrome.runtime.getURL("tank/tank.html?mode=overlay");
    frame.setAttribute("allow", "autoplay");

    backdrop.appendChild(frame);
    document.documentElement.appendChild(backdrop);
    lockScroll();

    // hiệu ứng hiện dần
    requestAnimationFrame(() => backdrop.classList.add("visible"));
  }

  function hideOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    el.classList.remove("visible");
    unlockScroll();
    setTimeout(() => el.remove(), 400);
  }

  // Nhận lệnh đóng từ iframe bể cá
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (d && d.source === "water-tank" && d.type === "close") hideOverlay();
  });

  // Background bảo hiện overlay
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "SHOW_OVERLAY") {
      showOverlay();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Khi tab này được focus/hiện lại: hỏi background có lời nhắc đang chờ không
  function checkPending() {
    chrome.runtime.sendMessage({ type: "CHECK_PENDING" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.show) showOverlay();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkPending();
  });
  window.addEventListener("focus", checkPending);
  checkPending(); // kiểm tra ngay khi script vừa nạp
})();
