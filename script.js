import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtkZE_OCad8dLlbFwAMFaCCC048cy6UQc",
  authDomain: "coaster-reservation.firebaseapp.com",
  databaseURL: "https://coaster-reservation-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coaster-reservation",
  storageBucket: "coaster-reservation.firebasestorage.app",
  messagingSenderId: "308183827970",
  appId: "1:308183827970:web:60b5e3ba8c4dfc7657491b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const CAPACITY = 30;
const RESERVATION_HOLD_MS = 10 * 60 * 1000;
const TZ = "Asia/Manila";

const DRIVER_EMAIL = "coastermcc@gmail.com";
const DRIVER_PASSWORD = "123456789";

let reservations = {};
let coasterAvailable = true;
let coasterFull = false;
let isDriverLoggedIn = sessionStorage.getItem("driver_logged_in") === "true";

function getDeviceId() {
  let id = localStorage.getItem("coaster_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("coaster_device_id", id);
  }
  return id;
}
const deviceId = getDeviceId();

const slotCount = document.getElementById("slot-count");
const phClock = document.getElementById("ph-clock");
const tripSelect = document.getElementById("trip-select");
const tripDate = document.getElementById("trip-date");
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

let selectedTrip = null;
let activeReservation = JSON.parse(localStorage.getItem("active_res") || "null");
let timerInterval = null;

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

function renderUI() {
  const now = new Date();
  phClock.textContent = `🇵🇭 ${now.toLocaleTimeString("en-US", { timeZone: TZ })}`;
  
  const dateKey = now.toISOString().split("T")[0];
  tripDate.textContent = dateKey;

  if (!coasterAvailable) {
    availabilityBanner.hidden = false;
    availabilityMessage.textContent = "Coaster marked UNAVAILABLE by driver.";
  } else if (coasterFull) {
    availabilityBanner.hidden = false;
    availabilityMessage.textContent = "Coaster marked FULL by driver.";
  } else {
    availabilityBanner.hidden = true;
  }

  if (!selectedTrip) {
    selectedTrip = `${dateKey}_360`;
    renderTripOptions(dateKey);
  }

  renderSeats();
  renderReservation();
  driverCurrentStatus.textContent = `Status: ${coasterAvailable ? 'AVAILABLE' : 'UNAVAILABLE'} | ${coasterFull ? 'FULL' : 'NOT FULL'}`;
}

function renderTripOptions(dateKey) {
  tripSelect.innerHTML = "";
  for (let m = 360; m < 1260; m += 20) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const label = `${h % 12 || 12}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    const opt = document.createElement("option");
    opt.value = `${dateKey}_${m}`;
    opt.textContent = `${label} Departure`;
    tripSelect.appendChild(opt);
  }
}

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

function renderReservation() {
  if (activeReservation && activeReservation.status === "ACTIVE") {
    reservationPanel.hidden = false;
    reserveBtn.hidden = true;
    cancelBtn.hidden = false;
    reservationTrip.textContent = `Trip: ${activeReservation.tripId}`;
    
    checkinQr.innerHTML = "";
    if (window.QRCode) {
      new QRCode(checkinQr, { text: activeReservation.id, width: 120, height: 120 });
    }
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const left = Math.max(0, activeReservation.expiresAt - Date.now());
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      reservationTimer.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      if (left <= 0) {
        localStorage.removeItem("active_res");
        activeReservation = null;
        renderUI();
      }
    }, 1000);
  } else {
    reservationPanel.hidden = true;
    reserveBtn.hidden = false;
    cancelBtn.hidden = true;
  }
}

onValue(ref(db, ".info/connected"), (snap) => {
  syncIndicator.textContent = snap.val() ? "Live Sync Active" : "Offline";
});

onValue(ref(db, "reservations"), (snap) => {
  reservations = snap.val() || {};
  renderUI();
});

onValue(ref(db, "coasterAvailability"), (snap) => {
  const data = snap.val() || {};
  coasterAvailable = data.available !== false;
  coasterFull = data.full === true;
  renderUI();
});

reserveBtn.addEventListener("click", () => {
  if (!coasterAvailable || coasterFull) return showToast("Coaster unavailable.");

  const tripData = reservations[selectedTrip] || {};
  const active = Object.values(tripData).filter(r => r.status === "ACTIVE");

  if (active.length >= CAPACITY) return showToast("Trip is full.");

  const taken = active.map(r => r.seatNumber);
  let nextSeat = 1;
  while (taken.includes(nextSeat)) nextSeat++;

  const resId = "res_" + Date.now();
  const newRes = {
    id: resId,
    deviceId,
    seatNumber: nextSeat,
    status: "ACTIVE",
    expiresAt: Date.now() + RESERVATION_HOLD_MS,
    tripId: selectedTrip
  };

  set(ref(db, `reservations/${selectedTrip}/${resId}`), newRes)
    .then(() => {
      activeReservation = newRes;
      localStorage.setItem("active_res", JSON.stringify(newRes));
      showToast("Seat " + nextSeat + " Reserved!");
      renderUI();
    })
    .catch((err) => showToast("Permission Error: " + err.message));
});

cancelBtn.addEventListener("click", () => {
  if (!activeReservation) return;
  set(ref(db, `reservations/${activeReservation.tripId}/${activeReservation.id}/status`), "CANCELLED")
    .then(() => {
      activeReservation = null;
      localStorage.removeItem("active_res");
      showToast("Reservation Cancelled.");
      renderUI();
    })
    .catch((err) => showToast("Error: " + err.message));
});

markAvailableBtn.addEventListener("click", () => {
  set(ref(db, "coasterAvailability/available"), true)
    .then(() => showToast("Updated: Available"))
    .catch((err) => showToast("Error: " + err.message));
});

markUnavailableBtn.addEventListener("click", () => {
  set(ref(db, "coasterAvailability/available"), false)
    .then(() => showToast("Updated: Unavailable"))
    .catch((err) => showToast("Error: " + err.message));
});

markFullBtn.addEventListener("click", () => {
  set(ref(db, "coasterAvailability/full"), true)
    .then(() => showToast("Updated: Marked Full"))
    .catch((err) => showToast("Error: " + err.message));
});

markNotFullBtn.addEventListener("click", () => {
  set(ref(db, "coasterAvailability/full"), false)
    .then(() => showToast("Updated: Marked Not Full"))
    .catch((err) => showToast("Error: " + err.message));
});

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

tripSelect.addEventListener("change", (e) => {
  selectedTrip = e.target.value;
  renderUI();
});

setInterval(renderUI, 1000);