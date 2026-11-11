export function normalizeCustomerPhone(phone: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0020')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = `20${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}
