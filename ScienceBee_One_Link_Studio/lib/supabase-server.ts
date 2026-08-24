import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function supabaseServer(){const jar=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll(){return jar.getAll()},setAll(){}}})}
export function supabaseAdmin(){const {createClient}=require('@supabase/supabase-js');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}})}