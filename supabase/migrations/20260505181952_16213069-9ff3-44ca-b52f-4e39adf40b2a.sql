
-- Set search_path on functions
ALTER FUNCTION public.set_updated_at() SET search_path = public;
-- handle_new_user already has search_path set

-- Revoke public/authenticated EXECUTE on trigger functions (only auth-system trigger needs to call them)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Tighten storage SELECT: only allow listing files inside your own folder
DROP POLICY IF EXISTS "product images public read" ON storage.objects;
-- Public read on individual file URLs still works because the bucket is public (CDN serves files);
-- listing via API now requires ownership.
CREATE POLICY "product images list own" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
