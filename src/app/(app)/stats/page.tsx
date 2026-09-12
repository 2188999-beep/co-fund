'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MacroStats } from '@/lib/types';
import { getTodayStr, getDaysAgoStr, getInitials, getAvatarColor } from '@/lib/utils';
import { useGroup } from '@/components/GroupContext';

type Period = 'today' | 'week' | 'all';

export default function StatsPage() {
  const supabase = createClient();
  const { activeGroup: group, loading: groupLoading } = useGroup();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');
  const [stats, setStats] = useState<MacroStats[]>([]);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  const loadStats = useCallback(async (selectedPeriod: Period) => {
    if (groupLoading) return;
    setLoading(true);

    if (!group) {
      if (typeof window !== 'undefined') window.location.href = '/groups';
      return;
    }

    let startDate: string;
    const endDate = getTodayStr();

    switch (selectedPeriod) {
      case 'today':
        startDate = getTodayStr();
        break;
      case 'week':
        startDate = getDaysAgoStr(7);
        break;
      case 'all':
        startDate = '2020-01-01';
        break;
    }

    const { data, error } = await supabase.rpc('get_macro_stats', {
      p_group_id: group.id,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (data && !error) {
      setStats(data);
    }
    setLoading(false);
  }, [supabase, group, groupLoading]);

  useEffect(() => {
    loadStats(period);
  }, [period, loadStats]);

  const maxCalories = Math.max(...stats.map((s) => s.total_calories), 1);
  const maxProtein = Math.max(...stats.map((s) => s.total_protein), 1);

  const medalEmojis = ['🥇', '🥈', '🥉'];

  return (
    <div className="px-4 pt-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 animate-fade-in-up relative z-50">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Macro Leaderboard 🏆
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Who&apos;s eating the most? 👀
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            title="Back to Dashboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
              title="More options"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {showHeaderMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowHeaderMenu(false)} />
                <div className="absolute right-0 top-10 z-20 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1">
                  <button
                    onClick={() => { setShowHeaderMenu(false); window.location.href = '/dashboard'; }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Dashboard
                  </button>
                  <button
                    onClick={() => { setShowHeaderMenu(false); window.location.href = '/groups'; }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Groups
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Period Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 mb-5 animate-fade-in-up delay-1">
        {[
          { key: 'today' as Period, label: 'Today' },
          { key: 'week' as Period, label: '7 Days' },
          { key: 'all' as Period, label: 'All Time' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setPeriod(tab.key)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              period === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500'
            }`}
            id={`period-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-2xl" />
          ))}
        </div>
      ) : stats.length === 0 ? (
        <div className="card p-8 text-center animate-fade-in-up">
          <div className="text-4xl mb-3">🍽️</div>
          <p className="text-slate-400 text-sm font-medium">
            No meals tracked for this period
          </p>
          <p className="text-slate-300 text-xs mt-1">
            Add an expense to start tracking macros
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map((user, idx) => (
            <div
              key={user.user_id}
              className={`card p-4 animate-fade-in-up ${
                idx === 0 ? 'ring-2 ring-amber-200 bg-amber-50/30' : ''
              }`}
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              {/* User Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{medalEmojis[idx] || `#${idx + 1}`}</span>
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${getAvatarColor(idx)}`}
                  >
                    {getInitials(user.user_name)}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {user.user_name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    ₹{user.total_spent.toFixed(0)} spent
                  </p>
                </div>
              </div>

              {/* Calorie Bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-orange-600">
                    🔥 Calories
                  </span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {user.total_calories.toFixed(0)} cal
                  </span>
                </div>
                <div className="w-full bg-orange-100 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-orange-400 to-orange-500 h-2.5 rounded-full transition-all duration-700"
                    style={{
                      width: `${(user.total_calories / maxCalories) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Protein Bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-blue-600">
                    💪 Protein
                  </span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {user.total_protein.toFixed(1)}g
                  </span>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-blue-500 h-2.5 rounded-full transition-all duration-700"
                    style={{
                      width: `${(user.total_protein / maxProtein) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
