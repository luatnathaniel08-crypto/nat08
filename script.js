// Global Timer Variable
let activeTimerInterval = null;

function renderReservation() {
  if (activeReservation && activeReservation.status === "ACTIVE") {
    reservationPanel.hidden = false;
    reserveBtn.hidden = true;
    cancelBtn.hidden = false;
    reservationTrip.textContent = `Trip: ${activeReservation.tripId}`;
    
    // Generate QR Code if empty
    if (window.QRCode && checkinQr.innerHTML === "") {
      new QRCode(checkinQr, { text: activeReservation.id, width: 120, height: 120 });
    }
    
    // Start countdown timer if not already running
    startReservationTimer();
  } else {
    reservationPanel.hidden = true;
    reserveBtn.hidden = false;
    cancelBtn.hidden = true;
    checkinQr.innerHTML = "";
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
  }
}

function startReservationTimer() {
  if (activeTimerInterval) return; // Prevent multiple overlapping intervals

  function updateTimer() {
    if (!activeReservation) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      return;
    }

    const now = Date.now();
    const remainingMs = activeReservation.expiresAt - now;

    if (remainingMs <= 0) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      reservationTimer.textContent = "00:00";
      
      // Expire the reservation automatically
      set(ref(db, `reservations/${activeReservation.tripId}/${activeReservation.id}/status`), "EXPIRED");
      localStorage.removeItem("active_res");
      activeReservation = null;
      showToast("Reservation expired!");
      renderUI();
      return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    reservationTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  updateTimer(); // Run immediately
  activeTimerInterval = setInterval(updateTimer, 1000);
}

// Seat Reservation Click Handler
reserveBtn.addEventListener("click", () => {
  if (!coasterAvailable || coasterFull) return showToast("Coaster unavailable.");

  const tripData = reservations[selectedTrip] || {};
  const active = Object.values(tripData).filter(r => r.status === "ACTIVE");

  if (active.length >= CAPACITY) return showToast("Trip is full.");

  const taken = active.map(r => r.seatNumber);
  let nextSeat = 1;
  while (taken.includes(nextSeat)) nextSeat++;

  const resId = "res_" + Date.now();
  const expiresAt = Date.now() + RESERVATION_HOLD_MS; // Fixed 10-minute mark

  const newRes = {
    id: resId,
    deviceId,
    seatNumber: nextSeat,
    status: "ACTIVE",
    expiresAt: expiresAt,
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
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      activeReservation = null;
      localStorage.removeItem("active_res");
      showToast("Reservation Cancelled.");
      renderUI();
    })
    .catch((err) => showToast("Error: " + err.message));
});
