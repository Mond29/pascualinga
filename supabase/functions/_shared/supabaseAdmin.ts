import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabaseAdmin = () => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) throw new Error('Missing Supabase environment variables.')
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}
