// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDtkZE_OCad8dLlbFwAMFaCCC048cy6UQc",
  authDomain: "coaster-reservation.firebaseapp.com",
  databaseURL: "https://coaster-reservation-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coaster-reservation",
  storageBucket: "coaster-reservation.firebasestorage.app",
  messagingSenderId: "308183827970",
  appId: "1:308183827970:web:60b5e3ba8c4dfc7657491b"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const CAPACITY = 30;
const RESERVATION_HOLD_MS = 10 * 60 * 1000;
const TZ = "Asia/Manila";

let serverTimeOffset = 0;

db.ref(".info/serverTimeOffset").on("value", (snap) => {
  serverTimeOffset = snap.val() || 0;
});

function getSyncedNow() {
  return Date.now() + serverTimeOffset;
}

const DRIVER_EMAIL = "coastermcc@gmail.com";
const DRIVER_PASSWORD = "123456789";

let reservations = {};
let coasterAvailable = true;
let coasterFull = false;
let isDriverLoggedIn = sessionStorage.getItem("driver_logged_in") === "true";
let activeTimerInterval = null;

function getDeviceId() {
  let id = localStorage.getItem("coaster_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("coaster_device_id", id);
  }
  return id;
}
const deviceId = getDeviceId();

// DOM Elements
const slotCount = document.getElementById("slot-count");
const phClock = document.getElementById("ph-clock");
const reserveBtn = document.getElementById("reserve-btn");
const cancelBtn = document.getElementById("cancel-btn");
const reservationPanel = document.getElementById("reservation-panel");
const reservationTrip = document.getElementById("reservation-trip");
const reservationTimer = document.getElementById("reservation-timer");
const checkinQr = document.getElementById("checkin-qr");
const seatGrid = document.getElementById("seat-grid");
const syncIndicator = document.getElementById("sync-indicator");
const toast = document.getElementById("toast");
const availabilityBanner = document.getElementById("availability-banner");
const availabilityMessage = document.getElementById("availability-message");
const roleSelectScreen = document.getElementById("role-select-screen");
const roleStudentBtn = document.getElementById("role-student-btn");
const roleDriverBtn = document.getElementById("role-driver-btn");
const switchRoleBtn = document.getElementById("switch-role-btn");
const loginModal = document.getElementById("login-modal");
const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const loginCancel = document.getElementById("login-cancel");
const driverPanel = document.getElementById("driver-panel");
const driverLogout = document.getElementById("driver-logout");
const markAvailableBtn = document.getElementById("mark-available-btn");
const markUnavailableBtn = document.getElementById("mark-unavailable-btn");
const markFullBtn = document.getElementById("mark-full-btn");
const markNotFullBtn = document.getElementById("mark-not-full-btn");
const driverCurrentStatus = document.getElementById("driver-current-status");
const capacityBarFill = document.getElementById("capacity-bar-fill");
const selectDapdapMabiga = document.getElementById("select-dapdap-mabiga");
const selectMabigaDapdap = document.getElementById("select-mabiga-dapdap");

let selectedTrip = null;
let activeReservation = JSON.parse(localStorage.getItem("active_res") || "null");

// Schedules
const dapdapToMabigaTimes = [
  { label: "6:00 AM", val: "dapdap_mabiga_0600" },
  { label: "6:40 AM", val: "dapdap_mabiga_0640" },
  { label: "7:20 AM", val: "dapdap_mabiga_0720" },
  { label: "8:00 AM", val: "dapdap_mabiga_0800" },
  { label: "10:00 AM", val: "dapdap_mabiga_1000" },
  { label: "10:40 AM", val: "dapdap_mabiga_1040" },
  { label: "11:20 AM", val: "dapdap_mabiga_1120" },
  { label: "1:00 PM", val: "dapdap_mabiga_1300" },
  { label: "2:00 PM", val: "dapdap_mabiga_1400" },
  { label: "3:00 PM", val: "dapdap_mabiga_1500" },
  { label: "4:00 PM", val: "dapdap_mabiga_1600" },
  { label: "5:00 PM", val: "dapdap_mabiga_1700" },
  { label: "6:00 PM", val: "dapdap_mabiga_1800" },
  { label: "7:00 PM", val: "dapdap_mabiga_1900" },
  { label: "8:00 PM", val: "dapdap_mabiga_2000" },
  { label: "9:10 PM", val: "dapdap_mabiga_2110" }
];

const mabigaToDapdapTimes = [
  { label: "6:20 AM", val: "mabiga_dapdap_0620" },
  { label: "7:00 AM", val: "mabiga_dapdap_0700" },
  { label: "7:40 AM", val: "mabiga_dapdap_0740" },
  { label: "8:20 AM", val: "mabiga_dapdap_0820" },
  { label: "10:20 AM", val: "mabiga_dapdap_1020" },
  { label: "11:00 AM", val: "mabiga_dapdap_1100" },
  { label: "11:40 AM", val: "mabiga_dapdap_1140" },
  { label: "1:20 PM", val: "mabiga_dapdap_1320" },
  { label: "2:20 PM", val: "mabiga_dapdap_1420" },
  { label: "3:20 PM", val: "mabiga_dapdap_1520" },
  { label: "4:20 PM", val: "mabiga_dapdap_1620" },
  { label: "5:20 PM", val: "mabiga_dapdap_1720" },
  { label: "6:20 PM", val: "mabiga_dapdap_1820" },
  { label: "7:20 PM", val: "mabiga_dapdap_1920" },
  { label: "8:20 PM", val: "mabiga_dapdap_2020" }
];

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

