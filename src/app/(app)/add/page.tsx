'use client';

import { useEffect, useState, useRef, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { FoodItem, GroupMember, Profile, TransactionFormItem, ItemBreakdownEntry, SharedByEntry } from '@/lib/types';
import { getTodayStr, getYesterdayStr, generateTempId, getInitials, getAvatarColor, formatCurrency } from '@/lib/utils';
import { useGroup } from '@/components/GroupContext';

interface TransactionBlock {
  tempId: string;
  date: string;
  shopName: string;
  note: string;
  items: TransactionFormItem[];
}

export default function AddTransactionPage({ searchParams }: { searchParams?: Promise<{ edit?: string }> }) {
  const unwrappedSearchParams = searchParams ? use(searchParams) : {};
  const editId = unwrappedSearchParams.edit;

  const supabase = createClient();
  const router = useRouter();
  const { activeGroup: group, loading: groupLoading, userProfile } = useGroup();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [transactions, setTransactions] = useState<TransactionBlock[]>([
    { tempId: generateTempId(), date: getTodayStr(), shopName: '', note: '', items: [] }
  ]);
  const [userId, setUserId] = useState('');
  const [members, setMembers] = useState<(GroupMember & { profiles: Profile })[]>([]);

  // AI Magic Fill
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Food autocomplete
  const [foodDictionary, setFoodDictionary] = useState<FoodItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchTxId, setActiveSearchTxId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // New food form
  const [activeNewFoodTxId, setActiveNewFoodTxId] = useState<string | null>(null);
  const [newFoodName, setNewFoodName] = useState('');
  const [newFoodCalories, setNewFoodCalories] = useState('');
  const [newFoodProtein, setNewFoodProtein] = useState('');

  const loadData = useCallback(async () => {
    if (groupLoading) return;
    if (!userProfile) return;
    setUserId(userProfile.id);

    if (!group) {
      if (typeof window !== 'undefined') window.location.href = '/groups';
      return;
    }

    const [membersRes, foodRes] = await Promise.all([
      supabase.from('group_members').select('*, profiles(*)').eq('group_id', group.id),
      supabase.from('food_dictionary').select('*').order('name'),
    ]);

    if (membersRes.data) {
      setMembers(membersRes.data as (GroupMember & { profiles: Profile })[]);
    }
    if (foodRes.data) setFoodDictionary(foodRes.data);

    // If editing, load the transaction
    if (editId) {
      const { data: tx } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', editId)
        .single();
      
      if (tx) {
        let formItems: TransactionFormItem[] = [];
        if (tx.items_breakdown) {
          formItems = (tx.items_breakdown as ItemBreakdownEntry[]).map(item => ({
            tempId: generateTempId(),
            food_id: item.food_id || '',
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            calories_per_unit: item.calories_per_unit,
            protein_per_unit: item.protein_per_unit,
            shared_by_user_ids: item.shared_by.map(s => s.user_id),
            isNew: false
          }));
        }
        
        setTransactions([
          {
            tempId: generateTempId(),
            date: tx.transaction_date,
            shopName: tx.shop_name || '',
            note: tx.note || '',
            items: formItems
          }
        ]);
      }
    }

    setLoading(false);
  }, [supabase, groupLoading, group, editId, userProfile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered food suggestions
  const filteredFoods = searchQuery.length > 0
    ? foodDictionary.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const updateTransactionField = (txId: string, field: keyof TransactionBlock, value: any) => {
    setTransactions(prev => prev.map(tx => tx.tempId === txId ? { ...tx, [field]: value } : tx));
  };

  const removeTransactionBlock = (txId: string) => {
    setTransactions(prev => prev.filter(tx => tx.tempId !== txId));
  };

  const addEmptyTransactionBlock = () => {
    setTransactions(prev => [
      ...prev,
      { tempId: generateTempId(), date: getTodayStr(), shopName: '', note: '', items: [] }
    ]);
  };

  const addItemFromDictionary = (food: FoodItem) => {
    if (!activeSearchTxId) return;
    
    setTransactions(prev => prev.map(tx => {
      if (tx.tempId !== activeSearchTxId) return tx;
      return {
        ...tx,
        items: [
          ...tx.items,
          {
            tempId: generateTempId(),
            food_id: food.id,
            name: food.name,
            quantity: 1,
            unit_price: 0,
            calories_per_unit: food.calories,
            protein_per_unit: food.protein,
            shared_by_user_ids: members.map((m) => m.user_id),
            isNew: false,
          }
        ]
      };
    }));
    
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleAddNewFood = async () => {
    if (!newFoodName.trim() || !activeNewFoodTxId) return;

    const calories = parseFloat(newFoodCalories) || 0;
    const protein = parseFloat(newFoodProtein) || 0;

    // Save to dictionary
    const { data: savedFood } = await supabase
      .from('food_dictionary')
      .upsert({ name: newFoodName.trim(), calories, protein }, { onConflict: 'name' })
      .select()
      .single();

    const food_id = savedFood?.id || null;

    setTransactions(prev => prev.map(tx => {
      if (tx.tempId !== activeNewFoodTxId) return tx;
      return {
        ...tx,
        items: [
          ...tx.items,
          {
            tempId: generateTempId(),
            food_id,
            name: newFoodName.trim(),
            quantity: 1,
            unit_price: 0,
            calories_per_unit: calories,
            protein_per_unit: protein,
            shared_by_user_ids: members.map((m) => m.user_id),
            isNew: true,
          }
        ]
      };
    }));

    if (savedFood) {
      setFoodDictionary((prev) => [...prev, savedFood]);
    }

    setNewFoodName('');
    setNewFoodCalories('');
    setNewFoodProtein('');
    setActiveNewFoodTxId(null);
    setSearchQuery('');
  };

  const updateItem = (txId: string, itemTempId: string, field: string, value: number | string) => {
    setTransactions(prev => prev.map(tx => {
      if (tx.tempId !== txId) return tx;
      return {
        ...tx,
        items: tx.items.map(item => item.tempId === itemTempId ? { ...item, [field]: value } : item)
      };
    }));
  };

  const toggleUserForItem = (txId: string, itemTempId: string, uid: string) => {
    setTransactions(prev => prev.map(tx => {
      if (tx.tempId !== txId) return tx;
      return {
        ...tx,
        items: tx.items.map(item => {
          if (item.tempId !== itemTempId) return item;
          const ids = item.shared_by_user_ids.includes(uid)
            ? item.shared_by_user_ids.filter((id) => id !== uid)
            : [...item.shared_by_user_ids, uid];
          return { ...item, shared_by_user_ids: ids.length > 0 ? ids : [uid] };
        })
      };
    }));
  };

  const removeItem = (txId: string, itemTempId: string) => {
    setTransactions(prev => prev.map(tx => {
      if (tx.tempId !== txId) return tx;
      return { ...tx, items: tx.items.filter(item => item.tempId !== itemTempId) };
    }));
  };

  // Compute total of all transactions
  const grandTotal = transactions.reduce((sum, tx) => {
    const txTotal = tx.items.reduce((tsum, item) => tsum + item.quantity * item.unit_price, 0);
    return sum + txTotal;
  }, 0);

  const buildItemsBreakdown = (items: TransactionFormItem[]): ItemBreakdownEntry[] => {
    return items.map((item) => {
      const totalPrice = item.quantity * item.unit_price;
      const shareCount = item.shared_by_user_ids.length;
      const percentage = shareCount > 0 ? 100 / shareCount : 0;

      const shared_by: SharedByEntry[] = item.shared_by_user_ids.map((uid) => {
        const member = members.find((m) => m.user_id === uid);
        const name = (member?.profiles as unknown as Profile)?.name || 'Unknown';
        return {
          user_id: uid,
          name,
          percentage: Math.round(percentage * 100) / 100,
          calories: Math.round((item.calories_per_unit * item.quantity * percentage) / 100 * 10) / 10,
          protein: Math.round((item.protein_per_unit * item.quantity * percentage) / 100 * 10) / 10,
        };
      });

      return {
        food_id: item.food_id || '',
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: totalPrice,
        calories_per_unit: item.calories_per_unit,
        protein_per_unit: item.protein_per_unit,
        shared_by,
      };
    });
  };

  const handleSubmit = async () => {
    if (!group) return;
    
    // Filter out transactions that have no items or zero total
    const validTransactions = transactions.filter(tx => {
      const total = tx.items.reduce((tsum, item) => tsum + item.quantity * item.unit_price, 0);
      return tx.items.length > 0 && total > 0;
    });

    if (validTransactions.length === 0) return;
    setSubmitting(true);

    const payloads = validTransactions.map(tx => {
      const items_breakdown = buildItemsBreakdown(tx.items);
      const totalAmount = tx.items.reduce((tsum, item) => tsum + item.quantity * item.unit_price, 0);

      return {
        group_id: group.id,
        paid_by: userId,
        total_amount: totalAmount,
        shop_name: tx.shopName.trim(),
        note: tx.note.trim(),
        transaction_date: tx.date,
        items_breakdown,
      };
    });

    let error;
    if (editId && payloads.length === 1) {
      const { error: updateErr } = await supabase
        .from('transactions')
        .update(payloads[0])
        .eq('id', editId);
      error = updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from('transactions')
        .insert(payloads);
      error = insertErr;
    }

    if (!error) {
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 400);
    } else {
      setSubmitting(false);
      alert("Error saving: " + error.message);
    }
  };

  const handleAiFill = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError('');

    try {
      const res = await fetch('/api/ai/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse');
      }

      const parsedTransactions = Array.isArray(data) ? data : [data];
      
      const newBlocks = parsedTransactions.map((ptx: any) => {
        const parsedItems = Array.isArray(ptx.items) ? ptx.items.map((aiItem: any) => {
          const match = foodDictionary.find(f => 
            f.name.toLowerCase().includes(aiItem.name.toLowerCase()) || 
            aiItem.name.toLowerCase().includes(f.name.toLowerCase())
          );
          return {
            tempId: generateTempId(),
            food_id: match ? match.id : null,
            name: match ? match.name : aiItem.name,
            quantity: aiItem.quantity || 1,
            unit_price: aiItem.price || 0,
            calories_per_unit: match ? match.calories : 0,
            protein_per_unit: match ? match.protein : 0,
            shared_by_user_ids: members.map(m => m.user_id),
            isNew: !match
          };
        }) : [];

        // Try to parse the date cleanly, fallback to today
        let finalDate = ptx.date;
        if (!finalDate || finalDate.length !== 10) {
          finalDate = getTodayStr();
        }

        return {
          tempId: generateTempId(),
          date: finalDate,
          shopName: ptx.shopName || '',
          note: ptx.note || '',
          items: parsedItems
        };
      });

      // Replace if currently only 1 empty block, otherwise append
      if (transactions.length === 1 && transactions[0].items.length === 0 && !transactions[0].shopName) {
        setTransactions(newBlocks);
      } else {
        setTransactions(prev => [...prev, ...newBlocks]);
      }

      setAiPrompt('');
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-12 rounded-xl" />
        <div className="skeleton h-12 rounded-xl" />
        <div className="skeleton h-40 rounded-xl" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center animate-fade-in-up">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">{editId ? 'Expense Updated!' : 'Expenses Added!'} 🎉</h2>
        <p className="text-sm text-slate-500 mt-1">Redirecting to dashboard...</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-24">
      {/* Click outside overlay scoped to entire page for dropdowns */}
      {showSuggestions && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowSuggestions(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5 animate-fade-in-up">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {editId ? 'Edit Expense' : 'Add Expense'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            What did you guys eat today?
          </p>
        </div>
        <button 
          onClick={() => window.location.href = '/groups'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full border border-slate-200 hover:bg-slate-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Groups
        </button>
      </div>

      {/* AI Magic Fill */}
      <div className="card p-4 mb-6 animate-fade-in-up delay-1 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 shadow-sm shadow-indigo-100/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">✨</span>
          <h2 className="text-sm font-bold text-indigo-900">Bulk Magic Fill</h2>
        </div>
        <p className="text-xs text-indigo-600/80 mb-3">
          Paste multiple receipts or type naturally like: &quot;2 samosa from bhajan halwai yesterday, 1 pizza from roms today&quot;
        </p>
        <div className="flex gap-2 relative">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={aiLoading}
            placeholder="What did you get?"
            className="input w-full text-sm resize-none min-h-[50px] py-2 bg-white/60 focus:bg-white"
            rows={2}
          />
          <button
            onClick={handleAiFill}
            disabled={aiLoading || !aiPrompt.trim()}
            className="btn bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 disabled:opacity-50 h-auto"
          >
            {aiLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>
        {aiError && (
          <p className="text-[11px] text-rose-500 font-medium mt-2">
            Failed: {aiError}
          </p>
        )}
      </div>

      {/* Transactions List */}
      <div className="space-y-6">
        {transactions.map((tx, txIndex) => (
          <div key={tx.tempId} className="card p-4 relative animate-fade-in-up border-2 border-transparent hover:border-slate-100 transition-colors">
            
            {/* Remove Block Button */}
            {transactions.length > 1 && (
              <button
                onClick={() => removeTransactionBlock(tx.tempId)}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white border shadow-sm text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors z-10"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-100">
              <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                {txIndex + 1}
              </span>
              <h3 className="font-bold text-slate-800 text-sm">Receipt / Transaction</h3>
            </div>

            {/* Date Picker */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">
                Date
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateTransactionField(tx.tempId, 'date', getTodayStr())}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    tx.date === getTodayStr()
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => updateTransactionField(tx.tempId, 'date', getYesterdayStr())}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    tx.date === getYesterdayStr()
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Yesterday
                </button>
                <input
                  type="date"
                  value={tx.date}
                  onChange={(e) => updateTransactionField(tx.tempId, 'date', e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Shop Name & Note */}
            <div className="mb-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">
                  Shop / Vendor
                </label>
                <input
                  type="text"
                  value={tx.shopName}
                  onChange={(e) => updateTransactionField(tx.tempId, 'shopName', e.target.value)}
                  placeholder="e.g., Raju's Stall"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={tx.note}
                  onChange={(e) => updateTransactionField(tx.tempId, 'note', e.target.value)}
                  placeholder="Note (optional)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Added Items List */}
            {tx.items.length > 0 && (
              <div className="space-y-3 mb-4">
                {tx.items.map((item, idx) => (
                  <div
                    key={item.tempId}
                    className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"
                  >
                    {/* Item Header */}
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-slate-900">
                        {item.name}
                      </p>
                      <button
                        onClick={() => removeItem(tx.tempId, item.tempId)}
                        className="w-6 h-6 rounded-full bg-rose-50 flex items-center justify-center hover:bg-rose-100"
                      >
                        <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Quantity & Price */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                          Qty
                        </label>
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={() => updateItem(tx.tempId, item.tempId, 'quantity', Math.max(1, item.quantity - 1))}
                            className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-200"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-slate-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateItem(tx.tempId, item.tempId, 'quantity', item.quantity + 1)}
                            className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-200"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                          Unit Price (₹)
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={item.unit_price || ''}
                          onChange={(e) => updateItem(tx.tempId, item.tempId, 'unit_price', parseFloat(e.target.value) || 0)}
                          placeholder="₹0"
                          className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Macros Preview */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                        🔥 {item.calories_per_unit * item.quantity} cal
                      </span>
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
                        💪 {(item.protein_per_unit * item.quantity).toFixed(1)}g protein
                      </span>
                    </div>

                    {/* Split Between Users */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-medium mb-1.5 block uppercase tracking-wide">
                        Split between
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {members.map((m, mIdx) => {
                          const profile = m.profiles as unknown as Profile;
                          const isSelected = item.shared_by_user_ids.includes(m.user_id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleUserForItem(tx.tempId, item.tempId, m.user_id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                                isSelected
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              {profile?.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={profile.avatar_url} alt="" className="w-3.5 h-3.5 rounded-full" />
                              ) : (
                                <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] text-white ${getAvatarColor(mIdx)}`}>
                                  {getInitials(profile?.name || '?')}
                                </span>
                              )}
                              {profile?.name?.split(' ')[0]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search / Add Food for this transaction */}
            <div className="relative z-30">
              <input
                type="text"
                value={activeSearchTxId === tx.tempId ? searchQuery : ''}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  setActiveSearchTxId(tx.tempId);
                  setShowSuggestions(true);
                }}
                placeholder="+ Add Item (Samosa, Chai...)"
                className="w-full px-4 py-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:bg-white transition-colors"
              />

              {/* Suggestions Dropdown */}
              {showSuggestions && activeSearchTxId === tx.tempId && searchQuery.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {filteredFoods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => addItemFromDictionary(food)}
                      className="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors flex items-center justify-between border-b border-slate-50 last:border-0"
                    >
                      <span className="text-sm font-medium text-slate-800">
                        {food.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {food.calories} cal · {food.protein}g
                      </span>
                    </button>
                  ))}
                  {filteredFoods.length === 0 && (
                    <button
                      onClick={() => {
                        setNewFoodName(searchQuery);
                        setActiveNewFoodTxId(tx.tempId);
                        setShowSuggestions(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-amber-50 transition-colors flex items-center gap-2"
                    >
                      <span className="w-5 h-5 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 text-[10px] font-bold">
                        +
                      </span>
                      <span className="text-xs font-semibold text-amber-700">
                        Create &quot;{searchQuery}&quot;
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* New Food Form for this transaction */}
            {activeNewFoodTxId === tx.tempId && (
              <div className="bg-amber-50 rounded-xl p-3 mt-2 border border-amber-100 animate-fade-in">
                <p className="text-[11px] font-bold text-amber-800 mb-2 uppercase tracking-wide">
                  New Food Macro Estimate
                </p>
                <input
                  type="text"
                  value={newFoodName}
                  onChange={(e) => setNewFoodName(e.target.value)}
                  placeholder="Food name"
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-md text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newFoodCalories}
                    onChange={(e) => setNewFoodCalories(e.target.value)}
                    placeholder="Calories"
                    className="px-3 py-2 bg-white border border-amber-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    value={newFoodProtein}
                    onChange={(e) => setNewFoodProtein(e.target.value)}
                    placeholder="Protein (g)"
                    className="px-3 py-2 bg-white border border-amber-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveNewFoodTxId(null)}
                    className="flex-1 py-1.5 px-2 bg-white border border-amber-200 text-amber-700 rounded-md text-xs font-bold hover:bg-amber-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddNewFood}
                    disabled={!newFoodName.trim()}
                    className="flex-1 py-1.5 px-2 bg-amber-500 text-white rounded-md text-xs font-bold disabled:opacity-50 hover:bg-amber-600"
                  >
                    Add Item
                  </button>
                </div>
              </div>
            )}

            {/* Transaction Subtotal */}
            {tx.items.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Subtotal</span>
                <span className="text-sm font-extrabold text-slate-900">
                  ₹{tx.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Add Another Receipt Button */}
        {!editId && (
          <button
            onClick={addEmptyTransactionBlock}
            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2"
          >
            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-sm">+</span>
            Add Another Receipt
          </button>
        )}
      </div>

      {/* Total & Submit */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 z-40">
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-600">
                Grand Total ({transactions.filter(tx => tx.items.length > 0).length} receipts)
              </span>
              <span className="text-2xl font-extrabold text-slate-900">
                ₹{grandTotal}
              </span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={grandTotal <= 0 || submitting}
              className="w-full btn btn-primary py-4 shadow-emerald-200"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  {editId ? 'Updating...' : 'Saving All...'}
                </span>
              ) : (
                `Save ${transactions.length > 1 ? 'All ' : ''}Expenses • ${formatCurrency(grandTotal)}`
              )}
            </button>
          </div>
      </div>
    </div>
  );
}
