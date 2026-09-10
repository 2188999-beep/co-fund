'use client';

import { useEffect, useState, useRef, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { FoodItem, GroupMember, Profile, TransactionFormItem, ItemBreakdownEntry, SharedByEntry } from '@/lib/types';
import { getTodayStr, getYesterdayStr, generateTempId, getInitials, getAvatarColor, formatCurrency } from '@/lib/utils';
import { useGroup } from '@/components/GroupContext';

export default function AddTransactionPage({ searchParams }: { searchParams?: Promise<{ edit?: string }> }) {
  const unwrappedSearchParams = searchParams ? use(searchParams) : {};
  const editId = unwrappedSearchParams.edit;

  const supabase = createClient();
  const router = useRouter();
  const { activeGroup: group, loading: groupLoading } = useGroup();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [date, setDate] = useState(getTodayStr());
  const [shopName, setShopName] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<TransactionFormItem[]>([]);
  const [userId, setUserId] = useState('');
  const [members, setMembers] = useState<(GroupMember & { profiles: Profile })[]>([]);

  // Food autocomplete
  const [foodDictionary, setFoodDictionary] = useState<FoodItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // New food form
  const [showNewFoodForm, setShowNewFoodForm] = useState(false);
  const [newFoodName, setNewFoodName] = useState('');
  const [newFoodCalories, setNewFoodCalories] = useState('');
  const [newFoodProtein, setNewFoodProtein] = useState('');

  const loadData = useCallback(async () => {
    if (groupLoading) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

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
        setDate(tx.transaction_date);
        setShopName(tx.shop_name || '');
        setNote(tx.note || '');
        
        // Reconstruct form items from items_breakdown
        if (tx.items_breakdown) {
          const formItems = (tx.items_breakdown as ItemBreakdownEntry[]).map(item => ({
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
          setItems(formItems);
        }
      }
    }

    setLoading(false);
  }, [supabase, groupLoading, group, editId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered food suggestions
  const filteredFoods = searchQuery.length > 0
    ? foodDictionary.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const addItemFromDictionary = (food: FoodItem) => {
    setItems((prev) => [
      ...prev,
      {
        tempId: generateTempId(),
        food_id: food.id,
        name: food.name,
        quantity: 1,
        unit_price: 0,
        calories_per_unit: food.calories,
        protein_per_unit: food.protein,
        shared_by_user_ids: members.map((m) => m.user_id), // Default: shared by all
        isNew: false,
      },
    ]);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleAddNewFood = async () => {
    if (!newFoodName.trim()) return;

    const calories = parseFloat(newFoodCalories) || 0;
    const protein = parseFloat(newFoodProtein) || 0;

    // Save to dictionary
    const { data: savedFood } = await supabase
      .from('food_dictionary')
      .upsert({ name: newFoodName.trim(), calories, protein }, { onConflict: 'name' })
      .select()
      .single();

    const food_id = savedFood?.id || null;

    setItems((prev) => [
      ...prev,
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
      },
    ]);

    // Add to local dictionary
    if (savedFood) {
      setFoodDictionary((prev) => [...prev, savedFood]);
    }

    setNewFoodName('');
    setNewFoodCalories('');
    setNewFoodProtein('');
    setShowNewFoodForm(false);
    setSearchQuery('');
  };

  const updateItem = (tempId: string, field: string, value: number | string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.tempId === tempId ? { ...item, [field]: value } : item
      )
    );
  };

  const toggleUserForItem = (tempId: string, userId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        const ids = item.shared_by_user_ids.includes(userId)
          ? item.shared_by_user_ids.filter((id) => id !== userId)
          : [...item.shared_by_user_ids, userId];
        return { ...item, shared_by_user_ids: ids.length > 0 ? ids : [userId] };
      })
    );
  };

  const removeItem = (tempId: string) => {
    setItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const totalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  const buildItemsBreakdown = (): ItemBreakdownEntry[] => {
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
    if (items.length === 0 || totalAmount <= 0 || !group) return;
    setSubmitting(true);

    const items_breakdown = buildItemsBreakdown();

    const payload = {
      group_id: group.id,
      paid_by: userId,
      total_amount: totalAmount,
      shop_name: shopName.trim(),
      note: note.trim(),
      transaction_date: date,
      items_breakdown,
    };

    let error;
    if (editId) {
      const { error: updateErr } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', editId);
      error = updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from('transactions')
        .insert(payload);
      error = insertErr;
    }

    if (!error) {
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1200);
    } else {
      setSubmitting(false);
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
        <h2 className="text-xl font-bold text-slate-900">{editId ? 'Expense Updated!' : 'Expense Added!'} 🎉</h2>
        <p className="text-sm text-slate-500 mt-1">Redirecting to dashboard...</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-2">
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

      {/* Date Picker with Quick Chips */}
      <div className="mb-4 animate-fade-in-up delay-1">
        <label className="text-xs font-semibold text-slate-500 mb-2 block">
          Date
        </label>
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setDate(getTodayStr())}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              date === getTodayStr()
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600'
            }`}
            id="date-today-chip"
          >
            Today
          </button>
          <button
            onClick={() => setDate(getYesterdayStr())}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              date === getYesterdayStr()
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600'
            }`}
            id="date-yesterday-chip"
          >
            Yesterday
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            id="date-picker"
          />
        </div>
      </div>

      {/* Shop Name */}
      <div className="mb-4 animate-fade-in-up delay-2">
        <label className="text-xs font-semibold text-slate-500 mb-2 block">
          Shop / Vendor
        </label>
        <input
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          placeholder="e.g., Raju's Stall"
          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          id="shop-name-input"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent mt-3"
          id="note-input"
        />
      </div>

      {/* Food Items */}
      <div className="mb-4 animate-fade-in-up delay-3">
        <label className="text-xs font-semibold text-slate-500 mb-2 block">
          Items
        </label>

        {/* Search / Add Food */}
        <div className="relative mb-3 z-50">
          {/* Click outside overlay, scoped to this stacking context */}
          {showSuggestions && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowSuggestions(false)}
            />
          )}
          
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="🔍 Search food (Samosa, Chai...)"
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent relative z-50"
            id="food-search-input"
          />

          {/* Suggestions Dropdown */}
          {showSuggestions && searchQuery.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
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
                    setShowNewFoodForm(true);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-amber-50 transition-colors flex items-center gap-2"
                  id="add-new-food-btn"
                >
                  <span className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 text-xs font-bold">
                    +
                  </span>
                  <span className="text-sm font-medium text-amber-700">
                    Add &quot;{searchQuery}&quot; as new food
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* New Food Form (inline) */}
        {showNewFoodForm && (
          <div className="card p-4 mb-3 border-amber-200 animate-fade-in-up">
            <p className="text-xs font-semibold text-amber-700 mb-3">
              📝 New food item — estimate the macros
            </p>
            <input
              type="text"
              value={newFoodName}
              onChange={(e) => setNewFoodName(e.target.value)}
              placeholder="Food name"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-base mb-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
              id="new-food-name"
            />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input
                type="number"
                inputMode="numeric"
                value={newFoodCalories}
                onChange={(e) => setNewFoodCalories(e.target.value)}
                placeholder="Calories"
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
                id="new-food-calories"
              />
              <input
                type="number"
                inputMode="decimal"
                value={newFoodProtein}
                onChange={(e) => setNewFoodProtein(e.target.value)}
                placeholder="Protein (g)"
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
                id="new-food-protein"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewFoodForm(false)}
                className="btn btn-secondary flex-1 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNewFood}
                disabled={!newFoodName.trim()}
                className="btn bg-amber-500 text-white flex-1 text-sm disabled:opacity-50"
                id="save-new-food-btn"
              >
                Add Item
              </button>
            </div>
          </div>
        )}

        {/* Added Items List */}
        {items.length > 0 && (
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={item.tempId}
                className="card p-3.5 animate-fade-in-up"
              >
                {/* Item Header */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {item.name}
                  </p>
                  <button
                    onClick={() => removeItem(item.tempId)}
                    className="w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center"
                  >
                    <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Quantity & Price */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-medium">
                      Qty
                    </label>
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={() =>
                          updateItem(
                            item.tempId,
                            'quantity',
                            Math.max(1, item.quantity - 1)
                          )
                        }
                        className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateItem(item.tempId, 'quantity', item.quantity + 1)
                        }
                        className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-medium">
                      Unit Price (₹)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={item.unit_price || ''}
                      onChange={(e) =>
                        updateItem(
                          item.tempId,
                          'unit_price',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      placeholder="₹0"
                      className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Macros Preview */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                    🔥 {item.calories_per_unit * item.quantity} cal
                  </span>
                  <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
                    💪 {(item.protein_per_unit * item.quantity).toFixed(1)}g protein
                  </span>
                </div>

                {/* Split Between Users */}
                <div>
                  <label className="text-[10px] text-slate-400 font-medium mb-1.5 block">
                    Split between
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((m, mIdx) => {
                      const profile = m.profiles as unknown as Profile;
                      const isSelected = item.shared_by_user_ids.includes(
                        m.user_id
                      );
                      return (
                        <button
                          key={m.id}
                          onClick={() =>
                            toggleUserForItem(item.tempId, m.user_id)
                          }
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                            isSelected
                              ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={profile.avatar_url}
                              alt=""
                              className="w-4 h-4 rounded-full"
                            />
                          ) : (
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white ${getAvatarColor(mIdx)}`}
                            >
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
      </div>

      {/* Total & Submit */}
      {items.length > 0 && (
        <div className="card p-4 animate-fade-in-up sticky bottom-24 z-20">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-600">Total</span>
            <span className="text-2xl font-extrabold text-slate-900">
              ₹{totalAmount}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={items.length === 0 || totalAmount <= 0 || submitting}
            className="w-full btn btn-primary py-4 shadow-emerald-200"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                {editId ? 'Updating...' : 'Saving...'}
              </span>
            ) : (
              `Save Expense • ${formatCurrency(totalAmount)}`
            )}
          </button>
        </div>
      )}

      {/* Click outside overlay moved to search wrapper to fix stacking context issues */}
    </div>
  );
}
