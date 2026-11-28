import type { RepairAction, RepairRef } from './feature-debug.types';

/** Labels and confirmation texts for repair buttons, in one place. */
const REPAIRS: Record<RepairAction, { label: string; confirm: string }> = {
  END_DAY: {
    label: 'End this day',
    confirm:
      'Marks the work session COMPLETED now, completes its active route and closes open shop arrivals. No unload request is created.',
  },
  CLOSE_ARRIVALS: {
    label: 'Close open arrivals',
    confirm:
      'Marks every shop arrival still in progress for this salesman as abandoned.',
  },
  REVERSE_DUPLICATE_DEDUCTION: {
    label: 'Reverse extra deduction',
    confirm:
      'Keeps the first stock deduction per product, reverses the extra ones and puts that stock back on the van and in the day stock.',
  },
  RETRY_ERP_SALE: {
    label: 'Retry ERP sync',
    confirm: 'Sends this sale to ERP again now.',
  },
  RETRY_ERP_TOPUPS: {
    label: 'Retry ERP sync',
    confirm: 'Sends every unsynced top-up request to ERP again now.',
  },
  FORCE_RESYNC: {
    label: 'Re-download data on phone',
    confirm:
      'On its next check-in the phone downloads all its data again. Unsent changes on the phone are kept.',
  },
  REQUEST_DIAGNOSTICS: {
    label: 'Get phone diagnostics',
    confirm:
      'On its next check-in the phone sends its recent app logs and sync queue.',
  },
  LOGOUT_DEVICES: {
    label: 'Log out devices',
    confirm:
      'Revokes the sessions (effective within 15 minutes) and signs the app out on its next check-in. Unsent offline changes stay on the phone until the salesman logs in again.',
  },
  DEBUG_LOGGING: {
    label: 'Debug logging (1 h)',
    confirm: "Stores this user's detailed debug logs for one hour.",
  },
};

export const repair = (action: RepairAction, id: string): RepairRef => ({
  action,
  id,
  ...REPAIRS[action],
});
