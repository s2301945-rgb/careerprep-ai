import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ application:"CareerPrep AI", backend:"connected", database:"not_configured", message:"Add the Supabase environment variables to complete this check." });
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/app_config?select=project_name&limit=1`, { headers:{ apikey:supabaseKey, Authorization:`Bearer ${supabaseKey}` }, cache:"no-store" });
    if (!response.ok) throw new Error();
    const records = (await response.json()) as Array<{ project_name:string }>;
    return NextResponse.json({ application:records[0]?.project_name ?? "CareerPrep AI", backend:"connected", database:"connected", message:"Project data was read successfully from Supabase." });
  } catch {
    return NextResponse.json({ application:"CareerPrep AI", backend:"connected", database:"error", message:"Supabase is configured, but the database read failed." }, { status:503 });
  }
}