function updateClockOnly() {
  const now = new Date();
  phClock.textContent = `🇵🇭 ${now.toLocaleTimeString("en-US", { timeZone: TZ })}`;
}

function renderTripOptions(dateKey) {
  selectDapdapMabiga.innerHTML = '<option value="" disabled selected>-- Select Time --</option>';
  dapdapToMabigaTimes.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = `${dateKey}_${item.val}`;
    opt.textContent = `${item.label} (Dapdap → Mabiga)`;
    selectDapdapMabiga.appendChild(opt);
  });

  selectMabigaDapdap.innerHTML = '<option value="" disabled selected>-- Select Time --</option>';
  mabigaToDapdapTimes.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = `${dateKey}_${item.val}`;
    opt.textContent = `${item.label} (Mabiga → Dapdap)`;
    selectMabigaDapdap.appendChild(opt);
  });

  if (!selectedTrip) {
    const defaultTrip = `${dateKey}_dapdap_mabiga_0600`;
    selectedTrip = defaultTrip;
    selectDapdapMabiga.value = defaultTrip;
  }
}

function renderUI() {
  updateClockOnly();
  const dateKey = new Date().toISOString().split("T")[0];

  if (!coasterAvailable) {
    availabilityBanner.hidden = false;
    availabilityMessage.textContent = "Coaster marked UNAVAILABLE by driver.";
  } else if (coasterFull) {
    availabilityBanner.hidden = false;
    availabilityMessage.textContent = "Coaster marked FULL by driver.";
  } else {
    availabilityBanner.hidden = true;
  }

  if (selectDapdapMabiga.options.length <= 1) {
    renderTripOptions(dateKey);
  }

  renderSeats();
  renderReservationUI();
  driverCurrentStatus.textContent = `Status: ${coasterAvailable ? 'AVAILABLE' : 'UNAVAILABLE'} | ${coasterFull ? 'FULL' : 'NOT FULL'}`;
}

// Select Wheel Events
selectDapdapMabiga.addEventListener("change", (e) => {
  selectedTrip = e.target.value;
  selectMabigaDapdap.selectedIndex = 0;
  renderUI();
});

selectMabigaDapdap.addEventListener("change", (e) => {
  selectedTrip = e.target.value;
  selectDapdapMabiga.selectedIndex = 0;
  renderUI();
});

function renderSeats() {
  seatGrid.innerHTML = "";
  const tripData = reservations[selectedTrip] || {};
  let reservedCount = 0;

  for (let i = 1; i <= CAPACITY; i++) {
    const seatEl = document.createElement("div");
    seatEl.className = "seat";

    const resEntry = Object.values(tripData).find(r => r.seatNumber === i && r.status === "ACTIVE");

    if (resEntry) {
      reservedCount++;
      if (resEntry.deviceId === deviceId) {
        seatEl.classList.add("mine");
        seatEl.innerHTML = `S${i}<br>YOU`;
      } else {
        seatEl.classList.add("reserved");
        seatEl.innerHTML = `S${i}<br>TAKEN`;
      }
    } else {
      seatEl.innerHTML = `S${i}<br>FREE`;
    }
    seatGrid.appendChild(seatEl);
  }

  const free = CAPACITY - reservedCount;
  slotCount.innerHTML = `<span class="available-num">${free}</span> / ${CAPACITY} Free`;
  capacityBarFill.style.width = `${(reservedCount / CAPACITY) * 100}%`;
}

function renderReservationUI() {
  if (activeReservation && activeReservation.status === "ACTIVE") {
    reservationPanel.hidden = false;
    reserveBtn.hidden = true;
    cancelBtn.hidden = false;
    reservationTrip.textContent = `Trip: ${activeReservation.tripId}`;
    
    if (window.QRCode && checkinQr.children.length === 0) {
      new QRCode(checkinQr, { text: activeReservation.id, width: 120, height: 120 });
    }
    
    startTimer();
  } else {
    reservationPanel.hidden = true;
    reserveBtn.hidden = false;
    cancelBtn.hidden = true;
    checkinQr.innerHTML = "";
    stopTimer();
  }
}

