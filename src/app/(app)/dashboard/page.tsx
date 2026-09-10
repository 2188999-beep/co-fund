'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GroupMember, Transaction, Profile } from '@/lib/types';
import { formatCurrency, formatDate, calcAvgDailySpend, getInitials, getAvatarColor } from '@/lib/utils';
import { useGroup } from '@/components/GroupContext';

export default function DashboardPage() {
  const supabase = createClient();
  const { activeGroup: group, allGroups, setActiveGroupId, loading: groupLoading, reloadGroups } = useGroup();
  
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fundsAdded, setFundsAdded] = useState<number>(0);
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [user, setUser] = useState<Profile | null>(null);
  
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundNote, setFundNote] = useState('');
  const [addingFunds, setAddingFunds] = useState(false);

  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const loadData = useCallback(async () => {
    if (groupLoading) return;
    
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();
    if (profile) setUser(profile);

    if (!group) {
      setLoading(false);
      return;
    }

    // Load members, transactions, and fund additions for active group
    const [membersRes, txRes, fundAddRes] = await Promise.all([
      supabase.from('group_members').select('*, profiles(*)').eq('group_id', group.id),
      supabase.from('transactions').select('*, profiles(*)').eq('group_id', group.id).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      supabase.from('fund_additions').select('*').eq('group_id', group.id),
    ]);

    if (membersRes.data) setMembers(membersRes.data);
    if (txRes.data) setTransactions(txRes.data);

    const totalAdded = fundAddRes.data?.reduce((sum, f) => sum + Number(f.amount), 0) ?? 0;
    const totalSpentCalc = txRes.data?.reduce((sum, t) => sum + Number(t.total_amount), 0) ?? 0;
    setFundsAdded(totalAdded);
    setTotalSpent(totalSpentCalc);
    setLoading(false);
  }, [supabase, group, groupLoading]);

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

  const handleDeleteTransaction = async (txId: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    await supabase.from('transactions').delete().eq('id', txId);
    loadData();
  };

  const fundsLeft = fundsAdded - totalSpent;
  const avgDaily = calcAvgDailySpend(transactions);

  if (loading || groupLoading) {
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

  if (!group) {
    if (typeof window !== 'undefined') window.location.href = '/groups';
    return null;
  }

  return (
    <div className="px-4 pt-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 animate-fade-in-up relative z-30">
        <div className="relative">
          <p className="text-xs text-slate-400 font-medium">Welcome back, {user?.name?.split(' ')[0] || 'Hey'} 👋</p>
          <button 
            onClick={() => setShowGroupDropdown(!showGroupDropdown)}
            className="flex items-center gap-1.5 mt-0.5 group focus:outline-none"
          >
            <h1 className="text-xl font-bold text-slate-900 tracking-tight group-hover:text-emerald-600 transition-colors">
              {group?.name}
            </h1>
            <svg 
              className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${showGroupDropdown ? 'rotate-180 text-emerald-600' : 'group-hover:text-emerald-600'}`} 
              fill="none" 
              stroke="currentColor" 
              strokeWidth={2.5} 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          
          {/* Dropdown Menu */}
          {showGroupDropdown && (
            <>
              {/* Invisible overlay to close dropdown when clicking outside */}
              <div 
                className="fixed inset-0 z-40"
                onClick={() => setShowGroupDropdown(false)}
              />
              <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-fade-in-up origin-top-left">
                <div className="px-3 pb-2 mb-2 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Switch Group</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto px-2 space-y-1">
                  {allGroups.filter(g => g.id !== group?.id).length === 0 ? (
                    <div className="px-3 py-4 text-center">
                      <p className="text-sm text-slate-500">You have no other groups.</p>
                      <button 
                        onClick={() => window.location.href = '/groups'}
                        className="mt-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        Find or Create One
                      </button>
                    </div>
                  ) : (
                    allGroups.filter(g => g.id !== group?.id).map((g) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          setActiveGroupId(g.id);
                          setShowGroupDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between group/item"
                      >
                        <span className="font-semibold text-slate-700 group-hover/item:text-slate-900">{g.name}</span>
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Top Right Settings Menu */}
        <div className="relative">
          <button 
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors focus:outline-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          </button>
          
          {showSettingsMenu && (
            <>
              <div 
                className="fixed inset-0 z-40"
                onClick={() => setShowSettingsMenu(false)}
              />
              <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-fade-in-up origin-top-right">
                
                {/* Admin Info */}
                <div className="px-4 py-2 border-b border-slate-100 mb-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Admin</p>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className="text-amber-500 text-base">👑</span>
                    <span className="truncate">{members.find(m => m.user_id === group?.manager_id)?.profiles?.name || 'Loading...'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-2 space-y-1 mt-2">
                  <button
                    onClick={() => window.location.href = '/groups'}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="font-semibold text-slate-700 text-sm">Create / Join Group</span>
                  </button>

                  <button
                    onClick={() => window.location.href = '/settings'}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="font-semibold text-slate-700 text-sm">Settings</span>
                  </button>
                </div>
              </div>
            </>
          )}
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 shrink-0">
                          {formatCurrency(tx.total_amount)}
                        </p>
                        {(user?.id === tx.paid_by || user?.id === group?.manager_id) && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => window.location.href = `/add?edit=${tx.id}`}
                              className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Edit Expense"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.89l12.683-12.683a1.5 1.5 0 00-1.42 1.42z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.862 4.487" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete Expense"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.158 0c-.36-.05-.72-.102-1.08-.15m-1.08-.15A59.76 59.76 0 0012 5.25c-2.625 0-5.25.415-7.875 1.24m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.158 0c-.36-.05-.72-.102-1.08-.15m-1.08-.15A59.76 59.76 0 0012 5.25c-2.625 0-5.25.415-7.875 1.24" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {tx.note && (
                      <p className="text-[11px] text-slate-500 italic mt-0.5 truncate">
                        "{tx.note}"
                      </p>
                    )}
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
