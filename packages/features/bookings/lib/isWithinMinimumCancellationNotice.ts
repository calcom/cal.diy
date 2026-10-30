export function isWithinMinimumCancellationNotice(
  bookingStartTime: Date | null,
  minimumCancellationNotice: number | null
): boolean {
  if (!minimumCancellationNotice || minimumCancellationNotice <= 0 || !bookingStartTime) {
    return false;
  }

  const now = new Date();
  const bookingStart = new Date(bookingStartTime);
  const timeUntilBooking = bookingStart.getTime() - now.getTime();
  const minimumCancellationNoticeMs = minimumCancellationNotice * 60 * 1000;

  return timeUntilBooking < minimumCancellationNoticeMs;
}
