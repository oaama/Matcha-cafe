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

export function shiftEndedToday(shift: Pick<ShiftRecord, 'endedAt'>, now: Date | number = Date.now()) {
  return Boolean(shift.endedAt && getShiftBusinessDate(shift.endedAt) === getShiftBusinessDate(now));
}

export function getShiftsCoveringTimestamp(shifts: ShiftRecord[], timestamp: string) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return [];
  return shifts.filter((shift) => {
    const startedAt = Date.parse(shift.startedAt);
    const endedAt = shift.endedAt ? Date.parse(shift.endedAt) : null;
    return Number.isFinite(startedAt)
      && startedAt <= time
      && (endedAt === null || (Number.isFinite(endedAt) && time <= endedAt));
  });
}

export function getShiftDurationMinutes(shift: Pick<ShiftRecord, 'startedAt' | 'endedAt'>, now = Date.now()) {
  const startedAt = Date.parse(shift.startedAt);
  const endedAt = shift.endedAt ? Date.parse(shift.endedAt) : now;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  return Math.max(0, Math.floor((endedAt - startedAt) / 60_000));
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
