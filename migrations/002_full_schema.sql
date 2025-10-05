-- Migration: Full minimal schema for Supabase (create tables used by the frontend)
-- Run in Supabase SQL editor (SQL > New query) for your project.

-- NOTE: This migration creates tables only. It does NOT enable RLS policies. If you want to allow
-- anonymous client access from the browser, you'll need to create permissive policies or grant
-- appropriate rights; see the optional policy snippet at the end (for demo use only).

CREATE TABLE IF NOT EXISTS public.admin_users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid,
  role text NOT NULL DEFAULT 'admin',
  notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text,
  email text,
  body text NOT NULL,
  rating integer,
  approved boolean DEFAULT false,
  pinned boolean DEFAULT false,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.couriers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text,
  vehicle text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date date,
  time text,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fullname text,
  phone text,
  email text,
  address text,
  city text,
  postal text,
  payment text,
  comments text,
  cart jsonb,
  total numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promotions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  link text NOT NULL,
  image text,
  created_at timestamptz DEFAULT now()
);

-- Minimal cart_items for anonymous carts
CREATE TABLE IF NOT EXISTS public.cart_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id text,
  product_id text,
  meta jsonb,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Optional: example permissive policies for demo/testing ONLY
-- WARNING: These policies allow the anon role to read and write tables. Do NOT use in production.
-- Uncomment and run if you want quick browser-only demo access (and you understand the security risk).
--
-- -- Enable RLS then create permissive policies
-- ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_cart_items_select" ON public.cart_items FOR SELECT USING (true);
-- CREATE POLICY "anon_cart_items_insert" ON public.cart_items FOR INSERT WITH CHECK (true);
--
-- ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_orders_insert" ON public.orders FOR INSERT WITH CHECK (true);
-- CREATE POLICY "anon_orders_select" ON public.orders FOR SELECT USING (true);
--
-- ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_promotions_select" ON public.promotions FOR SELECT USING (true);
--
-- ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_comments_insert" ON public.comments FOR INSERT WITH CHECK (true);
-- CREATE POLICY "anon_comments_select" ON public.comments FOR SELECT USING (true);

-- End of migration
