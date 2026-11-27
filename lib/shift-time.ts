import type { ShiftRecord } from './staff-types';

const SHIFT_TIME_ZONE = 'Africa/Cairo';

export function getShiftBusinessDate(value: string | Date | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHIFT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

// A shift belongs to the work day it started in. Hours before 06:00 still count as the
// previous work day, so a night shift that closes after midnight does not block the next night.
export const WORK_DAY_START_HOUR = 6;

function getWorkDay(value: string | Date | number) {
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return getShiftBusinessDate(time - WORK_DAY_START_HOUR * 3_600_000);
}

// Work day (YYYY-MM-DD, Cairo) a moment belongs to: before 06:00 still counts as the previous day.
export function getCurrentWorkDay(now: Date | number = Date.now()) {
  return getWorkDay(now) ?? getShiftBusinessDate(now) ?? '';
}

export function getWorkDayOf(value: string | Date | number) {
  return getWorkDay(value);
}

export function shiftEndedToday(shift: Pick<ShiftRecord, 'endedAt'> & Partial<Pick<ShiftRecord, 'startedAt'>>, now: Date | number = Date.now()) {
  if (!shift.endedAt) return false;
  const shiftDay = getWorkDay(shift.startedAt ?? shift.endedAt);
  return shiftDay !== null && shiftDay === getWorkDay(now);
}

export function getShiftsCoveringTimestamp(shifts: ShiftRecord[], timestamp: string) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return [];
  return shifts.filter((shift) => {
    const periods = shift.periods?.length
      ? shift.periods
      : [{ startedAt: shift.startedAt, endedAt: shift.endedAt }];
    return periods.some((period) => {
      const startedAt = Date.parse(period.startedAt);
      const endedAt = period.endedAt ? Date.parse(period.endedAt) : null;
      return Number.isFinite(startedAt)
        && startedAt <= time
        && (endedAt === null || (Number.isFinite(endedAt) && time <= endedAt));
    });
  });
}

export function getShiftDurationMinutes(
  shift: Pick<ShiftRecord, 'startedAt' | 'endedAt'> & Partial<Pick<ShiftRecord, 'periods'>>,
  now = Date.now(),
) {
  const periods = shift.periods?.length
    ? shift.periods
    : [{ startedAt: shift.startedAt, endedAt: shift.endedAt }];
  let totalMinutes = 0;
  for (const period of periods) {
    const startedAt = Date.parse(period.startedAt);
    const endedAt = period.endedAt ? Date.parse(period.endedAt) : now;
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
    totalMinutes += Math.max(0, Math.floor((endedAt - startedAt) / 60_000));
  }
  return totalMinutes;
}

export function formatShiftDuration(totalMinutes: number | null) {
  if (totalMinutes === null) return 'تعذر حساب المدة';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const formattedHours = hours === 1
    ? 'ساعة'
    : hours === 2
      ? 'ساعتان'
      : hours >= 3 && hours <= 10
        ? `${hours} ساعات`
        : `${hours} ساعة`;
  const formattedMinutes = minutes === 1
    ? 'دقيقة'
    : minutes === 2
      ? 'دقيقتان'
      : minutes >= 3 && minutes <= 10
        ? `${minutes} دقائق`
        : `${minutes} دقيقة`;

  if (hours === 0) return formattedMinutes;
  return minutes === 0 ? formattedHours : `${formattedHours} و${formattedMinutes}`;
}
