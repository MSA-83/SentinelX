// supabase/functions/sentinel-ai/index.ts
// OnSpace AI edge function — intelligence analyst assistant
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
