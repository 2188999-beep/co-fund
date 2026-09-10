'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Group, GroupMember, Transaction, FundAddition, Profile } from '@/lib/types';
import { formatCurrency, formatDate, calcAvgDailySpend, getInitials, getAvatarColor } from '@/lib/utils';

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fundsAdded, setFundsAdded] = useState<number>(0);
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [user, setUser] = useState<Profile | null>(null);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundNote, setFundNote] = useState('');
  const [addingFunds, setAddingFunds] = useState(false);
  const [showGroupSetup, setShowGroupSetup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const loadData = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();
    if (profile) setUser(profile);

    // Get user's first group (for MVP, users belong to one group)
    const { data: membership } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', authUser.id)
      .limit(1)
      .single();

    if (!membership) {
      setShowGroupSetup(true);
      setLoading(false);
      return;
    }

    const groupId = membership.group_id;

    // Load group, members, transactions, and fund additions in parallel
    const [groupRes, membersRes, txRes, fundAddRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase.from('group_members').select('*, profiles(*)').eq('group_id', groupId),
      supabase.from('transactions').select('*, profiles(*)').eq('group_id', groupId).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      supabase.from('fund_additions').select('*').eq('group_id', groupId),
    ]);

    if (groupRes.data) setGroup(groupRes.data);
    if (membersRes.data) setMembers(membersRes.data);
    if (txRes.data) setTransactions(txRes.data);

    const totalAdded = fundAddRes.data?.reduce((sum, f) => sum + Number(f.amount), 0) ?? 0;
    const totalSpentCalc = txRes.data?.reduce((sum, t) => sum + Number(t.total_amount), 0) ?? 0;
    setFundsAdded(totalAdded);
    setTotalSpent(totalSpentCalc);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscription for new transactions
  useEffect(() => {
    if (!group) return;

    const channel = supabase
      .channel('transactions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `group_id=eq.${group.id}`,
        },
        () => {
          loadData(); // Reload on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [group, supabase, loadData]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setCreatingGroup(true);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Create group
    const { data: newGroup, error: groupError } = await supabase
      .from('groups')
      .insert({ name: groupName.trim(), manager_id: authUser.id })
      .select()
      .single();

    if (groupError || !newGroup) {
      setCreatingGroup(false);
      return;
    }

    // Add creator as member
    await supabase
      .from('group_members')
      .insert({ group_id: newGroup.id, user_id: authUser.id });

    setShowGroupSetup(false);
    setCreatingGroup(false);
    loadData();
  };

  const handleAddFunds = async () => {
    const amount = parseFloat(fundAmount);
    if (!amount || amount <= 0 || !group) return;
    setAddingFunds(true);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    await supabase.from('fund_additions').insert({
      group_id: group.id,
      added_by: authUser.id,
      amount,
      note: fundNote.trim(),
    });

    setFundAmount('');
    setFundNote('');
    setShowAddFunds(false);
    setAddingFunds(false);
    loadData();
  };

  const fundsLeft = fundsAdded - totalSpent;
  const avgDaily = calcAvgDailySpend(transactions);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="skeleton h-8 w-40" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-6 w-32 mt-6" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  // Group setup screen
  if (showGroupSetup) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="animate-fade-in-up text-center w-full max-w-xs">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Create Your Group</h2>
          <p className="text-sm text-slate-500 mb-6">Start a shared fund with your friends</p>

          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g., Street Food Gang 🍕"
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent mb-4"
            id="group-name-input"
          />
          <button
            onClick={handleCreateGroup}
            disabled={!groupName.trim() || creatingGroup}
            className="btn btn-primary w-full disabled:opacity-50"
            id="create-group-btn"
          >
            {creatingGroup ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 animate-fade-in-up">
        <div>
          <p className="text-xs text-slate-400 font-medium">Welcome back</p>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {user?.name?.split(' ')[0] || 'Hey'} 👋
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Group name badge */}
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-100">
            {group?.name}
          </div>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Funds Added */}
        <div className="card p-4 animate-fade-in-up delay-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              fundsLeft < 100 ? 'bg-rose-50' : 'bg-blue-50'
            }`}>
              <svg className={`w-4 h-4 ${fundsLeft < 100 ? 'text-rose-500' : 'text-blue-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
              </svg>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Funds Left</span>
          </div>
          <p className={`text-lg font-bold ${fundsLeft < 100 ? 'text-rose-500' : 'text-slate-900'}`}>
            {formatCurrency(fundsLeft)}
          </p>
          {fundsLeft < 100 && (
            <p className="text-[10px] text-rose-400 font-medium mt-1 animate-pulse-soft">
              ⚠️ Running low!
            </p>
          )}
        </div>

        {/* Total Spent */}
        <div className="card p-4 animate-fade-in-up delay-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Total Spent</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(totalSpent)}</p>
        </div>

        {/* Avg Daily */}
        <div className="card p-4 animate-fade-in-up delay-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Avg/Day</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(avgDaily)}</p>
        </div>
      </div>

      {/* Add Funds Button */}
      <button
        onClick={() => setShowAddFunds(!showAddFunds)}
        className="btn btn-secondary w-full mb-4 gap-2 animate-fade-in-up"
        id="add-funds-btn"
      >
        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Funds to Kitty
      </button>

      {/* Add Funds Form */}
      {showAddFunds && (
        <div className="card p-4 mb-4 animate-fade-in-up">
          <div className="flex gap-3 mb-3">
            <input
              type="number"
              inputMode="numeric"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder="₹ Amount"
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              id="fund-amount-input"
            />
          </div>
          <input
            type="text"
            value={fundNote}
            onChange={(e) => setFundNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent mb-3"
            id="fund-note-input"
          />
          <button
            onClick={handleAddFunds}
            disabled={!fundAmount || addingFunds}
            className="btn btn-primary w-full disabled:opacity-50"
            id="submit-fund-btn"
          >
            {addingFunds ? 'Adding...' : 'Add Funds'}
          </button>
        </div>
      )}

      {/* Members Preview */}
      <div className="flex items-center gap-1.5 mb-4 animate-fade-in-up">
        <span className="text-xs text-slate-400 font-medium mr-2">Members</span>
        {members.map((m, i) => {
          const profile = m.profiles as unknown as Profile;
          return (
            <div
              key={m.id}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${getAvatarColor(i)} -ml-1 first:ml-0 ring-2 ring-white`}
              title={profile?.name}
            >
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                getInitials(profile?.name || '?')
              )}
            </div>
          );
        })}
      </div>

      {/* Recent Transactions */}
      <div className="animate-fade-in-up">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Recent Expenses</h2>
        {transactions.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-slate-400 text-sm">No expenses yet</p>
            <p className="text-slate-300 text-xs mt-1">
              Tap the + button to add your first expense
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx, index) => {
              const payer = tx.profiles as unknown as Profile;
              const itemNames = tx.items_breakdown
                ?.map((item) => item.name)
                .join(', ');

              return (
                <div
                  key={tx.id}
                  className="card p-3.5 flex items-center gap-3 animate-fade-in-up"
                  style={{ animationDelay: `${index * 0.03}s` }}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${getAvatarColor(members.findIndex(m => m.user_id === tx.paid_by))}`}>
                    {payer?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={payer.avatar_url}
                        alt={payer.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      getInitials(payer?.name || '?')
                    )}
                  </div>

                  {/* Details */}
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
  );
}
