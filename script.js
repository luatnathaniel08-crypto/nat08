// ================= FIREBASE =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  push,
  serverTimestamp,
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

// ================= CONFIG =================
const CAPACITY = 30;                         // maximum reservations per departure
const RESERVATION_HOLD_MS = 10 * 60 * 1000; // 10-minute reservation timer
const TRIP_INTERVAL_MIN = 20;                // departure every 20 minutes
const TRIP_DURATION_MIN = 20;                // travel time: 20 minutes
const OPEN_MIN = 6 * 60;                     // 6:00 AM
const BREAK_START_MIN = 11 * 60 + 40;        // 11:40 AM
const BREAK_END_MIN = 13 * 60;               // 1:00 PM
const CLOSE_MIN = 21 * 60;                   // 9:00 PM
const TZ = "Asia/Manila";

const reservationsRef = ref(db, "coasterReservations");

// ================= STATE =================
let reservations = {};
let firebaseReady = false;
let firebaseError = false;

const DEVICE_KEY = "coaster_device_id_v2";
const LOCAL_RESERVATION_KEY = "coaster_active_reservation_v2";

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

const deviceId = getDeviceId();

// ================= ELEMENTS =================
const statusBox = document.getElementById("status-box");
const statusIcon = document.getElementById("status-icon");
const slotCount = document.getElementById("slot-count");
const tripLabel = document.getElementById("trip-label");
const phClock = document.getElementById("ph-clock");
const scheduleBanner = document.getElementById("schedule-banner");
const scheduleMessage = document.getElementById("schedule-message");
const tripSelect = document.getElementById("trip-select");
const tripDate = document.getElementById("trip-date");
const reserveBtn = document.getElementById("reserve-btn");
const cancelBtn = document.getElementById("cancel-btn");
const reservationPanel = document.getElementById("reservation-panel");
const reservationTrip = document.getElementById("reservation-trip");
const reservationTimer = document.getElementById("reservation-timer");
const reminderBox = document.getElementById("reminder-box");
const checkinQr = document.getElementById("checkin-qr");
const checkinStatus = document.getElementById("checkin-status");
const scheduleList = document.getElementById("schedule-list");
const liveQr = document.getElementById("live-qr");
const toast = document.getElementById("toast");

let selectedTrip = null;
let activeReservation = loadLocalReservation();
let checkInProcessed = false;

// ================= TIME HELPERS =================
function getManilaParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = {};
  fmt.formatToParts(date).forEach((p) => (parts[p.type] = p.value));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getManilaDateKey(date = new Date()) {
  const p = getManilaParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function formatManilaClock(date = new Date()) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function formatTripTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function dateForManilaMinutes(dateKey, mins) {
  const [y, mo, d] = dateKey.split("-").map(Number);
  // Convert the desired Manila wall-clock time to a Date without relying on
  // the browser's local timezone. Manila has no DST.
  return new Date(Date.UTC(y, mo - 1, d, minsToHour(mins), mins % 60) - 8 * 60 * 60 * 1000);
}

function minsToHour(mins) {
  return Math.floor(mins / 60);
}

function isBreak(mins) {
  return mins >= BREAK_START_MIN && mins < BREAK_END_MIN;
}

function isOperatingMinute(mins) {
  return mins >= OPEN_MIN && mins <= CLOSE_MIN && !isBreak(mins);
}

function tripKey(dateKey, departureMin) {
  return `${dateKey}_${String(departureMin).padStart(4, "0")}`;
}

function allTripsForDate(dateKey) {
  const trips = [];
  for (let m = OPEN_MIN; m <= CLOSE_MIN; m += TRIP_INTERVAL_MIN) {
    if (!isBreak(m)) {
      trips.push({
        dateKey,
        departureMin: m,
        key: tripKey(dateKey, m),
      });
    }
  }
  return trips;
}

function upcomingTrips() {
  const now = new Date();
  const today = getManilaDateKey(now);
  const p = getManilaParts(now);
  const nowMin = p.hour * 60 + p.minute;

  const todayTrips = allTripsForDate(today).filter((t) => t.departureMin >= nowMin);
  if (todayTrips.length) return todayTrips;

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return allTripsForDate(getManilaDateKey(tomorrow));
}

function getSelectedTrip() {
  return upcomingTrips().find((t) => t.key === tripSelect.value) || upcomingTrips()[0] || null;
}

// ================= LOCAL RESERVATION =================
function loadLocalReservation() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_RESERVATION_KEY) || "null");
    if (!saved || !saved.reservationId || !saved.expiresAt) return null;
    if (Date.now() >= saved.expiresAt) {
      localStorage.removeItem(LOCAL_RESERVATION_KEY);
      return null;
    }
    return saved;
  } catch {
    localStorage.removeItem(LOCAL_RESERVATION_KEY);
    return null;
  }
}

