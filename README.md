# School Clinic Appointment, Queue, and Medical Record Management System

Event-Driven Programming project. HTML5, CSS3, vanilla JavaScript, Node.js, Express.js, MySQL, REST API.

**Two authenticated staff roles: ADMIN and NURSE. There is no Doctor role.** Booking, checking
status, and checking in still never require an account — a reference number is enough. Students
and school staff can *optionally* create a PATIENT account (`frontend/patient/register.html`) just
to view the history/status of their own appointments in one place after logging in
(`frontend/patient/dashboard.html`, `GET /api/appointments/mine`); they still cannot manage
schedules, other patients, or anything staff-only.

```
HOME -> BOOK APPOINTMENT -> SELECT SERVICE -> SELECT DATE -> SELECT TIME
     -> ENTER STUDENT/STAFF INFO -> SUBMIT -> GET REFERENCE
     -> CHECK STATUS -> CHECK IN -> QUEUE NUMBER -> CLINIC VISIT

(optional) CREATE ACCOUNT -> LOG IN -> MY APPOINTMENTS (history/status only)
```

> **If you already ran `npm start` / seeded data before this change:** the `users` table needs a new
> `patient_id` column that `schema.sql` only adds on a brand-new database. Drop the database once
> (e.g. in phpMyAdmin, or `DROP DATABASE school_clinic_system;`) and run `npm start` again so it gets
> recreated with the new column. Otherwise patient registration/login will fail with a MySQL "unknown
> column" error.

## 1. Architecture: Apache + Node + MySQL

```
Browser
  |
  v
XAMPP Apache  --serves-->  frontend/ (HTML, CSS, vanilla JS)
  |
  | fetch()
  v
Node.js + Express API (this repo's backend/, port 3000)
  |
  v
MySQL / MariaDB (via XAMPP)
```

- **Apache** serves the static `frontend/` folder. It is the address you open in your browser.
- **Node.js + Express** is the only backend. It answers `/api/...` requests on port 3000. Apache is
  never asked to run PHP or any server logic — it only hands out files.
- **MySQL/MariaDB** (through XAMPP) stores everything: staff accounts, patient records, schedules,
  appointments, the queue, and medical records.
- If Apache is not running, `npm start` also serves the same `frontend/` folder directly on port
  3000 as a fallback, so the system still works with only Node running. This is a fallback, not the
  normal setup: use Apache for daily use.

## 2. Run it

**XAMPP Control Panel:**
1. Click **Start** next to **Apache**.
2. Click **Start** next to **MySQL**.

**Put the project where Apache can see it**, then open it in your browser at that Apache address, for example:
`C:\xampp\htdocs\school-clinic-system` -> `http://localhost/school-clinic-system/frontend/`

**VS Code terminal, in the project folder:**
```
node -v
npm install
npm start
```
`npm start` runs `backend/server.js`, which connects to MySQL, creates the database and tables from
`schema.sql` if they don't exist yet, adds demo data the first time, and starts listening on port
3000 for the frontend's `fetch()` calls.

You should see:
```
School Clinic API is running on http://localhost:3000
Open the website through Apache, for example: http://localhost/school-clinic-system/
```

Leave that terminal running. Reopen the site anytime at the Apache address above.

## 3. .env setup

Copy `backend/.env.example` to `backend/.env`. Defaults match a fresh XAMPP install (user `root`, no
password):
| Setting | Default | Change it when |
|---|---|---|
| `PORT` | 3000 | port 3000 is used by something else |
| `DB_USER` / `DB_PASSWORD` | `root` / empty | you set a MySQL password in XAMPP |
| `DB_NAME` | `school_clinic_system` | you want a different database name |
| `JWT_SECRET` | placeholder | before real use: any long random text |
| `CORS_ORIGINS` | empty | your frontend is served from somewhere other than localhost |
| `SELF_CHECKIN_MINUTES_BEFORE` | 30 | how early a patient may check in themselves; `0` disables self check-in (nurse checks everyone in instead) |

## 4. Seed data (fictional)

Created automatically on first start:

| Role | Login | Password |
|---|---|---|
| Admin | `admin@school.edu` (or Staff ID `A-001`) | `admin123` |
| Nurse | `ana@school.edu` (`N-001`) | `nurse123` |
| Nurse | `bea@school.edu` (`N-002`) | `nurse123` |

Sample services (General Consultation, First Aid, Medicine Request, Medical Certificate), a rolling
schedule where Ana and Bea alternate days so nobody is double-booked, three sample patients with a
few completed visits (for the history and reports screens), and a couple of appointments for today
and tomorrow so there's something to approve and check in. No real student data is used anywhere.

Change the admin and nurse passwords after logging in (**Change password** is on every staff page's
header — add it if you extend the header — or use **Nurses > Reset password** as an admin).

## 5. Patient record vs. patient account, nurse account vs. nurse schedule

These distinctions are load-bearing, not decoration:

