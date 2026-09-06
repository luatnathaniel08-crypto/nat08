# MCCoasterGo — Database & Login Flow Documentation

This document explains how the reservation website stores data to, and
reads data from, the database — and how the new Student/Driver login
screen fits into that flow. Pair it with **Database_Flow_Chart.mermaid**
(the visual diagram) when writing this up for your report.

---

## 1. Database used

The site uses **Firebase Realtime Database** (project
`coaster-monitoring-system`), reached through the Firebase JavaScript SDK,
loaded as ES modules directly inside `script.js`. There is no custom
backend server — the browser talks to Firebase directly.

## 2. Data structure (the "tables")

| Path | What it holds |
|---|---|
| `coasterReservations/{tripKey}/{reservationId}` | One object per active reservation: `deviceId`, `seatNo`, `status` (`reserved` / `checked_in` / `cancelled`), `createdAt`, `expiresAt`, `departureMin`, `dateKey`. |
| `coasterAvailability` | A single object the driver controls: `available` (bool), `full` (bool), `updatedAt`, `updatedBy`. |
| `reservationIds` | Used only to mint unique reservation IDs via Firebase's `push()`; not read back as data. |
| `.info/connected` | A built-in Firebase path that reports whether this browser currently has a live connection. |

`tripKey` looks like `2026-09-06_0480` — the date plus the departure time
in minutes-since-midnight, so every 20-minute departure gets its own
bucket of up to 30 reservations.

## 3. Storing data (WRITE flows)

### a. Reserving a seat (student)
1. Student taps **Reserve Seat**.
2. `reserveSeat()` runs a Firebase **transaction** on the whole
   `coasterReservations` tree. A transaction re-reads the latest data and
   retries automatically if two people tap Reserve at the same instant, so
   two students can never be given the same seat.
3. Inside the transaction: it checks this device doesn't already hold a
   reservation anywhere, checks the trip isn't at the 30-seat cap, picks
   the lowest free seat number, and writes the new reservation with a
   10-minute expiry (capped so it never runs past the coaster's actual
   departure time).
4. On success, the same reservation is also cached in the browser's
   `localStorage` so the student's own device remembers it after a
   refresh.

### b. Cancelling a reservation
`cancelReservation()` runs a transaction on that one trip's node and
removes the reservation, but only if it belongs to the current device.

### c. Checking in (scanning the seat QR code)
Each active reservation gets its own QR code linking back to the site with
`?checkin=<reservationId>&trip=<tripKey>` in the URL. When that link is
opened, `checkInFromUrl()` runs a transaction on that exact reservation
and sets `status: "checked_in"`, but only if it is still valid (not
expired, not already cancelled).

### d. Driver: setting availability / fullness
`setCoasterAvailability(true|false)` and `setCoasterFull(true|false)` both
call Firebase's `update()` — not `set()` — on `coasterAvailability`.
`update()` merges in only the field that changed, so toggling "Full"
never accidentally erases the "Available" flag, and vice versa.

### e. Cleaning up
Every 30 seconds, `pruneExpiredReservations()` runs a transaction on each
of today's trips and drops any reservation whose expiry timestamp has
passed, so the seat count stays accurate even if a student never comes
back to cancel.

## 4. Pulling data (READ flows)

The app never polls or repeatedly re-fetches. It subscribes **once** with
`onValue()`, and Firebase pushes new data to every subscribed client the
moment anything changes:

- `onValue(reservationsRef, ...)` — keeps a local copy of the whole
  `coasterReservations` tree in memory. The seat grid and the
  "X of 30 seats open" counter are recalculated from this copy on *every*
  connected device, which is what makes the seat count feel real-time.
- `onValue(availabilityRef, ...)` — keeps `coasterAvailable` and
  `coasterFull` in sync. Drives the red/amber banner, the color of the
  status box, the Driver Panel's own status line, and whether the
  **Reserve Seat** button is clickable at all.
- `onValue(connectedRef, ...)` — Firebase's own `.info/connected` path;
  drives the small "Live sync / Offline" pill.

> **Note on scale:** because it listens to the *whole* `coasterReservations`
> tree, every client downloads all trips' data, not just the one they have
> selected. That's fine at this project's scale (a handful of trips a day,
> 30 seats each) — it would need restructuring (reading only the selected
> trip) if the schedule grew much larger.

## 5. Why it feels "real-time"

Every open tab — a student's phone, another student's phone, the driver's
tablet — is subscribed to the same two `onValue()` listeners. A write from
any one of them (a new reservation, a cancellation, a driver toggling
availability) is pushed by Firebase to every other connected client
within roughly a second, with no page refresh needed.

## 6. The new Student/Driver login flow

1. **On load**, a "Who's using this device?" screen blocks everything
   else until a role is picked.
2. **Student** → the screen is dismissed and the ordinary reservation UI
   (trip picker, seat grid, Reserve Seat button) is revealed underneath.
   This choice is remembered in the browser's `sessionStorage`
   (`coaster_role_v1`) for the rest of that tab, so refreshing the page
   doesn't ask again.
3. **Driver** → an email + password form appears instead. A correct
   `coastermcc@gmail.com` / `123456789` combination reveals the
   **Driver Panel** and hides the student-only sections (trip picker,
   Reserve/Cancel buttons, daily schedule, QR section) so the driver gets
   a focused dashboard. A wrong combination shows an inline error and lets
   them try again.
4. The Driver Panel has two independent toggle pairs, each writing to
   `coasterAvailability` as described in §3d:
   - **✅ Available / 🚫 Not Available**
   - **🟢 Not Full / 🔴 Full**
   Both take effect for every student instantly, through the same
   `onValue(availabilityRef, ...)` listener described in §4.
5. **🔁 Switch Role** (top of the card) logs the driver out if needed and
   brings back the role screen — useful when one physical device (e.g. a
   tablet mounted at the pickup point) is handed between the driver and
   students throughout the day.

## 7. Security note (please read before submitting/deploying)

This is a static front-end with no server, so the driver credentials are
compared directly inside `script.js`. Anyone who opens the browser's
developer tools can read them in plain text — this is **not** real
authentication, just a simple gate suitable for a class prototype. If this
project ever needs to protect something that matters, replace it with
real **Firebase Authentication** (email/password sign-in) plus **Realtime
Database security rules** that check the signed-in user's email before
allowing writes to `coasterAvailability`.