function saveLocalReservation(data) {
  activeReservation = data;
  localStorage.setItem(LOCAL_RESERVATION_KEY, JSON.stringify(data));
}

function clearLocalReservation() {
  activeReservation = null;
  localStorage.removeItem(LOCAL_RESERVATION_KEY);
}

// ================= FIREBASE SYNC =================
onValue(
  reservationsRef,
  (snapshot) => {
    reservations = snapshot.val() || {};
    firebaseReady = true;
    firebaseError = false;
    validateLocalReservation();
    render();
  },
  (error) => {
    console.error("Firebase read failed:", error);
    firebaseError = true;
    render();
  }
);

function activeReservationsForTrip(tripId, now = Date.now()) {
  const source = reservations[tripId] || {};
  const active = {};

  Object.entries(source).forEach(([id, reservation]) => {
    if (
      reservation &&
      reservation.expiresAt > now &&
      reservation.status !== "cancelled"
    ) {
      active[id] = reservation;
    }
  });

  return active;
}

function validateLocalReservation() {
  if (!activeReservation) return;

  const tripReservations = reservations[activeReservation.tripId] || {};
  const serverReservation = tripReservations[activeReservation.reservationId];

  if (!serverReservation) {
    clearLocalReservation();
    return;
  }

  if (serverReservation.status === "checked_in") {
    activeReservation = { ...activeReservation, status: "checked_in" };
    localStorage.setItem(LOCAL_RESERVATION_KEY, JSON.stringify(activeReservation));
  } else if (
    serverReservation.expiresAt <= Date.now() ||
    serverReservation.status === "expired"
  ) {
    clearLocalReservation();
  } else {
    activeReservation = {
      ...activeReservation,
      expiresAt: serverReservation.expiresAt,
      status: serverReservation.status,
    };
    localStorage.setItem(LOCAL_RESERVATION_KEY, JSON.stringify(activeReservation));
  }
}

