-- Supabase RLS policy examples (apply via SQL editor in Supabase)
-- WARNING: These policies are permissive and intended for a private/demo project only.
-- For production, tighten policies and avoid granting anon delete rights.

-- Enable RLS on tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

-- Allow anon role to SELECT/INSERT/DELETE on orders
CREATE POLICY "anon_select_orders" ON public.orders FOR SELECT USING (auth.role() = 'anon');
CREATE POLICY "anon_insert_orders" ON public.orders FOR INSERT WITH CHECK (auth.role() = 'anon');
CREATE POLICY "anon_delete_orders" ON public.orders FOR DELETE USING (auth.role() = 'anon');

-- Deliveries
CREATE POLICY "anon_select_deliveries" ON public.deliveries FOR SELECT USING (auth.role() = 'anon');
CREATE POLICY "anon_insert_deliveries" ON public.deliveries FOR INSERT WITH CHECK (auth.role() = 'anon');
CREATE POLICY "anon_delete_deliveries" ON public.deliveries FOR DELETE USING (auth.role() = 'anon');

-- Couriers
CREATE POLICY "anon_select_couriers" ON public.couriers FOR SELECT USING (auth.role() = 'anon');
CREATE POLICY "anon_insert_couriers" ON public.couriers FOR INSERT WITH CHECK (auth.role() = 'anon');
CREATE POLICY "anon_delete_couriers" ON public.couriers FOR DELETE USING (auth.role() = 'anon');

-- Note: for safer setup, allow only inserts and selects, and limit deletes to authenticated admin roles.