- **Patient record** (`patients` table): permanent identity, one row per Student/Employee ID. No
  password, no login. The same ID always reuses the same record — booking again does not create a
  duplicate patient; every visit becomes one more row under that same permanent history.
- **Appointment**: one scheduled transaction. A patient can have many, across many dates.
- **Nurse account** (`users`, role `NURSE`): a persistent login (email + password + Staff ID). Created
  once by an admin. Deactivating it does not delete it or its history.
- **Clinic schedule** (`clinic_schedules`): a date-and-time assignment — a service, a date, a time
  range, a slot length, capacity per slot, and *which nurse covers it*. This is what changes day to
  day. If Ana is absent, an admin schedules Bea instead **for that date**; Ana's account is untouched,
  and it does not change appointments already booked under Ana unless an admin explicitly reassigns
  them (**Admin > Appointments > Reassign nurse**). Editing a schedule that already has bookings
  cannot change its date, time, slot length, or service — only its assigned nurse or capacity — and
  even changing the nurse there does not move existing appointments; that always needs the explicit
  reassign action, which is logged.

## 6. Try the whole flow

1. Open `http://localhost/school-clinic-system/frontend/` (the public landing page — no login).
2. **Book an appointment**: pick a service, a date, an open time slot (full or past slots are greyed
   out), enter your name, Student/Employee ID, contact number, and reason. Submit. A nurse is
   assigned automatically — you never pick one. You get a reference like `CLINIC-2026-K7Q2ZM`. Keep it.
3. **Check appointment status** with that reference — status, service, date/time; no medical
   information is ever shown here.
4. **Staff login** (top right) as Ana (`ana@school.edu` / `nurse123`) -> **Appointments** -> **Approve**
   the request.
5. Back on the status page (it refreshes itself), the appointment is now Approved, and a **Check in**
   button appears once you're within the check-in window (or a nurse can check you in from their
   dashboard on the day). Check in with your reference and Student/Employee ID -> you get a queue
   number.
6. **Nurse > Queue**: **Call next**, then **Start consultation**, fill in vitals and findings, **Complete
   consultation**. The visit is now saved to that patient's permanent history.
7. **Nurse > Patients** (or **Admin > Reports**) shows the effect: the patient's visit history, the
   day's capacity and occupancy, waiting time, and the audit log entry for every step above.

Walk-ins: **Nurse > Queue > Add a walk-in patient** — search for a returning patient by name or ID,
or type new details; no appointment is required.

## 7. Event-driven features (for the defense)

Every event type below is a real handler wired to a real feature, not a comment claiming it exists.

