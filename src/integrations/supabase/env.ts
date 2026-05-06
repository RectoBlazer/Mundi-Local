// Centralized env access for the frontend + SSR.
// This replaces Lovable-generated SUPABASE_* env usage.

function getEnv(key: string): string | undefined {
  // Vite client-side injection
  // @ts-expect-error - import.meta.env exists in Vite
  const viteVal = typeof import.meta !== 'undefined' ? (import.meta as any).env?.[key] : undefined;
  if (viteVal) return viteVal;

  // SSR / Node env
  if (typeof process !== 'undefined') return process.env?.[key];
  return undefined;
}

export function getSupabasePublicEnv() {
  const url = getEnv('VITE_SUPABASE_URL');
  const publishableKey = getEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ?? getEnv('VITE_SUPABASE_ANON_KEY');

  if (!url || !publishableKey) {
    const missing = [
      ...(!url ? ['VITE_SUPABASE_URL'] : []),
      ...(!publishableKey ? ['VITE_SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    throw new Error(
      `Missing Supabase environment variable(s): ${missing.join(', ')}. ` +
        `Create a root .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for local dev.`,
    );
  }

  return { url, publishableKey };
}

export function getSupabaseServiceEnv() {
  const url = getEnv('SUPABASE_URL') ?? getEnv('VITE_SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    const missing = [
      ...(!url ? ['SUPABASE_URL (or VITE_SUPABASE_URL for local)'] : []),
      ...(!serviceRoleKey ? ['SUPABASE_SERVICE_ROLE_KEY'] : []),
    ];
    throw new Error(
      `Missing Supabase server environment variable(s): ${missing.join(', ')}. ` +
        `For local dev, set SUPABASE_SERVICE_ROLE_KEY in the server runtime env (not Vite).`,
    );
  }

  return { url, serviceRoleKey };
}
