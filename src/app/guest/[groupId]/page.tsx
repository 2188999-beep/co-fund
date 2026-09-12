'use client';

import { useEffect, useState, use } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Group, Transaction, Profile } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function GuestDashboard({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [group, setGroup] = useState<Group | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fundsAdded, setFundsAdded] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data: grp, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (error || !grp) {
        setStatus('invalid');
        return;
      }

      setGroup(grp);

      const [txRes, fundRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*, profiles(name, avatar_url)')
          .eq('group_id', groupId)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('fund_additions')
          .select('amount')
          .eq('group_id', groupId),
      ]);

      setTransactions((txRes.data as unknown as Transaction[]) || []);
      const added = fundRes.data?.reduce((s, f) => s + Number(f.amount), 0) ?? 0;
      const spent = txRes.data?.reduce((s, t) => s + Number(t.total_amount), 0) ?? 0;
      setFundsAdded(added);
      setTotalSpent(spent);
      setStatus('valid');
    };

    load();
  }, [groupId, supabase]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-4">
          <span className="text-3xl">🔗</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid Link</h1>
        <p className="text-sm text-slate-500">
          This guest link is invalid or has expired. Ask the group manager to share a new link.
        </p>
      </div>
    );
  }

  const fundsLeft = fundsAdded - totalSpent;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header Banner */}
      <div className="bg-emerald-600 text-white px-6 py-8 rounded-b-3xl shadow-sm mb-6 animate-fade-in-up relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-emerald-500 rounded-full opacity-40 blur-2xl" />
        <div className="relative z-10">
          <span className="inline-block bg-white/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 border border-white/20">
            👁 Guest View · Read Only
          </span>
          <h1 className="text-2xl font-bold tracking-tight">{group?.name}</h1>
          <p className="text-emerald-100 text-sm mt-1">Live expense dashboard</p>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 animate-fade-in-up delay-1">
          <div className="card p-4">
            <p className="text-[11px] text-slate-400 font-medium mb-1">Total Added</p>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(fundsAdded)}</p>
          </div>
          <div className="card p-4">
            <p className="text-[11px] text-slate-400 font-medium mb-1">Funds Left</p>
            <p className={`text-xl font-bold ${fundsLeft < 100 ? 'text-rose-500' : 'text-slate-900'}`}>
              {formatCurrency(fundsLeft)}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 animate-fade-in-up delay-2">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <span className="text-xl">💸</span>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-medium">Total Spent</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(totalSpent)}</p>
          </div>
        </div>

        {/* Transactions */}
        <div className="animate-fade-in-up delay-3">
          <h2 className="text-sm font-bold text-slate-900 mb-3 px-1">Recent Expenses</h2>
          {transactions.length === 0 ? (
            <div className="card p-8 text-center border-dashed border-2 border-slate-200">
              <p className="text-slate-400 text-sm">No expenses yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx, idx) => {
                const payer = tx.profiles as unknown as Profile;
                const itemNames = tx.items_breakdown?.map((i) => i.name).join(', ');
                return (
                  <div
                    key={tx.id}
                    className="card p-3.5 flex items-center gap-3"
                    style={{ animationDelay: `${idx * 0.03}s` }}
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                      {payer?.name?.charAt(0).toUpperCase() || '?'}
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
