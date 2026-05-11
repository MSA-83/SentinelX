// supabase/functions/sentinel-ai/index.ts
// OnSpace AI edge function — intelligence analyst assistant + Groq quick-brief route
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    // ─── Groq Quick-Brief route ────────────────────────────────────────────────
    if (path === "quick-brief") {
      const { context } = await req.json();
      const groqKey = Deno.env.get("GROQ_API_KEY");

      if (!groqKey) {
        return new Response(
          JSON.stringify({ error: "GROQ_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a senior military intelligence officer. Generate an ultra-concise 3-sentence executive threat brief. " +
                "Format: 1) Global threat posture statement. 2) Top domain/entity of concern. 3) Recommended immediate action. " +
                "Use NATO reporting format. Be specific with numbers. Classify as SECRET//NOFORN.",
            },
            {
              role: "user",
              content: `Current operational picture: ${context}`,
            },
          ],
          max_tokens: 250,
          temperature: 0.3,
          stream: false,
        }),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error("Groq error:", groqRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Groq: ${groqRes.status} ${errText}` }),
          { status: groqRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const groqData = await groqRes.json();
      const content = groqData?.choices?.[0]?.message?.content ?? "No brief generated.";
      const latencyMs = groqData?.usage?.total_time ? Math.round(groqData.usage.total_time * 1000) : null;

      console.log("Groq quick-brief generated. Tokens:", groqData?.usage?.total_tokens);

      return new Response(
        JSON.stringify({
          content,
          model: "llama-3.3-70b-versatile",
          provider: "groq",
          latencyMs,
          usage: groqData?.usage,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Default: OnSpace AI route ─────────────────────────────────────────────
    const { messages, model = "gpt-4o-mini" } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: messages array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // OnSpace AI endpoint
    const onspaceAiBase = Deno.env.get("ONSPACE_AI_BASE_URL") ?? "https://ai.onspace.ai";
    const response = await fetch(`${onspaceAiBase}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("ONSPACE_AI_API_KEY") ?? ""}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OnSpace AI error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: `OnSpace AI: ${response.status} ${errText}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "No response generated.";

    console.log("AI response generated, tokens:", data?.usage?.total_tokens);

    return new Response(
      JSON.stringify({ content, model, usage: data?.usage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("sentinel-ai error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
