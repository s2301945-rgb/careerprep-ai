export async function probeGroq({ apiKey, model = "openai/gpt-oss-20b", fetchImpl = fetch }) {
  const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: AI connection successful" }],
      max_completion_tokens: 256,
      reasoning_effort: "low",
      temperature: 0,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Groq returned ${response.status}`);
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Groq returned no usable text");
  return text.trim();
}
