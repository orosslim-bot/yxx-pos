-- =============================================
-- YXX-POS 資料庫 Schema
-- 請複製到 Supabase SQL Editor 執行
-- =============================================

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
INSERT INTO categories (name) VALUES
  ('公仔'),('花藝'),('髮飾'),('掛件'),('盆栽類'),('其他');

CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  price INTEGER DEFAULT 0,
  cost INTEGER DEFAULT 0,
  stock INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 1,
  image_url TEXT,
  image_filename TEXT,
  note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'cashier',
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE booths (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO booths (name, pin) VALUES ('攤位A', '0001'), ('攤位B', '0002');

CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  cashier_id UUID REFERENCES profiles(id),
  booth_id INTEGER REFERENCES booths(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  subtotal INTEGER NOT NULL
);

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_read" ON products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_admin" ON products
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY "orders_insert" ON orders
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "orders_read" ON orders
  FOR SELECT TO authenticated
  USING (cashier_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY "order_items_insert" ON order_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "order_items_read" ON order_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_read" ON profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

-- =============================================
-- Trigger：新用戶自動建立 profile
-- =============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, role)
  VALUES (NEW.id, 'cashier');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- Function：安全扣減庫存（避免並發衝突）
-- =============================================

CREATE OR REPLACE FUNCTION deduct_stock(p_id UUID, qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE products SET stock = stock - qty, updated_at = NOW()
  WHERE id = p_id AND stock >= qty;
  IF NOT FOUND THEN RAISE EXCEPTION '庫存不足'; END IF;
END;
$$ LANGUAGE plpgsql;
