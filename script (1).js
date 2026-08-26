// ================= FIREBASE =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  serverTimestamp,
  push,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtkZE_OCad8dLlbFwAMFaCCC048cy6UQc",
  authDomain: "coaster-monitoring-system.firebaseapp.com",
  databaseURL:
    "https://coaster-monitoring-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coaster-monitoring-system",
  storageBucket: "coaster-monitoring-system.firebasestorage.app",
  messagingSenderId: "308183827970",
  appId: "1:308183827970:web:60b5e3ba8c4dfc7657491b",
  measurementId: "G-TSQQM2X6E9",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const ridersRef = ref(db, "riders"); // object: { pushId: epochMsTimestamp, ... }, one entry per occupied seat

// ================= CONFIG =================
const CAPACITY = 20; // total coaster seats
const RIDE_DURATION_MS = 30 * 60 * 1000; // each boarded rider auto-exits after 30 minutes

// Operating schedule, in Asia/Manila local time (24-hour). Edit these two lines only.
const OPEN_TIME = { hour: 8, minute: 0 }; // 8:00 AM
const CLOSE_TIME = { hour: 17, minute: 0 }; // 5:00 PM
// ============================================

// ---- State ----
// riders: array of { key, timestamp } — kept in sync with Firebase in real time
let riders = [];
let firebaseReady = false;
let firebaseError = false;

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

// ---- Firebase sync ----
// Every connected device gets this callback whenever /riders changes, in real time.
onValue(
  ridersRef,
  (snapshot) => {
    const val = snapshot.val() || {};
    riders = Object.entries(val)
      .map(([key, timestamp]) => ({ key, timestamp }))
      .filter((r) => Number.isFinite(r.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp); // earliest-boarded first
    firebaseReady = true;
    firebaseError = false;
    render();
  },
  (error) => {
    console.error("Firebase read failed:", error);
    firebaseError = true;
    render();
  }
);

function activeRiderEntries(ridersObj, now) {
  // Keeps only seats whose 30-minute ride hasn't ended yet.
  const entries = {};
  Object.entries(ridersObj || {}).forEach(([key, timestamp]) => {
    if (Number.isFinite(timestamp) && now - timestamp < RIDE_DURATION_MS) {
      entries[key] = timestamp;
    }
  });
  return entries;
}

// ---- Core logic (all writes go through transactions so concurrent devices never overbook) ----
function board() {
  if (!firebaseReady || boardBtn.disabled) return;

  const newKey = push(ridersRef).key;

  runTransaction(ridersRef, (current) => {
    const now = Date.now();
    if (!isWithinSchedule()) return; // abort, no change
    const active = activeRiderEntries(current, now);
    if (Object.keys(active).length >= CAPACITY) return; // full, abort
    active[newKey] = now;
    return active;
  }).catch((err) => console.error("Board transaction failed:", err));
}

function exit() {
  if (!firebaseReady || exitBtn.disabled) return;

  runTransaction(ridersRef, (current) => {
    const now = Date.now();
    const active = activeRiderEntries(current, now);
    const keys = Object.keys(active);
    if (keys.length === 0) return active;
    // remove earliest-boarded seat
    let earliestKey = keys[0];
    let earliestTs = active[earliestKey];
    for (const k of keys) {
      if (active[k] < earliestTs) {
        earliestTs = active[k];
        earliestKey = k;
      }
    }
    delete active[earliestKey];
    return active;
  }).catch((err) => console.error("Exit transaction failed:", err));
}

// Periodically prune expired seats from the database itself, so occupancy
// stays accurate even if nobody presses a button after a ride ends.
function pruneExpired() {
  if (!firebaseReady) return;
  runTransaction(ridersRef, (current) => activeRiderEntries(current, Date.now())).catch((err) =>
    console.error("Prune transaction failed:", err)
  );
}

// ---- Rendering ----
function render() {
  const active = isWithinSchedule();
  const now = Date.now();
  const liveRiders = riders.filter((r) => now - r.timestamp < RIDE_DURATION_MS);
  const occupied = liveRiders.length;
  const available = CAPACITY - occupied;

  // Clock
  phClock.textContent = `🇵🇭 ${formatManilaClock()}`;

  if (!firebaseReady && !firebaseError) {
    slotCount.textContent = "Connecting...";
    boardBtn.disabled = true;
    exitBtn.disabled = true;
    return;
  }

  if (firebaseError) {
    slotCount.textContent = "Connection error";
    nextFree.textContent = "Live sync unavailable — check your connection.";
    boardBtn.disabled = true;
    exitBtn.disabled = true;
    return;
  }

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
    const earliest = liveRiders[0].timestamp;
    const remainingMs = Math.max(0, RIDE_DURATION_MS - (now - earliest));
    const mm = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
    const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0");
    nextFree.textContent = `Next seat opens in ${mm}:${ss}`;
  } else {
    nextFree.textContent = "";
  }

  // Schedule banner + button availability
  if (!active) {
    scheduleBanner.hidden = false;
    scheduleMessage.textContent = `⏰ Closed right now. Hours: ${formatHourMinute(
      OPEN_TIME
    )} – ${formatHourMinute(CLOSE_TIME)} (Manila time)`;
  } else {
    scheduleBanner.hidden = true;
  }

  boardBtn.disabled = !active || occupied >= CAPACITY;
  exitBtn.disabled = occupied <= 0;
}

// ---- Wire up events ----
boardBtn.addEventListener("click", board);
exitBtn.addEventListener("click", exit);

// ---- Tick every second: updates clock/countdown, and occasionally prunes expired seats ----
let tickCount = 0;
setInterval(() => {
  render();
  tickCount++;
  if (tickCount % 15 === 0) pruneExpired(); // every ~15s, sweep expired seats from the DB
}, 1000);

render();
