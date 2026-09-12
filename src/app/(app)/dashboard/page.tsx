'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { GroupMember, Transaction, FundAddition, Profile } from '@/lib/types';
import { formatCurrency, formatDate, calcAvgDailySpend, getInitials, getAvatarColor } from '@/lib/utils';
import { useGroup } from '@/components/GroupContext';

export default function DashboardPage() {
  const supabase = createClient();
  const { activeGroup: group, allGroups, setActiveGroupId, loading: groupLoading, userProfile: user, reloadGroups } = useGroup();
  
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fundsAdded, setFundsAdded] = useState<number>(0);
  const [totalSpent, setTotalSpent] = useState<number>(0);
  
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundNote, setFundNote] = useState('');
  const [addingFunds, setAddingFunds] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const [fundHistory, setFundHistory] = useState<FundAddition[]>([]);
  const [showFundsHistory, setShowFundsHistory] = useState(false);
  const [editingFundId, setEditingFundId] = useState<string | null>(null);

  // Three-dots menu & delete confirmation for transactions
  const [openMenuTxId, setOpenMenuTxId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [deleteConfirmTxId, setDeleteConfirmTxId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (groupLoading) return;
    
    if (!group) {
      setLoading(false);
      return;
    }

    // Load members, transactions, and fund additions for active group
    const [membersRes, txRes, fundAddRes] = await Promise.all([
      supabase.from('group_members').select('*, profiles(*)').eq('group_id', group.id),
      supabase.from('transactions').select('*, profiles(*)').eq('group_id', group.id).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      supabase.from('fund_additions').select('*, profiles(*)').eq('group_id', group.id).order('created_at', { ascending: false }),
    ]);

    if (membersRes.data) setMembers(membersRes.data);
    if (txRes.data) setTransactions(txRes.data);
    if (fundAddRes.data) setFundHistory(fundAddRes.data as unknown as FundAddition[]);

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

    if (!user) return;

    if (editingFundId) {
      await supabase.from('fund_additions').update({
        amount,
        note: fundNote.trim(),
      }).eq('id', editingFundId);
    } else {
      await supabase.from('fund_additions').insert({
        group_id: group.id,
        added_by: user.id,
        amount,
        note: fundNote.trim(),
      });
    }

    setFundAmount('');
    setFundNote('');
    setShowAddFunds(false);
    setEditingFundId(null);
    setAddingFunds(false);
    loadData();
  };

  const handleDeleteFund = async (fundId: string) => {
    if (!confirm("Are you sure you want to delete this fund addition?")) return;
    await supabase.from('fund_additions').delete().eq('id', fundId);
    loadData();
  };

  const handleDeleteTransaction = async (txId: string) => {
    await supabase.from('transactions').delete().eq('id', txId);
    setDeleteConfirmTxId(null);
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
    <>
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
                  <Link
                    href="/groups"
                    prefetch={true}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="font-semibold text-slate-700 text-sm">Create / Join Group</span>
                  </Link>

                  <Link
                    href="/settings"
                    prefetch={true}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="font-semibold text-slate-700 text-sm">Settings</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Funds Added */}
        <button 
          onClick={() => setShowFundsHistory(true)}
          className="card p-4 animate-fade-in-up delay-1 text-left w-full hover:ring-2 hover:ring-emerald-200 transition-all focus:outline-none group/fund"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="text-[11px] text-slate-400 font-medium group-hover/fund:text-emerald-500 transition-colors">Total Added</span>
            </div>
            <svg className="w-4 h-4 text-slate-300 opacity-0 group-hover/fund:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(fundsAdded)}</p>
        </button>

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

      {/* Funds History Modal */}
      {showFundsHistory && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-6 pb-8 animate-slide-up max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Funds History</h3>
              <button 
                onClick={() => setShowFundsHistory(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="overflow-y-auto pr-2 space-y-3 pb-8">
              {fundHistory.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-400 text-sm">No funds added yet</p>
                </div>
              ) : (
                fundHistory.map((fund) => {
                  const profile = fund.profiles as unknown as Profile;
                  const canEdit = user?.id === fund.added_by || members.find(m => m.user_id === user?.id)?.user_id === group?.manager_id;
                  
                  return (
                    <div key={fund.id} className="card p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 font-bold text-xs flex items-center justify-center shrink-0">
                        {profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={profile.avatar_url} alt={profile.name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          getInitials(profile?.name || '?')
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-900 truncate text-sm">{profile?.name}</p>
                          <p className="font-bold text-emerald-600 text-sm shrink-0">+{formatCurrency(fund.amount)}</p>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{formatDate(fund.created_at)}</p>
                        {fund.note && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{fund.note}</p>
                        )}
                      </div>
                      
                      {canEdit && (
                        <div className="flex flex-col gap-1 shrink-0 ml-1">
                          <button
                            onClick={() => {
                              setShowFundsHistory(false);
                              setEditingFundId(fund.id);
                              setFundAmount(fund.amount.toString());
                              setFundNote(fund.note || '');
                              setShowAddFunds(true);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteFund(fund.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
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
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openMenuTxId === tx.id) {
                                  setOpenMenuTxId(null);
                                  setMenuPos(null);
                                } else {
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                  setOpenMenuTxId(tx.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                              title="More options"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="5" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="19" r="1.5" />
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmTxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteConfirmTxId(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-fade-in-up">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-900 text-center mb-1">Delete Expense?</h2>
            <p className="text-sm text-slate-500 text-center mb-6">
              This expense will be permanently removed and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmTxId(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTransaction(deleteConfirmTxId)}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Three-dots dropdown — rendered via portal to escape stacking context */}
      {openMenuTxId && menuPos && createPortal(
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => { setOpenMenuTxId(null); setMenuPos(null); }}
          />
          <div
            className="fixed z-[101] w-36 bg-white rounded-xl shadow-xl border border-slate-100 py-1"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <button
              onClick={() => {
                setOpenMenuTxId(null);
                setMenuPos(null);
                window.location.href = `/add?edit=${openMenuTxId}`;
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.89L16.862 4.487z" />
              </svg>
              Edit
            </button>
            <button
              onClick={() => {
                setDeleteConfirmTxId(openMenuTxId);
                setOpenMenuTxId(null);
                setMenuPos(null);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-rose-500 hover:bg-rose-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
