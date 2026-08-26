import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, onValue, set, runTransaction } 
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtkZE_OCad8dLLbFwAMFaCCC048cy6UQc",
  authDomain: "coaster-monitoring-system.firebaseapp.com",
  databaseURL: "https://coaster-monitoring-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coaster-monitoring-system",
  storageBucket: "coaster-monitoring-system.firebasestorage.app",
  messagingSenderId: "308183827970",
  appId: "1:308183827970:web:60b5e3ba8c4dfc7657491b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const filledRef = ref(db, "filled");

const totalSlots = 20;
const slotCountEl = document.getElementById("slot-count");
const statusBox = document.getElementById("status-box");
const boardBtn = document.getElementById("board-btn");
const exitBtn = document.getElementById("exit-btn");

// Track whether THIS device has already boarded
let hasBoarded = localStorage.getItem("hasBoarded") === "true";

function updateButtonStates() {
  boardBtn.disabled = hasBoarded;
  exitBtn.disabled = !hasBoarded;
}

function updateDisplay(filled) {
  const remaining = totalSlots - filled;
  const iconEl = document.getElementById("status-icon");

  if (remaining <= 0) {
    slotCountEl.textContent = "COASTER FULL";
    iconEl.textContent = "🚫";
    statusBox.classList.add("full");
  } else {
    slotCountEl.textContent = `${remaining} of ${totalSlots} slots available`;
    iconEl.textContent = "🎟️";
    statusBox.classList.remove("full");
  }
}

onValue(filledRef, (snapshot) => {
  const filled = snapshot.val() || 0;
  updateDisplay(filled);
});

boardBtn.addEventListener("click", () => {
  if (hasBoarded) return; // extra safety
  runTransaction(filledRef, (current) => (current || 0) + 1);
  hasBoarded = true;
  localStorage.setItem("hasBoarded", "true");
  updateButtonStates();
});

exitBtn.addEventListener("click", () => {
  if (!hasBoarded) return; // extra safety
  runTransaction(filledRef, (current) => Math.max((current || 0) - 1, 0));
  hasBoarded = false;
  localStorage.setItem("hasBoarded", "false");
  updateButtonStates();
});

document.getElementById("reset-btn").addEventListener("click", () => {
  set(filledRef, 0);
  hasBoarded = false;
  localStorage.setItem("hasBoarded", "false");
  updateButtonStates();
});

updateButtonStates();
