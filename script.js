const totalSlots = 20;

// Load saved count, or start at 0
let filledSlots = parseInt(localStorage.getItem("filledSlots")) || 0;

const slotCountEl = document.getElementById("slot-count");
const statusBox = document.getElementById("status-box");

function updateDisplay() {
  const remaining = totalSlots - filledSlots;

  if (remaining <= 0) {
    slotCountEl.textContent = "🚫 COASTER FULL";
    statusBox.classList.add("full");
  } else {
    slotCountEl.textContent = `✅ ${remaining} of ${totalSlots} slots available`;
    statusBox.classList.remove("full");
  }

  localStorage.setItem("filledSlots", filledSlots);
}

document.getElementById("board-btn").addEventListener("click", () => {
  if (filledSlots < totalSlots) {
    filledSlots++;
    updateDisplay();
  }
});

document.getElementById("exit-btn").addEventListener("click", () => {
  if (filledSlots > 0) {
    filledSlots--;
    updateDisplay();
  }
});

document.getElementById("reset-btn").addEventListener("click", () => {
  filledSlots = 0;
  updateDisplay();
});

updateDisplay();
