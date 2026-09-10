-- ============================================================
-- CoFund (Company Khaata) — Supabase SQL Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  email TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. GROUPS
-- ============================================================
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_funds NUMERIC(10, 2) NOT NULL DEFAULT 0,
  guest_password TEXT NOT NULL DEFAULT '1234',
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guests can view groups by ID"
  ON public.groups FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Manager can update group"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (manager_id = auth.uid())
  WITH CHECK (manager_id = auth.uid());

CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (manager_id = auth.uid());

CREATE POLICY "Manager can delete group"
  ON public.groups FOR DELETE
  TO authenticated
  USING (manager_id = auth.uid());

-- ============================================================
-- 3. GROUP_MEMBERS
-- ============================================================
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING ( public.is_group_member(group_id) );

CREATE POLICY "Guests can view group members"
  ON public.group_members FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Manager or self can add members"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    group_id IN (
      SELECT id FROM public.groups WHERE manager_id = auth.uid()
    )
  );

CREATE POLICY "Manager can remove members"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    group_id IN (
      SELECT id FROM public.groups WHERE manager_id = auth.uid()
    )
  );

-- Group members can view their groups, but we need anyone to find a group by invite code
CREATE POLICY "Authenticated users can view any group to join"
  ON public.groups FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 4. FOOD_DICTIONARY
-- ============================================================
CREATE TABLE public.food_dictionary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  calories NUMERIC(8, 2) NOT NULL DEFAULT 0,
  protein NUMERIC(8, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.food_dictionary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read food dictionary"
  ON public.food_dictionary FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can add food items"
  ON public.food_dictionary FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update food items"
  ON public.food_dictionary FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read food dictionary"
  ON public.food_dictionary FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- 5. TRANSACTIONS
-- ============================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  paid_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  shop_name TEXT DEFAULT '',
  note TEXT DEFAULT '',
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  items_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_group_date ON public.transactions(group_id, transaction_date DESC);
CREATE INDEX idx_transactions_group_id ON public.transactions(group_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING ( public.is_group_member(group_id) );

CREATE POLICY "Guests can view transactions"
  ON public.transactions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Group members can add transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_group_member(group_id)
    AND paid_by = auth.uid()
  );

CREATE POLICY "Payer or manager can update transactions"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (
    paid_by = auth.uid()
    OR
    group_id IN (
      SELECT id FROM public.groups WHERE manager_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_group_member(group_id)
  );

CREATE POLICY "Payer or manager can delete transactions"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (
    paid_by = auth.uid()
    OR
    group_id IN (
      SELECT id FROM public.groups WHERE manager_id = auth.uid()
    )
  );

-- ============================================================
-- 6. FUND ADDITIONS
-- ============================================================
CREATE TABLE public.fund_additions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.fund_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view fund additions"
  ON public.fund_additions FOR SELECT
  TO authenticated
  USING ( public.is_group_member(group_id) );

CREATE POLICY "Guests can view fund additions"
  ON public.fund_additions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Group members can add funds"
  ON public.fund_additions FOR INSERT
  TO authenticated
  WITH CHECK ( public.is_group_member(group_id) );

-- ============================================================
-- 7. TRIGGERS & FUNCTIONS
-- ============================================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Auto-update group total_funds when funds are added
CREATE OR REPLACE FUNCTION public.handle_fund_addition()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.groups
  SET total_funds = total_funds + NEW.amount
  WHERE id = NEW.group_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_fund_addition
  AFTER INSERT ON public.fund_additions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_fund_addition();

-- ============================================================
-- 8. HELPER RPC FUNCTIONS
-- ============================================================

-- Check if current user is a member of a group (bypasses RLS to prevent recursion)
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate remaining funds for a group
CREATE OR REPLACE FUNCTION public.get_group_funds_remaining(p_group_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total_funds NUMERIC;
  v_total_spent NUMERIC;
BEGIN
  SELECT total_funds INTO v_total_funds
  FROM public.groups WHERE id = p_group_id;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_spent
  FROM public.transactions WHERE group_id = p_group_id;

  RETURN v_total_funds - v_total_spent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get macro stats per user for a group within a date range
CREATE OR REPLACE FUNCTION public.get_macro_stats(
  p_group_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  total_calories NUMERIC,
  total_protein NUMERIC,
  total_spent NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (shared_user->>'user_id')::UUID AS user_id,
    shared_user->>'name' AS user_name,
    ROUND(SUM((shared_user->>'calories')::NUMERIC), 1) AS total_calories,
    ROUND(SUM((shared_user->>'protein')::NUMERIC), 1) AS total_protein,
    ROUND(SUM(
      (item->>'total_price')::NUMERIC * (shared_user->>'percentage')::NUMERIC / 100
    ), 2) AS total_spent
  FROM
    public.transactions t,
    jsonb_array_elements(t.items_breakdown) AS item,
    jsonb_array_elements(item->'shared_by') AS shared_user
  WHERE
    t.group_id = p_group_id
    AND t.transaction_date BETWEEN p_start_date AND p_end_date
  GROUP BY
    (shared_user->>'user_id')::UUID,
    shared_user->>'name'
  ORDER BY
    total_calories DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. SEED DATA: Common Indian Street Food
-- ============================================================
INSERT INTO public.food_dictionary (name, calories, protein) VALUES
  ('Samosa', 262, 3.7),
  ('Kachori', 290, 4.2),
  ('Jalebi', 150, 1.0),
  ('Pav Bhaji', 400, 10.0),
  ('Vada Pav', 290, 6.5),
  ('Chole Bhature', 450, 12.0),
  ('Dosa', 168, 3.9),
  ('Idli (2 pcs)', 130, 4.0),
  ('Poha', 250, 5.0),
  ('Aloo Tikki', 180, 3.0),
  ('Paneer Tikka', 320, 18.0),
  ('Egg Roll', 350, 14.0),
  ('Chicken Roll', 380, 22.0),
  ('Momos (6 pcs)', 210, 8.0),
  ('Maggi', 310, 7.0),
  ('Bread Pakoda', 230, 4.5),
  ('Chai', 100, 2.5),
  ('Lassi', 200, 6.0),
  ('Cold Coffee', 180, 4.0),
  ('Lemonade', 80, 0.2),
  ('Golgappa (6 pcs)', 120, 1.5),
  ('Bhel Puri', 150, 3.0),
  ('Sev Puri', 170, 2.8),
  ('Dabeli', 250, 5.0),
  ('Frankie / Wrap', 320, 10.0),
  ('Spring Roll', 200, 4.0),
  ('Tandoori Chicken', 260, 28.0),
  ('Biryani (plate)', 500, 18.0),
  ('Thali (veg)', 600, 15.0),
  ('Burger', 350, 12.0)
ON CONFLICT (name) DO NOTHING;
