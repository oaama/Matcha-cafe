import type { ShiftRecord } from './staff-types';
import type { PayrollAdvance, PayrollOvertimeEntry, PayrollProfile, PayrollStatement } from './payroll-types';

const PAYROLL_TIME_ZONE = 'Africa/Cairo';
const HOUR_MS = 60 * 60 * 1000;

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function nextCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function localMidnightAsUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day);
  let timestamp = targetWallTime;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: PAYROLL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(timestamp).map(({ type, value }) => [type, value]));
    const wallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const adjusted = targetWallTime - (wallTime - timestamp);
    if (adjusted === timestamp) break;
    timestamp = adjusted;
  }
  return timestamp;
}

export function isValidPayrollDate(value: string) {
  return isCalendarDate(value);
}

export function calculatePayrollStatement(input: {
  employeeId: string;
  profile: PayrollProfile;
  shifts: ShiftRecord[];
  advances: PayrollAdvance[];
  overtimeEntries: PayrollOvertimeEntry[];
  startDate: string;
  endDate: string;
  now?: Date;
}): PayrollStatement {
  const { employeeId, profile, shifts, startDate, endDate } = input;
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate) || startDate > endDate) {
    throw new Error('Invalid payroll statement date range');
  }

  const rangeStart = localMidnightAsUtc(startDate);
  const rangeEnd = localMidnightAsUtc(nextCalendarDate(endDate));
  const now = input.now?.getTime() ?? Date.now();
  let regularMinutes = 0;

  for (const shift of shifts) {
    const periods = shift.periods?.length
      ? shift.periods
      : [{ startedAt: shift.startedAt, endedAt: shift.endedAt }];
    for (const period of periods) {
      const startedAt = Date.parse(period.startedAt);
      const endedAt = period.endedAt ? Date.parse(period.endedAt) : now;
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) continue;
      const overlapStart = Math.max(startedAt, rangeStart);
      const overlapEnd = Math.min(endedAt, rangeEnd);
      if (overlapEnd > overlapStart) regularMinutes += Math.floor((overlapEnd - overlapStart) / 60_000);
    }
  }

  const advances = input.advances.filter((advance) => advance.date >= startDate && advance.date <= endDate);
  const overtimeEntries = input.overtimeEntries.filter((entry) => entry.date >= startDate && entry.date <= endDate);
  const regularHours = regularMinutes / 60;
  const overtimeHours = overtimeEntries.reduce((total, entry) => total + entry.hours, 0);
  const baseWages = roundMoney(regularHours * profile.hourlyRate);
  const overtimeEarnings = roundMoney(overtimeEntries.reduce((total, entry) => total + entry.hours * entry.hourlyRate, 0));
  const totalAdvances = roundMoney(advances.reduce((total, advance) => total + advance.amount, 0));

  return {
    employeeId,
    startDate,
    endDate,
    regularHours: roundHours(regularHours),
    hourlyRate: profile.hourlyRate,
    baseWages,
    overtimeHours: roundHours(overtimeHours),
    overtimeEarnings,
    totalAdvances,
    netPay: roundMoney(baseWages + overtimeEarnings - totalAdvances),
    advances,
    overtimeEntries,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundHours(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export { HOUR_MS };
