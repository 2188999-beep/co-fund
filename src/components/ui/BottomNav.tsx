'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGroup } from '@/components/GroupContext';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: (active: boolean) => (
      <svg
        className={`w-6 h-6 ${active ? 'text-emerald-600' : 'text-slate-400'}`}
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.5}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
        />
      </svg>
    ),
  },

  {
    href: '/add',
    label: 'Add',
    icon: (active: boolean) => (
      <div
        className={`w-12 h-12 -mt-5 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
          active
            ? 'bg-emerald-600 scale-110 shadow-emerald-300'
            : 'bg-emerald-500 shadow-emerald-200'
        }`}
      >
        <svg
          className="w-7 h-7 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      </div>
    ),
  },
  {
    href: '/stats',
    label: 'Stats',
    icon: (active: boolean) => (
      <svg
        className={`w-6 h-6 ${active ? 'text-emerald-600' : 'text-slate-400'}`}
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.5}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </svg>
    ),
  },

];

export default function BottomNav() {
  const pathname = usePathname();
  const { allGroups, loading } = useGroup();

  if (pathname.startsWith('/invite') || pathname.startsWith('/observer') || loading || allGroups.length === 0) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/90 backdrop-blur-xl border-t border-slate-200 z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/add'
              ? pathname === '/add'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] transition-all duration-200 ${
                isActive ? 'scale-105' : ''
              }`}
              id={`nav-${item.label.toLowerCase()}`}
            >
              {item.icon(isActive)}
              {item.href !== '/add' && (
                <span
                  className={`text-[10px] mt-0.5 font-semibold tracking-wide ${
                    isActive ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