// ================= RESERVATION =================
async function reserveSeat() {
  if (!firebaseReady || reserveBtn.disabled) return;

  if (activeReservation) {
    showToast("You already have an active reservation on this device.");
    return;
  }

  const trip = getSelectedTrip();
  if (!trip) {
    showToast("There are no upcoming coaster trips.");
    return;
  }

  const now = Date.now();
  const departureAt = dateForManilaMinutes(trip.dateKey, trip.departureMin).getTime();

  if (departureAt <= now) {
    showToast("That trip has already started. Please choose another trip.");
    populateTrips();
    return;
  }

  const reservationId = push(ref(db, "reservationIds")).key;
  const tripRef = ref(db, `coasterReservations/${trip.key}`);
  const holdUntil = Math.min(now + RESERVATION_HOLD_MS, departureAt);

  try {
    const result = await runTransaction(reservationsRef, (current) => {
      const all = current || {};

      // One active reservation per device across the whole system.
      const deviceAlreadyReserved = Object.values(all).some((tripReservations) =>
        Object.values(tripReservations || {}).some(
          (r) =>
            r &&
            r.deviceId === deviceId &&
            Number(r.expiresAt) > now &&
            r.status !== "cancelled"
        )
      );
      if (deviceAlreadyReserved) return;

      const active = activeReservationsForTripFromObject(
        all[trip.key],
        now
      );

      if (Object.keys(active).length >= CAPACITY) return;

      active[reservationId] = {
        deviceId,
        status: "reserved",
        createdAt: now,
        expiresAt: holdUntil,
        departureMin: trip.departureMin,
        dateKey: trip.dateKey,
        checkInToken: reservationId,
      };

      return { ...all, [trip.key]: active };
    });

    if (!result.committed) {
      showToast("That trip is full or this device already has a reservation.");
      return;
    }

    saveLocalReservation({
      reservationId,
      tripId: trip.key,
      dateKey: trip.dateKey,
      departureMin: trip.departureMin,
      expiresAt: holdUntil,
      status: "reserved",
    });

    showToast("Seat reserved for 10 minutes.");
    render();
  } catch (err) {
    console.error("Reservation failed:", err);
    showToast("Could not reserve the seat. Please try again.");
  }
}

function activeReservationsForTripFromObject(source, now) {
  const active = {};
  Object.entries(source || {}).forEach(([id, reservation]) => {
    if (
      reservation &&
      Number(reservation.expiresAt) > now &&
      reservation.status !== "cancelled"
    ) {
      active[id] = reservation;
    }
  });
  return active;
}

async function cancelReservation() {
  if (!activeReservation || !firebaseReady) return;

  const tripRef = ref(
    db,
    `coasterReservations/${activeReservation.tripId}`
  );

  try {
    await runTransaction(tripRef, (current) => {
      if (!current) return current;
      const item = current[activeReservation.reservationId];
      if (!item || item.deviceId !== deviceId) return current;

      const copy = { ...current };
      delete copy[activeReservation.reservationId];
      return Object.keys(copy).length ? copy : null;
    });

    clearLocalReservation();
    showToast("Reservation cancelled.");
    render();
  } catch (err) {
    console.error("Cancel failed:", err);
    showToast("Could not cancel the reservation.");
  }
}

// ================= CHECK-IN =================
// A reservation gets its own QR URL. Scanning it opens this page with
// ?checkin=<reservationId>&trip=<tripKey>, then atomically marks the
// reservation as checked in.
function checkInFromUrl() {
  const params = new URLSearchParams(location.search);
  const reservationId = params.get("checkin");
  const tripId = params.get("trip");

  if (!reservationId || !tripId || !firebaseReady) return;

  const reservationRef = ref(
    db,
    `coasterReservations/${tripId}/${reservationId}`
  );

  runTransaction(reservationRef, (current) => {
    if (!current) return;

    if (current.status === "checked_in") return current;
    if (current.status !== "reserved") return;
    if (Number(current.expiresAt) <= Date.now()) return;

    return {
      ...current,
      status: "checked_in",
      checkedInAt: Date.now(),
    };
  })
    .then((result) => {
      const value = result.snapshot.val();
      if (value?.status === "checked_in") {
        if (
          activeReservation &&
          activeReservation.reservationId === reservationId
        ) {
          activeReservation = { ...activeReservation, status: "checked_in" };
          localStorage.setItem(
            LOCAL_RESERVATION_KEY,
            JSON.stringify(activeReservation)
          );
        }
        showToast("Check-in successful. Enjoy your coaster ride!");
      } else {
        showToast("This reservation is expired or invalid.");
      }
      cleanCheckinUrl();
      render();
    })
    .catch((err) => {
      console.error("Check-in failed:", err);
      showToast("Check-in could not be completed.");
    });
}

function cleanCheckinUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("checkin");
  url.searchParams.delete("trip");
  history.replaceState({}, "", url.pathname + url.search + url.hash);
}

