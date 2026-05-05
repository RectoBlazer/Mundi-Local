
-- Enums
CREATE TYPE public.agent_name AS ENUM ('finn', 'mira', 'cara');
CREATE TYPE public.business_data_type AS ENUM ('expense', 'earning', 'inventory');
CREATE TYPE public.ticket_channel AS ENUM ('whatsapp', 'shopee', 'telegram');
CREATE TYPE public.ticket_status AS ENUM ('open', 'replied', 'closed');
CREATE TYPE public.order_status AS ENUM ('pending', 'approved', 'rejected', 'fulfilled');
CREATE TYPE public.post_status AS ENUM ('draft', 'scheduled', 'published');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  business_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Business data (Finn)
CREATE TABLE public.business_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type public.business_data_type NOT NULL,
  file_name TEXT NOT NULL,
  raw_csv TEXT,
  parsed_json JSONB,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Product catalog (Mira)
CREATE TABLE public.product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent logs (activity feed)
CREATE TABLE public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  agent public.agent_name NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer tickets (Cara)
CREATE TABLE public.customer_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  channel public.ticket_channel NOT NULL,
  customer_handle TEXT NOT NULL,
  message TEXT NOT NULL,
  ai_reply TEXT,
  status public.ticket_status NOT NULL DEFAULT 'open',
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pending orders (Cara → Owner approval)
CREATE TABLE public.pending_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.customer_tickets ON DELETE SET NULL,
  product_id UUID REFERENCES public.product_catalog ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  customer_handle TEXT,
  status public.order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Social posts (Mira)
CREATE TABLE public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id UUID REFERENCES public.product_catalog ON DELETE SET NULL,
  platform TEXT NOT NULL,
  caption TEXT NOT NULL,
  image_url TEXT,
  hashtags TEXT[],
  scheduled_at TIMESTAMPTZ,
  status public.post_status NOT NULL DEFAULT 'draft',
  external_post_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Generic owner policies macro
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_data','product_catalog','agent_logs','customer_tickets','pending_orders','social_posts']
  LOOP
    EXECUTE format('CREATE POLICY "own select" ON public.%I FOR SELECT USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "own insert" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "own update" ON public.%I FOR UPDATE USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "own delete" ON public.%I FOR DELETE USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.product_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.customer_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.pending_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, business_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'business_name', 'My Business')
  );
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime for activity feed and tickets
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_orders;

-- Storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product images public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');
CREATE POLICY "product images owner upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "product images owner update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "product images owner delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Indexes
CREATE INDEX idx_agent_logs_user_created ON public.agent_logs(user_id, created_at DESC);
CREATE INDEX idx_tickets_user_created ON public.customer_tickets(user_id, created_at DESC);
CREATE INDEX idx_orders_user_status ON public.pending_orders(user_id, status);
CREATE INDEX idx_products_user ON public.product_catalog(user_id);
