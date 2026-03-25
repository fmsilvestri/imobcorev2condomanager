import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { carregarContextoDi } from "../di-engine/context.js";

const supabase = createClient(
  process.env["SUPABASE_URL"] ?? "",
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
);
const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

const r = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

async function criarOSAutomatica(condominioId: string, alerta: Record<string, unknown>) {
  const titulo = typeof alerta.titulo === "string" ? alerta.titulo : "Alerta crítico automático";
  const descricao = typeof alerta.descricao === "string" ? alerta.descricao : "";

  const osData = {
    condominio_id: condominioId,
    titulo: `[AUTO] ${titulo}`,
    descricao: `OS criada automaticamente por alerta crítico.\n\nAlerta: ${titulo}\n${descricao}`,
    status: "aberta" as const,
    prioridade: "urgente",
    categoria: "manutencao",
    origem: "di_automatico",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("ordens_servico").insert(osData).select().single();
  if (error) {
    console.error("[MISP] Erro ao criar OS automática:", error.message);
    return null;
  }
  console.log(`[MISP] OS automática criada: ${data.id} — ${titulo}`);
  return data;
}

async function analisarAlertaComDi(alerta: Record<string, unknown>): Promise<string> {
  const condId = typeof alerta.condominio_id === "string" ? alerta.condominio_id : "";
  const titulo = typeof alerta.titulo === "string" ? alerta.titulo : "alerta";
  const descricao = typeof alerta.descricao === "string" ? alerta.descricao : "";
  const nivel = typeof alerta.nivel === "string" ? alerta.nivel : "medio";

  try {
    const ctx = await carregarContextoDi(condId, {}, "gestor", "Sistema");

    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      system: ctx.systemPrompt,
      messages: [{
        role: "user",
        content: `Alerta externo recebido — avalie e responda de forma concisa (máx. 3 linhas):\n\nTítulo: ${titulo}\nNível: ${nivel}\nDescrição: ${descricao}`
      }]
    });

    const block = resp.content[0];
    return block.type === "text" ? block.text : "";
  } catch (err) {
    console.error("[MISP] Di análise falhou:", err);
    return "";
  }
}

// ─── POST /api/misp/webhook ─────────────────────────────────────────────────

r.post("/webhook", async (req: Request, res: Response) => {
  const { alertas } = req.body as { alertas?: Record<string, unknown>[] };

  if (!Array.isArray(alertas) || alertas.length === 0) {
    return res.status(400).json({ error: "Campo 'alertas' (array) é obrigatório" });
  }

  const resultados: Array<{ id?: string; titulo?: string; os_criada?: boolean; di_resposta?: string; error?: string }> = [];

  for (const alerta of alertas) {
    try {
      const tipoEvento = typeof alerta.tipo_evento === "string" ? alerta.tipo_evento : "";
      const condId = typeof alerta.condominio_id === "string" ? alerta.condominio_id : null;

      // 1. Persiste alerta na tabela
      const insertPayload = {
        ...alerta,
        ativo: true,
        created_at: new Date().toISOString(),
      };
      const { data: insertedAlerta, error: insertErr } = await supabase
        .from("alertas_publicos")
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr) {
        console.error("[MISP] Erro ao inserir alerta:", insertErr.message);
        resultados.push({ titulo: String(alerta.titulo || ""), error: insertErr.message });
        continue;
      }

      const resultado: typeof resultados[0] = {
        id: insertedAlerta?.id,
        titulo: String(alerta.titulo || ""),
        os_criada: false,
      };

      // 2. 🤖 Di analisa o alerta em background (não bloqueia resposta)
      console.log(`[MISP] Di analisando alerta: ${alerta.titulo}`);
      analisarAlertaComDi(alerta).then(async (diResposta) => {
        if (diResposta && insertedAlerta?.id) {
          await supabase
            .from("alertas_publicos")
            .update({ di_analise: diResposta, di_analisado_em: new Date().toISOString() })
            .eq("id", insertedAlerta.id);
        }
      }).catch(console.error);

      // 3. 🚨 Evento crítico → cria OS automática
      if (tipoEvento === "critico_imediato" && condId) {
        const os = await criarOSAutomatica(condId, alerta);
        resultado.os_criada = !!os;
      }

      resultados.push(resultado);
    } catch (err) {
      console.error("[MISP] Erro no processamento do alerta:", err);
      resultados.push({ titulo: String(alerta.titulo || ""), error: String(err) });
    }
  }

  return res.json({ ok: true, processados: resultados.length, resultados });
});

// ─── GET /api/misp/alertas ──────────────────────────────────────────────────

r.get("/alertas", async (req: Request, res: Response) => {
  const { nivel, tipo, condominio_id, limit = "50" } = req.query as Record<string, string>;

  let q = supabase
    .from("alertas_publicos")
    .select("*")
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(Number(limit) || 50);

  if (nivel)          q = q.eq("nivel", nivel);
  if (tipo)           q = q.eq("tipo", tipo);
  if (condominio_id)  q = q.eq("condominio_id", condominio_id);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const alto   = (data || []).filter(a => a.nivel === "alto").length;
  const medio  = (data || []).filter(a => a.nivel === "medio").length;
  const baixo  = (data || []).filter(a => a.nivel === "baixo").length;

  return res.json({
    alertas: data || [],
    resumo: { critico: alto, risco: medio, oportunidade: baixo, total: (data || []).length }
  });
});

export default r;