function makeLiveQr() {
  liveQr.innerHTML = "";
  if (typeof QRCode === "undefined") return;

  const url = new URL(location.href);
  url.search = "";
  url.hash = "";

  new QRCode(liveQr, {
    text: url.toString(),
    width: 90,
    height: 90,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function makeCheckinQr() {
  checkinQr.innerHTML = "";

  if (!activeReservation) return;

  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("checkin", activeReservation.reservationId);
  url.searchParams.set("trip", activeReservation.tripId);

  if (typeof QRCode === "undefined") {
    checkinQr.textContent = "QR generator unavailable.";
    return;
  }

  new QRCode(checkinQr, {
    text: url.toString(),
    width: 134,
    height: 134,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// ================= UI =================
function populateTrips() {
  const trips = upcomingTrips();
  const previous = tripSelect.value;

  tripSelect.innerHTML = "";
  trips.forEach((trip) => {
    const option = document.createElement("option");
    option.value = trip.key;
    option.textContent = `${formatTripTime(trip.departureMin)} departure`;
    tripSelect.appendChild(option);
  });

  if (trips.some((t) => t.key === previous)) {
    tripSelect.value = previous;
  } else if (trips.length) {
    tripSelect.value = trips[0].key;
  }

  selectedTrip = getSelectedTrip();
  tripDate.textContent = selectedTrip ? selectedTrip.dateKey : "";
}

function renderSchedule() {
  const trips = allTripsForDate(getManilaDateKey());
  scheduleList.innerHTML = "";

  trips.forEach((trip) => {
    const chip = document.createElement("span");
    chip.className = "schedule-chip";
    chip.textContent = formatTripTime(trip.departureMin);
    scheduleList.appendChild(chip);
  });

  const breakChip = document.createElement("span");
  breakChip.className = "schedule-chip break";
  breakChip.textContent = "Break 11:40 AM–1:00 PM";
  scheduleList.appendChild(breakChip);
}

function getTripStats(trip) {
  if (!trip) return { occupied: 0, available: CAPACITY };

  const active = activeReservationsForTrip(trip.key);
  const occupied = Object.keys(active).length;
  return { occupied, available: Math.max(0, CAPACITY - occupied) };
}

function renderReservation() {
  if (!activeReservation) {
    reservationPanel.hidden = true;
    cancelBtn.hidden = true;
    return;
  }

  const tripTime = formatTripTime(activeReservation.departureMin);
  reservationPanel.hidden = false;
  cancelBtn.hidden = false;
  reserveBtn.hidden = true;

  reservationTrip.textContent =
    `Departure: ${tripTime} • ${activeReservation.dateKey}`;

  const remaining = Math.max(0, activeReservation.expiresAt - Date.now());
  const mm = String(Math.floor(remaining / 60000)).padStart(2, "0");
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
  reservationTimer.textContent = `${mm}:${ss}`;

  const oneMinuteLeft = remaining > 0 && remaining <= 60 * 1000;
  reminderBox.hidden = !oneMinuteLeft;

  if (activeReservation.status === "checked_in") {
    checkinStatus.textContent = "✅ Checked in successfully.";
    checkinStatus.style.color = "#18785F";
    reminderBox.hidden = true;
  } else {
    checkinStatus.textContent = "Waiting for check-in…";
    checkinStatus.style.color = "";
  }

  makeCheckinQr();

  if (remaining <= 0 && activeReservation.status !== "checked_in") {
    clearLocalReservation();
    showToast("Your 10-minute reservation has expired.");
    reservationPanel.hidden = true;
    cancelBtn.hidden = true;
    reserveBtn.hidden = false;
  }
}

function render() {
  const now = new Date();
  phClock.textContent = `🇵🇭 ${formatManilaClock(now)}`;

  if (!firebaseReady && !firebaseError) {
    slotCount.textContent = "Connecting...";
    reserveBtn.disabled = true;
    tripSelect.disabled = true;
    return;
  }

  if (firebaseError) {
    slotCount.textContent = "Connection error";
    tripLabel.textContent = "Live sync unavailable — check your connection.";
    reserveBtn.disabled = true;
    tripSelect.disabled = true;
    return;
  }

  populateTrips();
  renderSchedule();

  const trip = getSelectedTrip();
  const stats = getTripStats(trip);
  selectedTrip = trip;

  slotCount.innerHTML =
    `<span class="available-num">${stats.available}</span> / ${CAPACITY} seats open`;

  const p = getManilaParts(now);
  const nowMin = p.hour * 60 + p.minute;

  statusBox.classList.remove(
    "status-open",
    "status-filling",
    "status-full",
    "status-closed"
  );

  if (trip && isBreak(nowMin)) {
    statusBox.classList.add("status-closed");
    statusIcon.textContent = "☕";
    tripLabel.textContent = "Break until 1:00 PM";
  } else if (!trip) {
    statusBox.classList.add("status-closed");
    statusIcon.textContent = "🌙";
    tripLabel.textContent = "No more departures today.";
  } else if (stats.available === 0) {
    statusBox.classList.add("status-full");
    statusIcon.textContent = "🚫";
    tripLabel.textContent = `${formatTripTime(trip.departureMin)} trip is full`;
  } else if (stats.available <= 7) {
    statusBox.classList.add("status-filling");
    statusIcon.textContent = "⏳";
    tripLabel.textContent = `Next selected departure: ${formatTripTime(trip.departureMin)}`;
  } else {
    statusBox.classList.add("status-open");
    statusIcon.textContent = "🎟️";
    tripLabel.textContent = `Next selected departure: ${formatTripTime(trip.departureMin)}`;
  }

  scheduleBanner.hidden = true;
  if (isBreak(nowMin)) {
    scheduleBanner.hidden = false;
    scheduleMessage.textContent =
      "☕ Coaster break: 11:40 AM–1:00 PM. Service resumes at 1:00 PM.";
  } else if (nowMin < OPEN_MIN || nowMin > CLOSE_MIN) {
    scheduleBanner.hidden = false;
    scheduleMessage.textContent =
      "⏰ Service hours are 6:00 AM–9:00 PM (Manila time).";
  }

  tripSelect.disabled = Boolean(activeReservation);
  reserveBtn.disabled =
    Boolean(activeReservation) ||
    !trip ||
    stats.available <= 0 ||
    nowMin < OPEN_MIN ||
    nowMin > CLOSE_MIN ||
    isBreak(nowMin);

  renderReservation();
}

tripSelect.addEventListener("change", () => {
  selectedTrip = getSelectedTrip();
  render();
});

reserveBtn.addEventListener("click", reserveSeat);
cancelBtn.addEventListener("click", cancelReservation);

// ================= TIMER / CLEANUP =================
let tick = 0;
setInterval(() => {
  tick++;

  if (activeReservation && Date.now() >= activeReservation.expiresAt) {
    clearLocalReservation();
  }

  render();

  // Remove expired records from each visible trip occasionally.
  if (firebaseReady && tick % 30 === 0) pruneExpiredReservations();
}, 1000);

async function pruneExpiredReservations() {
  const today = getManilaDateKey();
  const tripIds = allTripsForDate(today).map((t) => t.key);

  for (const id of tripIds) {
    const tripRef = ref(db, `coasterReservations/${id}`);
    try {
      await runTransaction(tripRef, (current) => {
        if (!current) return current;
        const active = activeReservationsForTripFromObject(current, Date.now());
        return Object.keys(active).length ? active : null;
      });
    } catch (err) {
      console.warn("Prune failed for", id, err);
    }
  }
}

// Initial setup
populateTrips();
makeLiveQr();
render();

// Check-in links are processed once after Firebase becomes available.
onValue(reservationsRef, () => {
  if (!checkInProcessed && new URLSearchParams(location.search).has("checkin")) {
    checkInProcessed = true;
    checkInFromUrl();
  }
});
