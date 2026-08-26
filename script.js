// ================= CONFIG =================
const CAPACITY = 20;                       // total coaster seats
const RIDE_DURATION_MS = 30 * 60 * 1000;   // each boarded rider auto-exits after 30 minutes

// Operating schedule, in Asia/Manila local time (24-hour). Edit these two lines only.
const OPEN_TIME  = { hour: 8,  minute: 0 };   // 8:00 AM
const CLOSE_TIME = { hour: 17, minute: 0 };   // 5:00 PM

const STORAGE_KEY = "coaster-rider-timestamps"; // array of board() timestamps, one per occupied seat
// ============================================

// ---- State ----
let riders = loadState(); // array of epoch-ms timestamps, each = when that seat was boarded

// ---- Elements ----
const statusBox = document.getElementById("status-box");
const statusIcon = document.getElementById("status-icon");
const slotCount = document.getElementById("slot-count");
const nextFree = document.getElementById("next-free");
const phClock = document.getElementById("ph-clock");
const scheduleBanner = document.getElementById("schedule-banner");
const scheduleMessage = document.getElementById("schedule-message");
const boardBtn = document.getElementById("board-btn");
const exitBtn = document.getElementById("exit-btn");

// ---- Persistence ----
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(raw) ? raw.filter((t) => Number.isFinite(t)) : [];
  } catch {
    return [];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(riders));
}

// ---- Manila time helpers ----
function getManilaParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = {};
  fmt.formatToParts(date).forEach((p) => (parts[p.type] = p.value));
  return {
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function formatManilaClock(date = new Date()) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function formatHourMinute({ hour, minute }) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function isWithinSchedule() {
  const { hour, minute } = getManilaParts();
  const nowMins = hour * 60 + minute;
  const openMins = OPEN_TIME.hour * 60 + OPEN_TIME.minute;
  const closeMins = CLOSE_TIME.hour * 60 + CLOSE_TIME.minute;
  return nowMins >= openMins && nowMins < closeMins;
}

// ---- Core logic ----
function expireOldRiders() {
  const now = Date.now();
  const before = riders.length;
  riders = riders.filter((t) => now - t < RIDE_DURATION_MS);
  if (riders.length !== before) saveState();
}

function board() {
  if (!isWithinSchedule() || riders.length >= CAPACITY) return;
  riders.push(Date.now());
  saveState();
  render();
}

function exit() {
  if (riders.length === 0) return;
  riders.shift(); // the earliest-boarded rider exits first
  saveState();
  render();
}

// ---- Rendering ----
function render() {
  expireOldRiders();

  const active = isWithinSchedule();
  const occupied = riders.length;
  const available = CAPACITY - occupied;

  // Clock
  phClock.textContent = `🇵🇭 ${formatManilaClock()}`;

  // Slot count
  slotCount.innerHTML = `<span class="available-num">${available}</span> / ${CAPACITY} seats open`;

  // Status color + icon
  statusBox.classList.remove("status-open", "status-filling", "status-full", "status-closed");
  if (!active) {
    statusBox.classList.add("status-closed");
    statusIcon.textContent = "🌙";
  } else if (available === 0) {
    statusBox.classList.add("status-full");
    statusIcon.textContent = "🚫";
  } else if (available <= CAPACITY * 0.25) {
    statusBox.classList.add("status-filling");
    statusIcon.textContent = "⏳";
  } else {
    statusBox.classList.add("status-open");
    statusIcon.textContent = "🎟️";
  }

  // Countdown to next freed seat
  if (occupied > 0) {
    const earliest = Math.min(...riders);
    const remainingMs = Math.max(0, RIDE_DURATION_MS - (Date.now() - earliest));
    const mm = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
    const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0");
    nextFree.textContent = `Next seat opens in ${mm}:${ss}`;
  } else {
    nextFree.textContent = "";
  }

  // Schedule banner + button availability
  if (!active) {
    scheduleBanner.hidden = false;
    scheduleMessage.textContent =
      `⏰ Closed right now. Hours: ${formatHourMinute(OPEN_TIME)} – ${formatHourMinute(CLOSE_TIME)} (Manila time)`;
  } else {
    scheduleBanner.hidden = true;
  }

  boardBtn.disabled = !active || occupied >= CAPACITY;
  exitBtn.disabled = occupied <= 0;
}

// ---- Wire up events ----
boardBtn.addEventListener("click", board);
exitBtn.addEventListener("click", exit);

// Keep multiple open tabs/devices sharing the same localStorage in sync
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    riders = loadState();
    render();
  }
});

// ---- Tick every second: updates clock, expires timers, refreshes schedule state ----
setInterval(render, 1000);
render();
