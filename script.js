<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCC Coaster Bus Reservation</title>
  <link rel="stylesheet" href="style.css">
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>
<body>

  <div class="card">
    <div class="card-inner">
      <div class="brand-row">
        <div>
          <h1>MCC Coaster Bus Reservation</h1>
          <p class="subtitle">Campus Shuttle Status</p>
        </div>
        <span class="capacity-badge">30 Seats Total</span>
      </div>

      <div class="ph-clock" id="ph-clock">🇵🇭 --:--:-- PM</div>

      <div class="utility-row">
        <button id="switch-role-btn" class="link-btn">Switch Role / Login</button>
      </div>

      <!-- Availability Banner -->
      <div id="availability-banner" class="availability-banner" hidden>
        <p id="availability-message">Coaster Bus marked UNAVAILABLE by driver.</p>
      </div>

      <!-- Role Selector -->
      <div id="role-select-screen" class="driver-panel" hidden>
        <div class="driver-panel-header">
          <strong>Select View Mode</strong>
        </div>
        <div class="driver-buttons">
          <button id="role-student-btn" class="btn board" style="padding: 8px;">Student View</button>
          <button id="role-driver-btn" class="btn exit" style="padding: 8px;">Driver Portal</button>
        </div>
      </div>

      <!-- Driver Control Panel -->
      <div id="driver-panel" class="driver-panel" hidden>
        <div class="driver-panel-header">
          <strong>Driver Controls</strong>
          <button id="driver-logout" class="link-btn">Logout</button>
        </div>
        <div class="driver-buttons">
          <button id="mark-available-btn" class="btn board" style="padding: 8px; font-size: 0.75rem;">Set Available</button>
          <button id="mark-unavailable-btn" class="btn exit" style="padding: 8px; font-size: 0.75rem;">Set Unavailable</button>
        </div>
        <div class="driver-buttons">
          <button id="mark-full-btn" class="btn exit" style="padding: 8px; font-size: 0.75rem;">Mark Full</button>
          <button id="mark-not-full-btn" class="btn board" style="padding: 8px; font-size: 0.75rem;">Mark Not Full</button>
        </div>
        <p id="driver-current-status" class="driver-current-status">Status: Loading...</p>
      </div>

      <!-- Schedule Selectors -->
      <div class="schedule-selectors">
        <div class="select-group">
          <label for="select-dapdap-mabiga">Dapdap to Mabiga:</label>
          <select id="select-dapdap-mabiga" class="trip-dropdown">
            <option value="" disabled selected>-- Select Time --</option>
          </select>
        </div>

        <div class="select-group">
          <label for="select-mabiga-dapdap">Mabiga to Dapdap:</label>
          <select id="select-mabiga-dapdap" class="trip-dropdown">
            <option value="" disabled selected>-- Select Time --</option>
          </select>
        </div>
      </div>

      <!-- Status Display -->
      <div id="status-box">
        <span id="status-icon">🚌</span>
        <div id="slot-count">
          <span class="available-num">30</span> / 30 Free
        </div>
      </div>

      <div class="capacity-bar">
        <div id="capacity-bar-fill" class="capacity-bar-fill" style="width: 0%;"></div>
      </div>

      <!-- Active Reservation Ticket Panel -->
      <div id="reservation-panel" class="reservation-panel" hidden>
        <strong id="reservation-trip">Trip Details</strong>
        <div class="timer-wrap">
          <span>Expires in:</span>
          <span id="reservation-timer">10:00</span>
        </div>
        <div id="checkin-qr" class="checkin-qr"></div>
      </div>

      <!-- Seat Grid -->
      <div class="seat-section">
        <div class="section-heading">
          <h2>Select a Seat</h2>
          <span id="sync-indicator" class="sync-indicator">Connecting...</span>
        </div>
        <div id="seat-grid" class="seat-grid">
          <!-- Dynamically Generated Seats -->
        </div>
      </div>

      <div id="controls">
        <button id="reserve-btn" class="btn board">Reserve Seat</button>
        <button id="cancel-btn" class="btn exit" hidden>Cancel Reservation</button>
      </div>
    </div>
  </div>

  <!-- Login Modal -->
  <div id="login-modal" class="modal-overlay" hidden>
    <div class="modal-card">
      <h3>Driver Authentication</h3>
      <form id="login-form">
        <label class="field-label" for="login-email">Email</label>
        <input type="email" id="login-email" required>
        
        <label class="field-label" for="login-password">Password</label>
        <input type="password" id="login-password" required>
        
        <p id="login-error" class="login-error" hidden>Invalid login credentials</p>
        
        <div class="modal-actions">
          <button type="submit" class="btn board" style="padding: 8px;">Login</button>
          <button type="button" id="login-cancel" class="btn exit" style="padding: 8px;">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <div id="toast" class="toast">Action completed!</div>

  <script src="script.js"></script>
</body>
</html>
