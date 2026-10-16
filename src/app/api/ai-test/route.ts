import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  if (!apiKey) return NextResponse.json({ ai:"not_configured", message:"Add GEMINI_API_KEY to complete the AI connectivity check." });
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ contents:[{parts:[{text:"Reply with exactly: AI connection successful"}]}], generationConfig:{maxOutputTokens:20,temperature:0} }), cache:"no-store" });
    if (!response.ok) throw new Error();
    return NextResponse.json({ ai:"connected", message:"Gemini responded successfully from the backend." });
  } catch {
    return NextResponse.json({ ai:"error", message:"Gemini is configured, but the request failed." }, { status:503 });
  }
}