function startTimer() {
  if (activeTimerInterval) return;

  function updateCountdown() {
    if (!activeReservation || !activeReservation.expiresAt) {
      stopTimer();
      return;
    }

    const now = getSyncedNow();
    const remaining = activeReservation.expiresAt - now;

    if (remaining <= 0) {
      stopTimer();
      reservationTimer.textContent = "00:00";
      
      db.ref(`reservations/${activeReservation.tripId}/${activeReservation.id}/status`).set("EXPIRED");
      localStorage.removeItem("active_res");
      activeReservation = null;
      showToast("Reservation Expired!");
      renderUI();
      return;
    }

    const totalSecs = Math.floor(remaining / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    reservationTimer.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  updateCountdown();
  activeTimerInterval = setInterval(updateCountdown, 1000);
}

function stopTimer() {
  if (activeTimerInterval) {
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
  }
}

// Database Listeners
db.ref(".info/connected").on("value", (snap) => {
  syncIndicator.textContent = snap.val() ? "Live Sync Active" : "Offline";
});

db.ref("reservations").on("value", (snap) => {
  reservations = snap.val() || {};

  let foundActive = null;
  Object.keys(reservations).forEach((tripKey) => {
    const trip = reservations[tripKey];
    Object.values(trip).forEach((res) => {
      if (res.deviceId === deviceId && res.status === "ACTIVE") {
        foundActive = res;
      }
    });
  });

  if (foundActive) {
    activeReservation = foundActive;
    localStorage.setItem("active_res", JSON.stringify(foundActive));
  } else if (activeReservation && activeReservation.status === "ACTIVE") {
    activeReservation = null;
    localStorage.removeItem("active_res");
  }

  renderUI();
});

db.ref("coasterAvailability").on("value", (snap) => {
  const data = snap.val() || {};
  coasterAvailable = data.available !== false;
  coasterFull = data.full === true;
  renderUI();
});

// Control Handlers
reserveBtn.addEventListener("click", () => {
  if (!coasterAvailable || coasterFull) return showToast("Coaster unavailable.");

  const tripData = reservations[selectedTrip] || {};
  const active = Object.values(tripData).filter(r => r.status === "ACTIVE");

  if (active.length >= CAPACITY) return showToast("Trip is full.");

  const taken = active.map(r => r.seatNumber);
  let nextSeat = 1;
  while (taken.includes(nextSeat)) nextSeat++;

  const resId = "res_" + Date.now();
  const expiresAt = getSyncedNow() + RESERVATION_HOLD_MS;

  const newRes = {
    id: resId,
    deviceId,
    seatNumber: nextSeat,
    status: "ACTIVE",
    expiresAt: expiresAt,
    tripId: selectedTrip
  };

  db.ref(`reservations/${selectedTrip}/${resId}`).set(newRes)
    .then(() => {
      activeReservation = newRes;
      localStorage.setItem("active_res", JSON.stringify(newRes));
      showToast(`Seat ${nextSeat} Reserved!`);
      renderUI();
    })
    .catch((err) => showToast("Permission Error: " + err.message));
});

cancelBtn.addEventListener("click", () => {
  if (!activeReservation) return;
  
  db.ref(`reservations/${activeReservation.tripId}/${activeReservation.id}/status`).set("CANCELLED")
    .then(() => {
      stopTimer();
      activeReservation = null;
      localStorage.removeItem("active_res");
      showToast("Reservation Cancelled.");
      renderUI();
    })
    .catch((err) => showToast("Error: " + err.message));
});

// Driver Panel Handlers
markAvailableBtn.addEventListener("click", () => {
  db.ref("coasterAvailability/available").set(true)
    .then(() => showToast("Updated: Available"))
    .catch((err) => showToast("Error: " + err.message));
});

markUnavailableBtn.addEventListener("click", () => {
  db.ref("coasterAvailability/available").set(false)
    .then(() => showToast("Updated: Unavailable"))
    .catch((err) => showToast("Error: " + err.message));
});

markFullBtn.addEventListener("click", () => {
  db.ref("coasterAvailability/full").set(true)
    .then(() => showToast("Updated: Marked Full"))
    .catch((err) => showToast("Error: " + err.message));
});

markNotFullBtn.addEventListener("click", () => {
  db.ref("coasterAvailability/full").set(false)
    .then(() => showToast("Updated: Marked Not Full"))
    .catch((err) => showToast("Error: " + err.message));
});

// Navigation & Auth
switchRoleBtn.addEventListener("click", () => { roleSelectScreen.hidden = false; });
roleStudentBtn.addEventListener("click", () => { roleSelectScreen.hidden = true; driverPanel.hidden = true; });
roleDriverBtn.addEventListener("click", () => {
  roleSelectScreen.hidden = true;
  if (isDriverLoggedIn) driverPanel.hidden = false;
  else loginModal.hidden = false;
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (loginEmail.value === DRIVER_EMAIL && loginPassword.value === DRIVER_PASSWORD) {
    isDriverLoggedIn = true;
    sessionStorage.setItem("driver_logged_in", "true");
    loginModal.hidden = true;
    driverPanel.hidden = false;
  } else {
    loginError.textContent = "Invalid login credentials";
    loginError.hidden = false;
  }
});

loginCancel.addEventListener("click", () => loginModal.hidden = true);
driverLogout.addEventListener("click", () => {
  isDriverLoggedIn = false;
  sessionStorage.removeItem("driver_logged_in");
  driverPanel.hidden = true;
});

// Clock Tick Loop
setInterval(updateClockOnly, 1000);
