'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { Group, Transaction, Profile } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function GuestDashboard() {
  const params = useParams();
  const groupId = params.groupId as string;

  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fundsAdded, setFundsAdded] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);

  // Use anon key for guest access (no auth)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const STORAGE_KEY = `cofund_guest_${groupId}`;

  const loadData = useCallback(async () => {
    const [groupRes, txRes, fundAddRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase.from('transactions').select('*, profiles(*)').eq('group_id', groupId).order('transaction_date', { ascending: false }).limit(30),
      supabase.from('fund_additions').select('*').eq('group_id', groupId),
    ]);

    if (groupRes.data) setGroup(groupRes.data);
    if (txRes.data) setTransactions(txRes.data);

    const totalAdded = fundAddRes.data?.reduce((sum, f) => sum + Number(f.amount), 0) ?? 0;
    const spent = txRes.data?.reduce((sum, t) => sum + Number(t.total_amount), 0) ?? 0;
    setFundsAdded(totalAdded);
    setTotalSpent(spent);
    setLoading(false);
  }, [supabase, groupId]);

  // Check localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setAuthenticated(true);
    } else {
      setLoading(false);
    }
  }, [STORAGE_KEY]);

  // Load data when authenticated
  useEffect(() => {
    if (authenticated) {
      loadData();
    }
  }, [authenticated, loadData]);

  const handleLogin = async () => {
    setError('');
    // Fetch group to check password
    const { data: grp } = await supabase
      .from('groups')
      .select('guest_password')
      .eq('id', groupId)
      .single();

    if (!grp) {
      setError('Group not found');
      return;
    }

    if (grp.guest_password === password) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setAuthenticated(true);
    } else {
      setError('Wrong password');
    }
  };

  // Password screen
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="animate-fade-in-up text-center w-full max-w-xs">
          <div className="w-16 h-16 bg-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Observer Access</h2>
          <p className="text-xs text-slate-500 mb-6">
            Enter the group password to view the dashboard
          </p>

          <input
            type="password"
            inputMode="numeric"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Enter password"
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-base text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent mb-3"
            id="guest-password-input"
          />
          {error && (
            <p className="text-xs text-rose-500 mb-3 animate-fade-in-up">
              {error}
            </p>
          )}
          <button
            onClick={handleLogin}
            className="btn bg-slate-800 text-white w-full"
            id="guest-login-btn"
          >
            View Dashboard
          </button>
        </div>
      </div>
    );
  }

  const fundsLeft = fundsAdded - totalSpent;

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 animate-fade-in-up">
        <div>
          <p className="text-xs text-slate-400 font-medium">Observer Mode</p>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {group?.name || 'Group'}
          </h1>
        </div>
        <div className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-semibold rounded-full">
          👁 Read Only
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card p-4 animate-fade-in-up delay-1">
          <p className="text-[11px] text-slate-400 font-medium mb-1">Funds Added</p>
          <p className="text-xl font-bold text-slate-900">{formatCurrency(fundsAdded)}</p>
        </div>
        <div className="card p-4 animate-fade-in-up delay-2">
          <p className="text-[11px] text-slate-400 font-medium mb-1">Funds Left</p>
          <p className={`text-xl font-bold ${fundsLeft < 100 ? 'text-rose-500' : 'text-emerald-600'}`}>
            {formatCurrency(fundsLeft)}
          </p>
        </div>
      </div>

      {/* Recent Transactions */}
      <h2 className="text-sm font-bold text-slate-900 mb-3 animate-fade-in-up">
        Recent Expenses
      </h2>
      <div className="space-y-2">
        {transactions.map((tx, idx) => {
          const payer = tx.profiles as unknown as Profile;
          return (
            <div
              key={tx.id}
              className="card p-3.5 flex items-center justify-between animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.03}s` }}
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {tx.shop_name || 'Expense'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {payer?.name?.split(' ')[0]} · {formatDate(tx.transaction_date)}
                </p>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {formatCurrency(tx.total_amount)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
