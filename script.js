import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, onValue, set, runTransaction } 
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

// ⬇️ REPLACE THIS WITH YOUR REAL CONFIG FROM FIREBASE PROJECT SETTINGS ⬇️
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "coaster-monitoring-system.firebaseapp.com",
  databaseURL: "https://coaster-monitoring-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coaster-monitoring-system",
  storageBucket: "coaster-monitoring-system.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
// ⬆️ REPLACE THIS WITH YOUR REAL CONFIG FROM FIREBASE PROJECT SETTINGS ⬆️

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const filledRef = ref(db, "filled");

const totalSlots = 20;
const slotCountEl = document.getElementById("slot-count");
const statusBox = document.getElementById("status-box");

function updateDisplay(filled) {
  const remaining = totalSlots - filled;
  if (remaining <= 0) {
    slotCountEl.textContent = "🚫 COASTER FULL";
    statusBox.classList.add("full");
  } else {
    slotCountEl.textContent = `✅ ${remaining} of ${totalSlots} slots available`;
    statusBox.classList.remove("full");
  }
}

// Listen for real-time changes across all devices
onValue(filledRef, (snapshot) => {
  const filled = snapshot.val() || 0;
  updateDisplay(filled);
});

document.getElementById("board-btn").addEventListener("click", () => {
  runTransaction(filledRef, (current) => (current || 0) + 1);
});

document.getElementById("exit-btn").addEventListener("click", () => {
  runTransaction(filledRef, (current) => Math.max((current || 0) - 1, 0));
});

document.getElementById("reset-btn").addEventListener("click", () => {
  set(filledRef, 0);
});
