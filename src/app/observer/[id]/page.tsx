'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Group, Profile, Transaction } from '@/lib/types';

export default function ObserverDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pwd?: string }>;
}) {
  const unwrappedParams = use(params);
  const unwrappedSearchParams = use(searchParams);

  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  
  // Dashboard Data
  const [fundsAdded, setFundsAdded] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Password state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState(unwrappedSearchParams.pwd || '');
  const [passwordError, setPasswordError] = useState('');

  const checkPasswordAndLoad = useCallback(async (pwdToCheck: string) => {
    setLoading(true);
    setPasswordError('');

    // Fetch the group data
    // Because of our RLS (Guests can view groups by ID), this will work for anon users!
    const { data: groupData, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', unwrappedParams.id)
      .single();

    if (error || !groupData) {
      setPasswordError(`Group not found. DB Error: ${error?.message || 'No data'}`);
      setLoading(false);
      return;
    }

    if (groupData.guest_password !== pwdToCheck) {
      setPasswordError('Incorrect password.');
      setLoading(false);
      return;
    }

    // Success! Load everything else.
    setIsAuthenticated(true);
    setGroup(groupData);

    // Fetch total funds added (RLS allows anon)
    const { data: fundsData } = await supabase
      .from('fund_additions')
      .select('amount')
      .eq('group_id', unwrappedParams.id);
    
    const added = fundsData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
    setFundsAdded(added);

    // Fetch transactions (RLS allows anon)
    const { data: txData } = await supabase
      .from('transactions')
      .select('*, profiles(name, avatar_url)')
      .eq('group_id', unwrappedParams.id)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    setTransactions(txData as unknown as Transaction[] || []);
    
    const spent = txData?.reduce((acc, curr) => acc + Number(curr.total_amount), 0) || 0;
    setTotalSpent(spent);

    setLoading(false);
  }, [unwrappedParams.id, supabase]);

  useEffect(() => {
    if (unwrappedSearchParams.pwd) {
      checkPasswordAndLoad(unwrappedSearchParams.pwd);
    } else {
      setLoading(false);
    }
  }, [unwrappedSearchParams.pwd, checkPasswordAndLoad]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkPasswordAndLoad(passwordInput);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  // Password Prompt Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6">
        <form onSubmit={handlePasswordSubmit} className="card p-8 w-full max-w-sm text-center animate-fade-in-up">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Observer Access</h1>
          <p className="text-sm text-slate-500 mb-6">Enter the guest password to view this group's dashboard.</p>

          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent mb-4 text-center"
          />
          {passwordError && <p className="text-sm text-rose-500 mb-4">{passwordError}</p>}
          <button type="submit" disabled={!passwordInput} className="btn btn-primary w-full py-3">
            Enter Dashboard
          </button>
        </form>
      </div>
    );
  }

  // Dashboard Screen
  const fundsLeft = fundsAdded - totalSpent;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header Banner */}
      <div className="bg-emerald-600 text-white px-6 py-8 rounded-b-3xl shadow-sm mb-6 animate-fade-in-up relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-emerald-500 rounded-full opacity-50 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-white/20 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm border border-white/20">
              Observer View
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{group?.name}</h1>
          <p className="text-emerald-100 text-sm mt-1">Read-only dashboard</p>
        </div>
      </div>

      <div className="px-4 space-y-6">
        {/* Stat Cards Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Funds Added */}
          <div className="card p-4 animate-fade-in-up delay-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Total Added</span>
            </div>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(fundsAdded)}</p>
          </div>

          {/* Funds Left */}
          <div className="card p-4 animate-fade-in-up delay-2">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${fundsLeft < 100 ? 'bg-rose-50' : 'bg-blue-50'}`}>
                <svg className={`w-4 h-4 ${fundsLeft < 100 ? 'text-rose-500' : 'text-blue-600'}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 11-18 0 2.25 2.25 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                </svg>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Funds Left</span>
            </div>
            <p className={`text-lg font-bold ${fundsLeft < 100 ? 'text-rose-500' : 'text-slate-900'}`}>
              {formatCurrency(fundsLeft)}
            </p>
          </div>
        </div>

        {/* Total Spent */}
        <div className="card p-4 flex items-center justify-between animate-fade-in-up delay-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <span className="text-xl">💸</span>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-medium">Total Spent</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(totalSpent)}</p>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="animate-fade-in-up delay-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3 px-1">Recent Expenses</h2>
          {transactions.length === 0 ? (
            <div className="card p-8 text-center border-dashed border-2 border-slate-200">
              <p className="text-slate-400 text-sm">No expenses yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx, index) => {
                const payer = tx.profiles as unknown as Profile;
                const itemNames = tx.items_breakdown?.map((item) => item.name).join(', ');

                return (
                  <div key={tx.id} className="card p-3.5 flex items-center gap-3" style={{ animationDelay: `${index * 0.03}s` }}>
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
                      {payer?.name?.substring(0, 1).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {tx.shop_name || 'Expense'}
                        </p>
                        <p className="text-sm font-bold text-slate-900 shrink-0 ml-2">
                          {formatCurrency(tx.total_amount)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[11px] text-slate-400 truncate max-w-[150px]">
                          {itemNames || `by ${payer?.name?.split(' ')[0]}`}
                        </p>
                        <p className="text-[11px] text-slate-400 shrink-0 ml-2">
                          {formatDate(tx.transaction_date)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
