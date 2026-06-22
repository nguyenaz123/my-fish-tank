// ===================================================================
//  Offscreen document — tổng hợp âm thanh bằng Web Audio API
//  (không cần file .mp3 — tạo tiếng "nhỏ giọt" và "rót nước" bằng code)
// ===================================================================

let ctx;
function audio() {
  if (!ctx) ctx = new (self.AudioContext || self.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Tiếng giọt nước "ploink" — pitch trượt lên nhanh + tắt dần
function dropSound(when = 0, baseFreq = 600) {
  const ac = audio();
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq, t);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.2, t + 0.08);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.3);
}

// Tiếng rót nước — noise qua bandpass quét tần số (nghe như nước chảy)
function pourSound() {
  const ac = audio();
  const t = ac.currentTime;
  const dur = 1.1;
  const buffer = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(700, t);
  band.frequency.linearRampToValueAtTime(1600, t + dur);
  band.Q.value = 0.8;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.1);
  gain.gain.setValueAtTime(0.18, t + dur - 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  noise.connect(band).connect(gain).connect(ac.destination);
  noise.start(t);
  noise.stop(t + dur);

  // điểm xuyết vài giọt nước
  dropSound(0.15, 520);
  dropSound(0.55, 680);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== "offscreen" || msg.type !== "PLAY") return;
  try {
    if (msg.sound === "pour") pourSound();
    else dropSound(0, 700); // "alert"
  } catch (_) {}
});
