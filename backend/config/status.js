// Server-side status state machine. The frontend never gets to decide a
// transition is valid — every route re-checks this before writing.

const APPOINTMENT_TRANSITIONS = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  REJECTED: [],
  CANCELLED: [],
  CHECKED_IN: ['IN_CONSULTATION', 'NO_SHOW'],
  IN_CONSULTATION: ['COMPLETED'],
  COMPLETED: [],
  NO_SHOW: [],
};

const QUEUE_TRANSITIONS = {
  WAITING: ['CALLED', 'NO_SHOW'],
  CALLED: ['IN_CONSULTATION', 'NO_SHOW', 'WAITING'],
  IN_CONSULTATION: ['COMPLETED'],
  COMPLETED: [],
  NO_SHOW: [],
};

function canTransition(map, from, to) {
  return Array.isArray(map[from]) && map[from].includes(to);
}

module.exports = {
  APPOINTMENT_TRANSITIONS,
  QUEUE_TRANSITIONS,
  canTransitionAppointment: (from, to) => canTransition(APPOINTMENT_TRANSITIONS, from, to),
  canTransitionQueue: (from, to) => canTransition(QUEUE_TRANSITIONS, from, to),
};
