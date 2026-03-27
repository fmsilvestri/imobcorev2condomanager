import { Router, type Request, type Response } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase.js";
import { anthropic } from "../lib/anthropic.js";

const _gasFotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const GAS_BUCKET = "gas-leituras-fotos";

const router = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────
function toNum(v: unknown): number { return Number(v) || 0; }
function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return (e.message as string) || (e.details as string) || JSON.stringify(err);
  }
  return String(err);
}

async function getCompetencia(condoId: string, competencia?: string) {
  const hoje = new Date();
  const mes   = competencia || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  return {
    dataInicio: `${mes}-01`,
    dataFim:    `${mes}-31`,
    mes,
  };
}

// ─── GET /api/gas/dashboard ──────────────────────────────────────────────────
router.get("/gas/dashboard", async (req: Request, res: Response) => {
  try {
    const condoId     = (req.query.condominio_id as string) || "";
    const competencia = (req.query.competencia  as string) || "";
    const { dataInicio, dataFim } = await getCompetencia(condoId, competencia);

    // Build 6-month history range
    const hoje = new Date();
    const histStart = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)
      .toISOString().slice(0, 10);

    const [
      { data: leiturasMes },
      { data: leiturasHist },
      { data: alertas },
      { data: medidores, count: totalMedidores },
    ] = await Promise.all([
      supabase.from("gas_leituras").select("consumo, medidor_id, gas_medidores(tipo)").eq("condominio_id", condoId).gte("data_leitura", dataInicio).lte("data_leitura", dataFim),
      supabase.from("gas_leituras").select("consumo, data_leitura, gas_medidores(tipo)").eq("condominio_id", condoId).gte("data_leitura", histStart),
      supabase.from("gas_alertas").select("*").eq("condominio_id", condoId).eq("resolvido", false).order("created_at", { ascending: false }).limit(5),
      supabase.from("gas_medidores").select("id, numero_serie, tipo, localizacao", { count: "exact" }).eq("condominio_id", condoId).eq("ativo", true),
    ]);

    const individuais = (leiturasMes || []).filter((l: any) => l.gas_medidores?.tipo === "individual");
    const gerais      = (leiturasMes || []).filter((l: any) => l.gas_medidores?.tipo === "geral");

    const consumoIndividual = individuais.reduce((s: number, l: any) => s + toNum(l.consumo), 0);
    const consumoGeral      = gerais.reduce((s: number, l: any) => s + toNum(l.consumo), 0);
    const consumoTotal      = consumoGeral || consumoIndividual;
    const perdaM3           = Math.max(0, consumoGeral - consumoIndividual);
    const perdaPct          = consumoGeral > 0 ? Math.round((perdaM3 / consumoGeral) * 100) : 0;

    // Build 6-month historico
    const meses: { mes: string; consumo: number; custo: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const fim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-31`;
      const mes = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      const leitsMes = (leiturasHist || []).filter((l: any) => l.data_leitura >= ini && l.data_leitura <= fim);
      const consumoMes = leitsMes.reduce((s: number, l: any) => s + toNum(l.consumo), 0);
      meses.push({ mes, consumo: Math.round(consumoMes * 10) / 10, custo: Math.round(consumoMes * 5.5) });
    }

    // Simple previsão próximo mês (média dos últimos 3)
    const ultimos3 = meses.slice(-3).map(m => m.consumo).filter(v => v > 0);
    const previsao = ultimos3.length ? Math.round(ultimos3.reduce((s, v) => s + v, 0) / ultimos3.length * 10) / 10 : 0;

    res.json({
      ok: true,
      competencia: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
      kpis: {
        consumoTotal,
        consumoGeral,
        variacaoPct: 0,
        custoTotal:  Math.round(consumoTotal * 5.5 * 100) / 100,
        perdaM3:     Math.round(perdaM3 * 10) / 10,
        perdaPct,
        totalMedidores: totalMedidores || 0,
        alertasAtivos:  (alertas || []).length,
        previsaoM3:     previsao,
      },
      historico: meses,
      alertas:   alertas || [],
      medidores: medidores || [],
    });
  } catch (err) {
    console.error("[gas/dashboard]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── GET /api/gas/consumo ────────────────────────────────────────────────────
router.get("/gas/consumo", async (req: Request, res: Response) => {
  try {
    const condoId     = (req.query.condominio_id as string) || "";
    const competencia = (req.query.competencia  as string) || "";
    const { dataInicio, dataFim } = await getCompetencia(condoId, competencia);

    const { data: leituras } = await supabase
      .from("gas_leituras")
      .select("*, gas_medidores(tipo, numero_serie, localizacao)")
      .eq("condominio_id", condoId)
      .gte("data_leitura", dataInicio)
      .lte("data_leitura", dataFim)
      .order("data_leitura", { ascending: false });

    res.json({ ok: true, leituras: leituras || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── GET /api/gas/medidores ──────────────────────────────────────────────────
router.get("/gas/medidores", async (req: Request, res: Response) => {
  try {
    const condoId = (req.query.condominio_id as string) || "";
    const { data, error } = await supabase
      .from("gas_medidores")
      .select("*")
      .eq("condominio_id", condoId)
      .eq("ativo", true)
      .order("created_at", { ascending: false });

    if (error) console.error("[gas/medidores]", error);
    res.json({ ok: true, medidores: data || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── POST /api/gas/medidores ─────────────────────────────────────────────────
router.post("/gas/medidores", async (req: Request, res: Response) => {
  try {
    const { condominio_id, numero_serie, tipo = "individual", localizacao, unidade_id } = req.body as {
      condominio_id: string; numero_serie: string; tipo?: string; localizacao?: string; unidade_id?: string;
    };
    if (!condominio_id || !numero_serie) {
      return res.status(400).json({ ok: false, error: "condominio_id e numero_serie são obrigatórios" });
    }
    const { data, error } = await supabase
      .from("gas_medidores")
      .insert({ condominio_id, numero_serie, tipo, localizacao, unidade_id, ativo: true })
      .select()
      .single();
    if (error) { console.error("[gas/medidores POST]", error); throw error; }
    res.json({ ok: true, medidor: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── POST /api/gas/leitura ───────────────────────────────────────────────────
router.post("/gas/leitura", async (req: Request, res: Response) => {
  try {
    const {
      condominio_id, medidor_id, leitura_atual, data_leitura, origem = "manual",
    } = req.body as {
      condominio_id: string; medidor_id: string; leitura_atual: number; data_leitura: string; origem?: string;
    };

    if (!condominio_id || !medidor_id || leitura_atual == null) {
      return res.status(400).json({ ok: false, error: "condominio_id, medidor_id e leitura_atual são obrigatórios" });
    }

    // Busca leitura anterior
    const { data: ultima } = await supabase
      .from("gas_leituras")
      .select("leitura_atual, data_leitura")
      .eq("medidor_id", medidor_id)
      .order("data_leitura", { ascending: false })
      .limit(1);

    const leituraAnterior = ultima?.[0]?.leitura_atual ?? 0;
    const consumo = Math.max(0, toNum(leitura_atual) - toNum(leituraAnterior));

    const { data: nova, error } = await supabase
      .from("gas_leituras")
      .insert({ condominio_id, medidor_id, leitura_anterior: leituraAnterior, leitura_atual, consumo, data_leitura: data_leitura || new Date().toISOString().slice(0, 10), origem })
      .select()
      .single();

    if (error) throw error;

    // Detecção de anomalias — média das últimas 3 leituras
    let alerta: { tipo: string; nivel: string; descricao: string } | null = null;
    const { data: historico } = await supabase
      .from("gas_leituras")
      .select("consumo")
      .eq("medidor_id", medidor_id)
      .order("data_leitura", { ascending: false })
      .limit(4);

    const consumosAnt = (historico || []).slice(1).map((l: any) => toNum(l.consumo)).filter(v => v > 0);
    const media = consumosAnt.length ? consumosAnt.reduce((s, v) => s + v, 0) / consumosAnt.length : null;

    if (media && consumo > media * 1.6) {
      const tipoAlerta = consumo > media * 2.5 ? "vazamento" : "alto_consumo";
      const nivel      = consumo > media * 2.5 ? "critico" : "alto";
      const desc       = tipoAlerta === "vazamento"
        ? `⚠️ Consumo ${Math.round((consumo / media - 1) * 100)}% acima da média — possível vazamento de gás!`
        : `Consumo de gás acima da média em ${Math.round((consumo / media - 1) * 100)}%.`;

      await supabase.from("gas_alertas").insert({ condominio_id, medidor_id, tipo: tipoAlerta, descricao: desc, nivel });
      alerta = { tipo: tipoAlerta, nivel, descricao: desc };
    }

    res.json({ ok: true, leitura: nova, consumo, leituraAnterior, alerta });
  } catch (err) {
    console.error("[gas/leitura]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── POST /api/gas/leitura/:id/foto ──────────────────────────────────────────
router.post("/gas/leitura/:id/foto", _gasFotoUpload.single("foto"), async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ ok: false, error: "Arquivo obrigatório" });

  const ext      = req.file.mimetype.split("/")[1]?.split("+")[0] || "jpg";
  const filePath = `leituras/${id}.${ext}`;

  let { error: upErr } = await supabase.storage.from(GAS_BUCKET).upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (upErr) {
    await supabase.storage.createBucket(GAS_BUCKET, { public: true });
    const { error: upErr2 } = await supabase.storage.from(GAS_BUCKET).upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr2) return res.status(500).json({ ok: false, error: upErr2.message });
  }

  const { data: urlData } = supabase.storage.from(GAS_BUCKET).getPublicUrl(filePath);
  const fotoUrl = urlData.publicUrl;

  const { data, error } = await supabase
    .from("gas_leituras")
    .update({ foto_url: fotoUrl, foto_path: filePath })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, foto_url: fotoUrl, leitura: data });
});

// ─── POST /api/gas/rateio ────────────────────────────────────────────────────
router.post("/gas/rateio", async (req: Request, res: Response) => {
  try {
    const { condominio_id, competencia, valor_total, tipo_rateio = "hibrido" } = req.body as {
      condominio_id: string; competencia: string; valor_total: number; tipo_rateio?: "igualitario" | "consumo" | "hibrido";
    };

    if (!condominio_id || !valor_total) {
      return res.status(400).json({ ok: false, error: "condominio_id e valor_total são obrigatórios" });
    }

    const { dataInicio, dataFim } = await getCompetencia(condominio_id, competencia);

    const { data: leituras } = await supabase
      .from("gas_leituras")
      .select("unidade_id, consumo, gas_medidores(tipo)")
      .eq("condominio_id", condominio_id)
      .gte("data_leitura", dataInicio)
      .lte("data_leitura", dataFim);

    const individuais = (leituras || []).filter((l: any) => l.gas_medidores?.tipo !== "geral");
    const consumoTotal = individuais.reduce((s: number, l: any) => s + toNum(l.consumo), 0);
    const nUnidades = individuais.length || 1;

    const unidades = individuais.map((l: any) => {
      const consumoUni = toNum(l.consumo);
      let valor = 0;
      if (tipo_rateio === "igualitario") {
        valor = toNum(valor_total) / nUnidades;
      } else if (tipo_rateio === "consumo") {
        valor = consumoTotal > 0 ? (consumoUni / consumoTotal) * toNum(valor_total) : toNum(valor_total) / nUnidades;
      } else {
        const igualitario = toNum(valor_total) * 0.3 / nUnidades;
        const porConsumo  = consumoTotal > 0 ? (consumoUni / consumoTotal) * toNum(valor_total) * 0.7 : 0;
        valor = igualitario + porConsumo;
      }
      return { unidade_id: l.unidade_id || `unidade-${Math.random().toString(36).slice(2,6)}`, consumo: consumoUni, valor: Math.round(valor * 100) / 100 };
    });

    res.json({ ok: true, tipo_rateio, consumo_total: consumoTotal, valor_total: toNum(valor_total), n_unidades: nUnidades, unidades });
  } catch (err) {
    console.error("[gas/rateio]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── GET /api/gas/alertas ────────────────────────────────────────────────────
router.get("/gas/alertas", async (req: Request, res: Response) => {
  try {
    const condoId = (req.query.condominio_id as string) || "";
    const { data, error } = await supabase
      .from("gas_alertas")
      .select("*")
      .eq("condominio_id", condoId)
      .eq("resolvido", false)
      .order("created_at", { ascending: false });

    if (error) console.error("[gas/alertas]", error);
    res.json({ ok: true, alertas: data || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── POST /api/gas/analise-di ────────────────────────────────────────────────
router.post("/gas/analise-di", async (req: Request, res: Response) => {
  try {
    const { condominio_id, nome_condominio = "Condomínio" } = req.body as { condominio_id: string; nome_condominio?: string };
    if (!condominio_id) return res.status(400).json({ ok: false, error: "condominio_id obrigatório" });

    const hoje = new Date();
    const histStart = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1).toISOString().slice(0, 10);

    const [{ data: leiturasMes }, { data: alertas }, { data: medidores }] = await Promise.all([
      supabase.from("gas_leituras").select("consumo, data_leitura, gas_medidores(tipo, numero_serie)").eq("condominio_id", condominio_id).gte("data_leitura", histStart),
      supabase.from("gas_alertas").select("*").eq("condominio_id", condominio_id).eq("resolvido", false),
      supabase.from("gas_medidores").select("tipo, numero_serie, localizacao").eq("condominio_id", condominio_id).eq("ativo", true),
    ]);

    const consumoTotal = (leiturasMes || []).reduce((s: number, l: any) => s + toNum(l.consumo), 0);
    const nAlertasAtivos = (alertas || []).length;
    const nVazamentos = (alertas || []).filter((a: any) => a.tipo === "vazamento").length;

    const prompt = `Você é Di, síndica virtual inteligente do ${nome_condominio}. Analise o consumo de gás dos últimos 6 meses e gere um relatório JSON.

DADOS:
- Consumo total 6 meses: ${consumoTotal.toFixed(1)} m³
- Medidores ativos: ${(medidores || []).length} (individuais: ${(medidores || []).filter((m: any) => m.tipo === "individual").length}, gerais: ${(medidores || []).filter((m: any) => m.tipo === "geral").length})
- Alertas ativos: ${nAlertasAtivos} (vazamentos: ${nVazamentos})
- Custo estimado (R$ 5,50/m³): R$ ${(consumoTotal * 5.5).toFixed(2)}

Retorne APENAS JSON com exatamente esta estrutura:
{
  "resumo": "Texto executivo 2-3 frases",
  "score": 0-100,
  "alertas": [{"tipo":"vazamento|alto_consumo|anomalia|risco","nivel":"baixo|medio|alto|critico","titulo":"...","descricao":"..."}],
  "recomendacoes": [{"titulo":"...","descricao":"...","economia_estimada":"R$ X/mês"}],
  "previsao_proximo_mes": "X m³ (R$ Y)"
}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const txt = (msg.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ ok: false, error: "IA não retornou JSON" });

    const analise = JSON.parse(jsonMatch[0]);
    res.json({ ok: true, analise });
  } catch (err) {
    console.error("[gas/analise-di]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

export default router;
