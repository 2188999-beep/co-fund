// ============================================================
// CoFund — TypeScript Types (mirrors Supabase schema)
// ============================================================

export interface Profile {
  id: string;
  name: string;
  avatar_url: string;
  email: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  manager_id: string;
  total_funds: number;
  guest_password: string;
  invite_code: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
  // Joined fields
  profiles?: Profile;
}

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  created_at: string;
}

export interface SharedByEntry {
  user_id: string;
  name: string;
  percentage: number;
  calories: number;
  protein: number;
}

export interface ItemBreakdownEntry {
  food_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  calories_per_unit: number;
  protein_per_unit: number;
  shared_by: SharedByEntry[];
}

export interface Transaction {
  id: string;
  group_id: string;
  paid_by: string;
  total_amount: number;
  shop_name: string;
  note?: string;
  transaction_date: string; // DATE string "YYYY-MM-DD"
  items_breakdown: ItemBreakdownEntry[];
  created_at: string;
  // Joined fields
  profiles?: Profile;
}

export interface FundAddition {
  id: string;
  group_id: string;
  added_by: string;
  amount: number;
  note: string;
  created_at: string;
  // Joined fields
  profiles?: Profile;
}

export interface MacroStats {
  user_id: string;
  user_name: string;
  total_calories: number;
  total_protein: number;
  total_spent: number;
}

// ============================================================
// Form / UI Types
// ============================================================

export interface TransactionFormItem {
  tempId: string; // client-side ID for React keys
  food_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  calories_per_unit: number;
  protein_per_unit: number;
  shared_by_user_ids: string[]; // user IDs who share this item
  isNew: boolean; // true if this is a new food item to save to dictionary
}

export interface TransactionFormData {
  transaction_date: string;
  shop_name: string;
  items: TransactionFormItem[];
}
