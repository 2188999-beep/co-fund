// ============================================================
// CoFund — Utility Helpers
// ============================================================

/**
 * Format a number as Indian Rupees
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date string (YYYY-MM-DD) into a human-readable label
 */
export function formatDate(dateStr: string): string {
  // Check if it's already a full timestamp or just a date string
  const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (compareDate.getTime() === today.getTime()) return 'Today';
  if (compareDate.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get yesterday's date as YYYY-MM-DD
 */
export function getYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Get a date N days ago as YYYY-MM-DD
 */
export function getDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/**
 * Calculate the average daily spend for a group
 */
export function calcAvgDailySpend(
  transactions: { total_amount: number; transaction_date: string }[]
): number {
  if (transactions.length === 0) return 0;

  const dates = new Set(transactions.map((t) => t.transaction_date));
  const totalSpent = transactions.reduce((sum, t) => sum + t.total_amount, 0);
  return totalSpent / dates.size;
}

/**
 * Generate initials from a name (e.g. "Jatin Kumar" -> "JK")
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Generate a simple unique ID for client-side use
 */
export function generateTempId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Group an array by a key function
 */
export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Color palette for user avatars
 */
export const AVATAR_COLORS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-teal-500',
];

export function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