| Event | Where |
|---|---|
| `load` | every page: `window.addEventListener('load', ...)` fetches the first data |
| `click` | Check in, Call next, Approve/Reject, Start/Complete consultation, slot buttons, schedule/nurse actions |
| `change` | service + date on the booking page (fetches live slot availability); every admin filter; date/time on the schedule form (re-checks which nurses are free) |
| `input` | reason character count, patient search (nurse queue + admin), audit log filter, live "elevated temperature" notice while typing vitals |
| `submit` | login, booking, cancel, walk-in, consultation, every admin form |
| keyboard | Enter submits login; **N** calls next patient, **/** jumps to patient search, arrow keys + Enter move through search results (nurse queue); Esc closes any dialog |
| timer (`setInterval`) | notification polling, queue refresh, dashboard refresh, appointment-status auto-refresh — all paused while the browser tab is hidden and resumed via `visibilitychange`, so nothing wastes requests in a background tab |
| asynchronous | every `fetch()` in `frontend/js/api.js`, called with `async/await`; in-flight availability requests are cancelled with `AbortController` if the user changes the date again before the first reply arrives |
| event delegation | queue table, appointment tables, nurse/schedule tables — one listener on the parent handles every row, commented with `event.target` (the button clicked) vs. `event.currentTarget` (the parent the listener is on), and `closest('tr')` for DOM traversal from the click target up to its row |
| event bubbling | a click on a notification toast bubbles to one listener on its container, which dismisses it; the toast's own action button calls `stopPropagation()` on purpose, so it does not *also* trigger the container's dismiss handler — a deliberate, commented exception to bubbling |
| system events | `online`/`offline` show a banner immediately; a capture-phase (`addEventListener(..., true)`) activity listener drives an automatic staff idle-logout timer, so it still sees a click even on an element whose own handler calls `stopPropagation()` |

Dynamic lists are built with `createElement`/`appendChild` (the `el()` helper in
`frontend/js/session.js`), not `innerHTML` — safer with real patient-entered text.

## 8. What the server enforces (never trust the frontend alone)

- **Capacity and double-booking**: booking runs inside one MySQL transaction that locks the day's
  schedules, re-checks the slot's booked count against its capacity, and re-checks the patient's own
  other appointments that day, so two simultaneous requests cannot both take the last place.
- **Patient identity**: a Student/Employee ID always resolves to the same `patients` row. If the same
  ID shows a clearly different name, the booking is refused rather than silently merged or duplicated.
- **Status transitions**: only `PENDING -> APPROVED/REJECTED/CANCELLED`, `APPROVED ->
  CHECKED_IN/CANCELLED/NO_SHOW`, `CHECKED_IN -> IN_CONSULTATION/NO_SHOW`, `IN_CONSULTATION ->
  COMPLETED` are allowed; every other transition is rejected server-side regardless of what the UI sends.
- **Roles**: every route is guarded server-side by `authenticate` + `requireRole`, never by hiding a
  button. A nurse can only act on appointments and consultations assigned to them. Only an admin can
  reassign an appointment or manage nurse accounts and schedules.
- **Medical privacy**: the public status-lookup endpoint returns only status/date/time/service/nurse —
  never findings, treatment, medication, or vitals. Detailed medical history
  (`GET /api/patients/:id/medical-records`) is nurse-only; an admin's reports show counts, never
  clinical detail. Every time a nurse opens a patient's history, it is written to the audit log.
- **Audit log**: insert-only — the codebase has no route that updates or deletes an `audit_logs` row.
- **Rate limiting**: login and every public endpoint (booking, availability, status, cancel, check-in)
  are rate-limited per IP address, so the system cannot be brute-forced or spammed.
- **Reference codes** (`CLINIC-2026-XXXXXX`) are random, not sequential, so one cannot guess another
  patient's reference to read their appointment.

## 9. Folders

```
schema.sql                        all tables
backend/
  server.js  seed.js  .env(.example)
  config/    db.js (runs schema.sql, refuses to reuse an incompatible old database),
             slots.js (slot/availability math, unit-tested separately), reference.js (random
             reference codes), status.js (the status state machine), queue.js (locked queue
             transactions), patients.js (find-or-create + validation), settings.js
  middleware/ auth.middleware.js (authenticate, requireRole), cors.middleware.js,
              ratelimit.middleware.js, error.middleware.js
  routes/     auth, services, clinic, appointments, queue, consultations, patients, nurses,
              schedules, notifications, reports — one file per resource
  controllers/ one per route file, plus validators.js
frontend/
  index.html                     public landing page (no login)
  public/                        book-appointment.html, appointment-status.html
  shared/                        login.html (staff only), css/style.css
  nurse/                         dashboard (approve/reject/check-in), queue (call next, walk-in,
                                  consultation), patients (search + history)
  admin/                         dashboard, appointments (+ reassign), nurses, schedules
                                  (+ services), reports, audit
  js/                            config.js, api.js, session.js, and one script per page
```

## 10. Testing checklist

**Public:** book with a full slot (rejected), book past the cutoff time (rejected), book successfully,
check status, book again with the same Student/Employee ID on another day (same patient record, not a
duplicate — check **Nurse > Patients**), cancel with the wrong ID (rejected), cancel with the right one.

**Admin:** log in, create a nurse account, edit it, deactivate it (existing schedules stay, a warning
tells you to reassign them), create a schedule, try an overlapping one (rejected), try assigning a
nurse who is already busy elsewhere at that time (rejected), reassign one appointment and confirm
other appointments on the same schedule keep their original nurse, view capacity/expected
patients/waiting time/reports/audit log.

**Nurse:** log in, approve/reject a request, check a patient in, call next, start a consultation,
record vitals and findings, complete it, confirm it now appears in that patient's history, view a
returning patient's earlier visits while consulting.

**Security:** try an admin-only action while logged in as a nurse (403), try any staff action with no
token (401), try to book a slot that is already full via the API directly (409, same as the UI), try
an invalid status transition (409).

## 11. Troubleshooting

- **"MySQL is not running"** — start MySQL in the XAMPP Control Panel, then `npm start` again.
- **"already has tables from an older or different version of the system"** — that database name was
  used by an earlier project. Change `DB_NAME` in `backend/.env` to something new, or drop the old
  database in phpMyAdmin first.
- **"MySQL rejected the username or password"** — fix `DB_USER`/`DB_PASSWORD` in `backend/.env`.
- **The page loads but nothing works / "Cannot reach the clinic server"** — `npm start` isn't running,
  or `API_PORT` in `frontend/js/config.js` doesn't match `PORT` in `backend/.env`.
- **CORS error in the browser console** — you're serving the frontend from a host that isn't
  `localhost`/`127.0.0.1`; add it to `CORS_ORIGINS` in `backend/.env`.
- **Testing at night or on a day with no schedule** — the seed schedules run roughly 30 days back to
  13 days ahead from whenever you first started the server. As Admin, create a schedule for the date
  you want to test, or widen an existing one's hours.
- **Start completely fresh** — drop the database in phpMyAdmin (or change `DB_NAME`) and run
  `npm start` again; it rebuilds the schema and demo data.
