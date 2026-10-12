-- School Clinic Appointment, Queue, and Medical Record Management System
-- The server runs this file automatically on start. You can also import it in phpMyAdmin.
--
-- Staff accounts (ADMIN, NURSE) live in users. Patients have NO login: they are records in patients.
-- A nurse ACCOUNT (users) is persistent. A nurse SCHEDULE (clinic_schedules) is date based.

CREATE DATABASE IF NOT EXISTS school_clinic_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE school_clinic_system;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','NURSE','PATIENT') NOT NULL,
  patient_id INT NULL UNIQUE, -- set only for role = PATIENT: links the account to its patients row (no FK: this file re-runs on every start)
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Permanent clinic identity of a student or school staff member (one row per person)
CREATE TABLE IF NOT EXISTS patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  contact_number VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- One clinic session: a service on a date, split into slots, run by one assigned nurse
CREATE TABLE IF NOT EXISTS clinic_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  schedule_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_minutes INT NOT NULL,
  capacity_per_slot INT NOT NULL DEFAULT 1,
  nurse_id INT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schedule (service_id, schedule_date, start_time),
  INDEX idx_schedule_date (schedule_date),
  INDEX idx_schedule_nurse (nurse_id, schedule_date),
  CONSTRAINT fk_sched_service FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT fk_sched_nurse FOREIGN KEY (nurse_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- nurse_id is the nurse assigned when the appointment was made. Changing a schedule's nurse later
-- does not change it. Only an explicit reassignment does.
CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(24) NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  schedule_id INT NOT NULL,
  nurse_id INT NOT NULL,
  appt_date DATE NOT NULL,
  appt_time TIME NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','CANCELLED','CHECKED_IN','IN_CONSULTATION','COMPLETED','NO_SHOW') NOT NULL DEFAULT 'PENDING',
  remarks VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appt_date (appt_date, nurse_id),
  INDEX idx_appt_slot (schedule_id, appt_time),
  INDEX idx_appt_patient (patient_id),
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_appt_schedule FOREIGN KEY (schedule_id) REFERENCES clinic_schedules(id),
  CONSTRAINT fk_appt_nurse FOREIGN KEY (nurse_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- The visit-day waiting line. Walk-ins have is_walk_in = 1 and no appointment.
CREATE TABLE IF NOT EXISTS queue_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  queue_date DATE NOT NULL,
  queue_number INT NOT NULL,
  patient_id INT NOT NULL,
  appointment_id INT NULL UNIQUE,
  service_id INT NULL,
  nurse_id INT NULL,
  is_walk_in TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(255) NULL,
  status ENUM('WAITING','CALLED','IN_CONSULTATION','COMPLETED','NO_SHOW') NOT NULL DEFAULT 'WAITING',
  checked_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  called_at DATETIME NULL,
  UNIQUE KEY uq_queue_day_number (queue_date, queue_number),
  INDEX idx_queue_patient (patient_id, queue_date),
  CONSTRAINT fk_queue_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_queue_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  CONSTRAINT fk_queue_service FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT fk_queue_nurse FOREIGN KEY (nurse_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- The clinical encounter. COMPLETED consultations form the patient's permanent history.
CREATE TABLE IF NOT EXISTS consultations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  queue_entry_id INT NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  appointment_id INT NULL,
  service_id INT NULL,
  nurse_id INT NOT NULL,
  status ENUM('IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
  chief_complaint VARCHAR(255) NULL,
  findings TEXT NULL,
  treatment TEXT NULL,
  medication_given TEXT NULL,
  instructions TEXT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  INDEX idx_consult_patient (patient_id, completed_at),
  CONSTRAINT fk_consult_queue FOREIGN KEY (queue_entry_id) REFERENCES queue_entries(id),
  CONSTRAINT fk_consult_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_consult_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  CONSTRAINT fk_consult_service FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT fk_consult_nurse FOREIGN KEY (nurse_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vital_signs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT NOT NULL UNIQUE,
  temperature DECIMAL(4,1) NULL,
  blood_pressure VARCHAR(15) NULL,
  pulse_rate INT NULL,
  respiratory_rate INT NULL,
  height_cm DECIMAL(5,1) NULL,
  weight_kg DECIMAL(5,1) NULL,
  CONSTRAINT fk_vitals_consult FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- In-app messages for staff
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(30) NOT NULL,
  message VARCHAR(255) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Insert-only log of key actions. The app never updates or deletes rows here.
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(40) NOT NULL,
  details VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_time (created_at)
) ENGINE=InnoDB;
