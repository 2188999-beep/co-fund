'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { FoodItem } from '@/lib/types';

export default function FoodManagePage() {
  const supabase = createClient();
  
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const [foodName, setFoodName] = useState('');
  const [foodCalories, setFoodCalories] = useState('');
  const [foodProtein, setFoodProtein] = useState('');
  const [saving, setSaving] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const fetchFood = async () => {
    setLoading(true);
    const { data } = await supabase.from('food_dictionary').select('*').order('name');
    if (data) {
      setFoodItems(data as unknown as FoodItem[]);
    }
    setLoading(false);
  };

  const checkAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'jk2188999@gmail.com';
    
    if (user?.email === adminEmail) {
      setAuthorized(true);
      fetchFood();
    } else {
      setAuthorized(false);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const filteredFood = useMemo(() => {
    if (!searchQuery) return foodItems;
    return foodItems.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [foodItems, searchQuery]);

  const handleSaveFood = async () => {
    if (!foodName.trim() || !foodCalories || !foodProtein) return;
    setSaving(true);
    
    if (editingFood) {
      await supabase.from('food_dictionary').update({
        name: foodName.trim(),
        calories: parseFloat(foodCalories) || 0,
        protein: parseFloat(foodProtein) || 0,
      }).eq('id', editingFood.id);
    } else {
      await supabase.from('food_dictionary').insert({
        name: foodName.trim(),
        calories: parseFloat(foodCalories) || 0,
        protein: parseFloat(foodProtein) || 0,
      });
    }
    
    setSaving(false);
    setShowModal(false);
    setEditingFood(null);
    setFoodName('');
    setFoodCalories('');
    setFoodProtein('');
    fetchFood();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this food item?')) return;
    await supabase.from('food_dictionary').delete().eq('id', id);
    fetchFood();
  };

  const openAddModal = () => {
    setEditingFood(null);
    setFoodName('');
    setFoodCalories('');
    setFoodProtein('');
    setAiError('');
    setShowModal(true);
  };

  const openEditModal = (food: FoodItem) => {
    setEditingFood(food);
    setFoodName(food.name);
    setFoodCalories(food.calories.toString());
    setFoodProtein(food.protein.toString());
    setAiError('');
    setShowModal(true);
  };

  const handleAutoFillNutrition = async () => {
    if (!foodName.trim()) return;
    setAiLoading(true);
    setAiError('');

    try {
      const res = await fetch('/api/ai/guess-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodName: foodName.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to guess nutrition');
      }

      if (data.calories !== undefined) setFoodCalories(data.calories.toString());
      if (data.protein !== undefined) setFoodProtein(data.protein.toString());

    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return <div className="p-4"><div className="skeleton h-8 w-40 mb-4" /></div>;
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Unauthorized</h1>
        <p className="text-slate-500 max-w-sm mb-6">You do not have permission to view this page. This page is restricted to the administrator.</p>
        <Link href="/dashboard" className="btn btn-primary px-8">Return to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-white px-4 pt-6 pb-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Food Dictionary</h1>
            <p className="text-sm text-slate-500">Manage master database of food items</p>
          </div>
          <button onClick={openAddModal} className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search food items..."
            className="input w-full pl-10 bg-slate-50 border-transparent focus:bg-white"
          />
          <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
      </div>

      {/* List */}
      <div className="px-4 py-4 space-y-2">
        {filteredFood.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400">No food items found matching your search.</p>
          </div>
        ) : (
          filteredFood.map((food) => (
            <div key={food.id} className="card p-4 flex items-center justify-between group hover:border-emerald-200 transition-colors">
              <div>
                <p className="font-bold text-slate-900">{food.name}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                    🔥 {food.calories} kcal
                  </span>
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                    💪 {food.protein}g protein
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(food)}
                  className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(food.id)}
                  className="w-8 h-8 rounded-lg bg-rose-50 text-rose-400 flex items-center justify-center hover:bg-rose-100 hover:text-rose-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm animate-scale-up shadow-xl relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold text-slate-900 mb-5 pr-8">
              {editingFood ? 'Edit Food' : 'Add New Food'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-bold text-slate-700">Food Name</label>
                  <button
                    onClick={handleAutoFillNutrition}
                    disabled={!foodName.trim() || aiLoading}
                    className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50 transition-colors"
                  >
                    {aiLoading ? (
                      <div className="w-3 h-3 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                    ) : (
                      '✨'
                    )}
                    Auto-fill Nutrition
                  </button>
                </div>
                <input
                  type="text"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  placeholder="e.g. Samosa"
                  className="input w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    🔥 Calories <span className="text-slate-400 font-normal">(kcal)</span>
                  </label>
                  <input
                    type="number"
                    value={foodCalories}
                    onChange={(e) => setFoodCalories(e.target.value)}
                    placeholder="250"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    💪 Protein <span className="text-slate-400 font-normal">(g)</span>
                  </label>
                  <input
                    type="number"
                    value={foodProtein}
                    onChange={(e) => setFoodProtein(e.target.value)}
                    placeholder="5"
                    className="input w-full"
                  />
                </div>
              </div>
            </div>

            {aiError && (
              <p className="text-[11px] text-rose-500 font-medium mt-3 text-center">
                AI Error: {aiError}
              </p>
            )}

            <button
              onClick={handleSaveFood}
              disabled={!foodName.trim() || !foodCalories || !foodProtein || saving}
              className="btn btn-primary w-full mt-6 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Food'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
