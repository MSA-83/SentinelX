// supabase/functions/sentinel-ai/index.ts
// OnSpace AI edge function — intelligence analyst assistant + Groq quick-brief + deep analysis route
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const path = pathParts[pathParts.length - 1];

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

      const t0 = Date.now();
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
        signal: AbortSignal.timeout(15000),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error("Groq quick-brief error:", groqRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Groq: ${groqRes.status} ${errText}` }),
          { status: groqRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const groqData = await groqRes.json();
      const content = groqData?.choices?.[0]?.message?.content ?? "No brief generated.";
      const latencyMs = Date.now() - t0;

      console.log("Groq quick-brief generated. Tokens:", groqData?.usage?.total_tokens, "Latency:", latencyMs + "ms");

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

    // ─── Groq Deep Analysis route ──────────────────────────────────────────────
    if (path === "deep-analysis") {
      const groqKey = Deno.env.get("GROQ_API_KEY");
      if (!groqKey) {
        return new Response(
          JSON.stringify({ error: "GROQ_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await req.json();
      const { threatIndex, globalLevel, criticalCount, highCount, anomalyCount, crisisZones, domainSummary, topEntities } = body;

      const systemPrompt = `You are SENTINEL-X AI — a NATO-grade strategic intelligence analyst with expertise in multi-domain threat assessment. You are preparing a classified analytical report for senior command. Your analysis must be:
- Structured, professional, and precise
- Grounded in the provided data
- Written in NATO intelligence reporting style
- Use military terminology (BLUF, COA, PIR, ISR, etc.)

Output EXACTLY the following JSON structure with no markdown fencing:
{
  "bluf": "<1-2 sentence Bottom Line Up Front>",
  "threatNarrative": "<3-4 sentence comprehensive threat situation assessment>",
  "domainAnalysis": [
    { "domain": "<domain>", "assessment": "<1-2 sentence specific analysis>", "keyIndicators": ["<indicator1>", "<indicator2>"] }
  ],
  "crossDomainCorrelations": ["<correlation1>", "<correlation2>", "<correlation3>"],
  "anomalyAssessment": "<2-3 sentence analysis of flagged anomalies and their significance>",
  "collectionPriorities": ["<PIR1>", "<PIR2>", "<PIR3>"],
  "coa": [
    { "action": "<action title>", "priority": "IMMEDIATE|URGENT|ROUTINE", "rationale": "<1 sentence>" }
  ],
  "confidence": "<HIGH|MEDIUM|LOW>",
  "classification": "TOP SECRET // SENTINEL // NOFORN"
}`;

      const userContent = `CURRENT OPERATIONAL PICTURE:
Threat Index: ${threatIndex}/100 | Global Level: ${globalLevel}
Critical Entities: ${criticalCount} | High Priority: ${highCount} | Anomalies: ${anomalyCount}
Active Crisis Zones: ${crisisZones?.join(", ") || "None"}

DOMAIN THREAT SUMMARY:
${domainSummary ?? "Not provided"}

TOP ENTITIES OF INTEREST:
${topEntities ?? "Not provided"}

Generate a comprehensive strategic threat assessment.`;

      const t0 = Date.now();
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 1200,
          temperature: 0.35,
          stream: false,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error("Groq deep-analysis error:", groqRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Groq: ${groqRes.status} ${errText}` }),
          { status: groqRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const groqData = await groqRes.json();
      const rawContent = groqData?.choices?.[0]?.message?.content ?? "{}";
      const latencyMs = Date.now() - t0;

      let analysis: Record<string, unknown> = {};
      try {
        analysis = JSON.parse(rawContent);
      } catch {
        // Attempt to extract JSON from the raw content
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { analysis = JSON.parse(jsonMatch[0]); } catch { /**/ }
        }
        analysis = analysis ?? { bluf: rawContent, threatNarrative: "", domainAnalysis: [], crossDomainCorrelations: [], anomalyAssessment: "", collectionPriorities: [], coa: [], confidence: "LOW" };
      }

      console.log("Groq deep-analysis complete. Tokens:", groqData?.usage?.total_tokens, "Latency:", latencyMs + "ms");

      return new Response(
        JSON.stringify({
          analysis,
          model: "llama-3.3-70b-versatile",
          provider: "groq",
          latencyMs,
          usage: groqData?.usage,
          generatedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Default: OnSpace AI chat route ───────────────────────────────────────
    const { messages, model = "gpt-4o-mini" } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: messages array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      signal: AbortSignal.timeout(30000),
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
