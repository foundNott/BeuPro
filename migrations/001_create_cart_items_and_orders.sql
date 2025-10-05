-- Migration: create minimal cart_items and ensure orders table exists
-- Run this in your Supabase SQL editor (SQL > New query) for the project's public schema.

-- Create cart_items to store anonymous session carts
CREATE TABLE IF NOT EXISTS public.cart_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id text,
  product_id text,
  meta jsonb,
  quantity integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

-- Ensure orders table exists with explicit columns used by the frontend
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
  created_at timestamp with time zone DEFAULT now()
);

-- Optional: grant public insert/select for demo/testing (only if you allow anonymous access)
-- Uncomment if you want to allow client-side inserts without RLS policies (not recommended for production)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO anon;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO anon;
