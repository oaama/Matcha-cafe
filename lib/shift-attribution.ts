import type { OrderRecord } from './types';
import type { ShiftRecord } from './staff-types';
import { getShiftsCoveringTimestamp } from './shift-time';

type ShiftReportOrder = Pick<OrderRecord, 'status' | 'shiftId' | 'employeeId' | 'updatedAt'>;

export function getShiftReportOrders<T extends ShiftReportOrder>(
  orders: T[],
  shift: ShiftRecord,
  shifts: ShiftRecord[],
) {
  const completedOrders = orders.filter((order) => order.status === 'COMPLETED');
  const reportOrders = completedOrders.filter((order) => {
    if (order.shiftId) return order.shiftId === shift.id;
    if (order.employeeId && order.employeeId !== shift.employeeId) return false;
    const coveringShifts = getShiftsCoveringTimestamp(shifts, order.updatedAt)
      .filter((candidate) => !order.employeeId || candidate.employeeId === order.employeeId);
    return coveringShifts.length === 1 && coveringShifts[0].id === shift.id;
  });
  const unattributedOrderCount = completedOrders.filter((order) => {
    if (order.shiftId || (order.employeeId && order.employeeId !== shift.employeeId)) return false;
    const coveringShifts = getShiftsCoveringTimestamp(shifts, order.updatedAt)
      .filter((candidate) => !order.employeeId || candidate.employeeId === order.employeeId);
    return coveringShifts.length > 1 && coveringShifts.some((candidate) => candidate.id === shift.id);
  }).length;

  return { orders: reportOrders, unattributedOrderCount };
}
