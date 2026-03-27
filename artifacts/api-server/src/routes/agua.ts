import { Router, type Request, type Response } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase.js";
import { anthropic } from "../lib/anthropic.js";

const _aguaFotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const AGUA_BUCKET = "agua-leituras-fotos";

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
  // competencia = "YYYY-MM" or current month
  const hoje = new Date();
  const comp = competencia || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [ano, mes] = comp.split("-").map(Number);
  const dataInicio = `${comp}-01`;
  const dataFim   = new Date(ano, mes, 0).toISOString().slice(0, 10); // last day
  return { comp, dataInicio, dataFim };
}

// ─── GET /api/agua/dashboard ─────────────────────────────────────────────────
// KPIs: consumo total mês, variação %, custo total, perda %
router.get("/agua/dashboard", async (req: Request, res: Response) => {
  try {
    const condoId     = (req.query.condominio_id as string) || "";
    const competencia = (req.query.competencia  as string) || "";
    const { comp, dataInicio, dataFim } = await getCompetencia(condoId, competencia);

    // Leituras do mês atual (inclui individuais e gerais)
    const { data: leiturasMes } = await supabase
      .from("leituras_agua")
      .select("*, hidrometros(tipo, numero_serie, localizacao)")
      .eq("condominio_id", condoId)
      .gte("data_leitura", dataInicio)
      .lte("data_leitura", dataFim);

    // Mês anterior para variação
    const hoje = new Date();
    const mesAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const compAnt = `${mesAnt.getFullYear()}-${String(mesAnt.getMonth() + 1).padStart(2, "0")}`;
    const { comp: _ca, dataInicio: diaIniAnt, dataFim: diaFimAnt } = await getCompetencia(condoId, compAnt);

    const { data: leiturasAnt } = await supabase
      .from("leituras_agua")
      .select("consumo, hidrometros(tipo)")
      .eq("condominio_id", condoId)
      .gte("data_leitura", diaIniAnt)
      .lte("data_leitura", diaFimAnt);

    // Alertas ativos
    const { data: alertas } = await supabase
      .from("alertas_agua")
      .select("*")
      .eq("condominio_id", condoId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Rateio mais recente
    const { data: rateioRec } = await supabase
      .from("rateio_agua")
      .select("*")
      .eq("condominio_id", condoId)
      .order("competencia", { ascending: false })
      .limit(1);

    // Calcular KPIs
    const leituras = leiturasMes || [];
    const individuais = leituras.filter((l: any) => l.hidrometros?.tipo === "individual");
    const gerais      = leituras.filter((l: any) => l.hidrometros?.tipo === "geral");

    const consumoIndividual = individuais.reduce((s: number, l: any) => s + toNum(l.consumo), 0);
    const consumoGeral      = gerais.length ? gerais.reduce((s: number, l: any) => s + toNum(l.consumo), 0) : consumoIndividual;
    const perdaM3           = Math.max(0, consumoGeral - consumoIndividual);
    const perdaPct          = consumoGeral > 0 ? Math.round((perdaM3 / consumoGeral) * 100) : 0;

    const consumoAntInd = (leiturasAnt || [])
      .filter((l: any) => l.hidrometros?.tipo !== "geral")
      .reduce((s: number, l: any) => s + toNum(l.consumo), 0);

    const variacaoPct = consumoAntInd > 0
      ? Math.round(((consumoIndividual - consumoAntInd) / consumoAntInd) * 100)
      : 0;

    // Custo estimado (usa rateio recente ou tarifa padrão R$3,50/m³)
    const tarifaM3   = 3.50;
    const custoTotal = rateioRec?.[0]?.valor_total ?? Math.round(consumoGeral * tarifaM3 * 100) / 100;

    // Hidrômetros cadastrados
    const { data: hidrometros, count: totalHidros } = await supabase
      .from("hidrometros")
      .select("*", { count: "exact" })
      .eq("condominio_id", condoId)
      .eq("ativo", true);

    // Histórico últimos 6 meses
    const historico: { mes: string; consumo: number; custo: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const c = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const { data: lh } = await supabase
        .from("leituras_agua")
        .select("consumo")
        .eq("condominio_id", condoId)
        .gte("data_leitura", `${c}-01`)
        .lte("data_leitura", new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
      const cons = (lh || []).reduce((s: number, l: any) => s + toNum(l.consumo), 0);
      historico.push({
        mes: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }),
        consumo: Math.round(cons * 10) / 10,
        custo: Math.round(cons * tarifaM3 * 100) / 100,
      });
    }

    res.json({
      ok: true,
      competencia: comp,
      kpis: {
        consumoTotal:     Math.round(consumoIndividual * 10) / 10,
        consumoGeral:     Math.round(consumoGeral * 10) / 10,
        variacaoPct,
        custoTotal,
        perdaM3:          Math.round(perdaM3 * 10) / 10,
        perdaPct,
        totalHidrometros: totalHidros ?? 0,
        alertasAtivos:    (alertas || []).length,
      },
      historico,
      alertas: (alertas || []).slice(0, 5),
      hidrometros: hidrometros || [],
    });
  } catch (err) {
    console.error("[agua/dashboard]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── GET /api/agua/consumo ───────────────────────────────────────────────────
// Consumo por hidrômetro/unidade no período
router.get("/agua/consumo", async (req: Request, res: Response) => {
  try {
    const condoId     = (req.query.condominio_id as string) || "";
    const competencia = (req.query.competencia  as string) || "";
    const { dataInicio, dataFim } = await getCompetencia(condoId, competencia);

    const { data: leituras } = await supabase
      .from("leituras_agua")
      .select("*, hidrometros(tipo, numero_serie, localizacao)")
      .eq("condominio_id", condoId)
      .gte("data_leitura", dataInicio)
      .lte("data_leitura", dataFim)
      .order("data_leitura", { ascending: false });

    res.json({ ok: true, leituras: leituras || [] });
  } catch (err) {
    console.error("[agua/consumo]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── POST /api/agua/leitura ──────────────────────────────────────────────────
// Registra nova leitura de hidrômetro, calcula consumo e detecta anomalias
router.post("/agua/leitura", async (req: Request, res: Response) => {
  try {
    const {
      condominio_id,
      hidrometro_id,
      leitura_atual,
      data_leitura,
      origem = "manual",
    } = req.body as {
      condominio_id: string;
      hidrometro_id: string;
      leitura_atual: number;
      data_leitura: string;
      origem?: string;
    };

    if (!condominio_id || !hidrometro_id || leitura_atual == null) {
      return res.status(400).json({ ok: false, error: "condominio_id, hidrometro_id e leitura_atual são obrigatórios" });
    }

    // Busca leitura anterior
    const { data: ultima } = await supabase
      .from("leituras_agua")
      .select("leitura_atual, data_leitura")
      .eq("hidrometro_id", hidrometro_id)
      .order("data_leitura", { ascending: false })
      .limit(1);

    const leituraAnterior = ultima?.[0]?.leitura_atual ?? 0;
    const consumo = Math.max(0, toNum(leitura_atual) - toNum(leituraAnterior));

    // Insere nova leitura
    const { data: nova, error } = await supabase
      .from("leituras_agua")
      .insert({
        condominio_id,
        hidrometro_id,
        leitura_anterior: leituraAnterior,
        leitura_atual,
        consumo,
        data_leitura: data_leitura || new Date().toISOString().slice(0, 10),
        origem,
      })
      .select()
      .single();

    if (error) throw error;

    // Detecção de anomalias — busca histórico (últimas 3 leituras)
    const { data: historico } = await supabase
      .from("leituras_agua")
      .select("consumo")
      .eq("hidrometro_id", hidrometro_id)
      .order("data_leitura", { ascending: false })
      .limit(4);

    const consumosAnt = (historico || []).slice(1).map((l: any) => toNum(l.consumo)).filter(v => v > 0);
    const media = consumosAnt.length ? consumosAnt.reduce((s, v) => s + v, 0) / consumosAnt.length : null;

    let alerta = null;
    if (media && consumo > media * 1.5) {
      const tipoAlerta = consumo > media * 2.5 ? "vazamento" : "alto_consumo";
      const nivel = consumo > media * 2.5 ? "critico" : "alto";
      const desc = tipoAlerta === "vazamento"
        ? `Consumo ${Math.round((consumo / media - 1) * 100)}% acima da média histórica (${media.toFixed(1)} m³). Possível vazamento.`
        : `Consumo acima da média em ${Math.round((consumo / media - 1) * 100)}%.`;

      await supabase.from("alertas_agua").insert({
        condominio_id,
        tipo: tipoAlerta,
        descricao: desc,
        nivel,
      });
      alerta = { tipo: tipoAlerta, nivel, descricao: desc };
    }

    res.json({ ok: true, leitura: nova, consumo, leituraAnterior, alerta });
  } catch (err) {
    console.error("[agua/leitura]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── POST /api/agua/leitura/:id/foto ─────────────────────────────────────────
// Upload foto de comprovação de leitura → Supabase Storage
router.post("/agua/leitura/:id/foto", _aguaFotoUpload.single("foto"), async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ ok: false, error: "Arquivo obrigatório" });

  const ext      = req.file.mimetype.split("/")[1]?.split("+")[0] || "jpg";
  const filePath = `leituras/${id}.${ext}`;

  let { error: upErr } = await supabase.storage.from(AGUA_BUCKET).upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (upErr) {
    await supabase.storage.createBucket(AGUA_BUCKET, { public: true });
    const { error: upErr2 } = await supabase.storage.from(AGUA_BUCKET).upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr2) return res.status(500).json({ ok: false, error: upErr2.message });
  }

  const { data: urlData } = supabase.storage.from(AGUA_BUCKET).getPublicUrl(filePath);
  const fotoUrl = urlData.publicUrl;

  const { data, error } = await supabase
    .from("leituras_agua")
    .update({ foto_url: fotoUrl, foto_path: filePath })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, foto_url: fotoUrl, leitura: data });
});

// ─── POST /api/agua/rateio ───────────────────────────────────────────────────
// Calcula rateio automático (igualitario | consumo | hibrido)
router.post("/agua/rateio", async (req: Request, res: Response) => {
  try {
    const {
      condominio_id,
      competencia,
      valor_total,
      tipo_rateio = "hibrido",
      consumo_total,
    } = req.body as {
      condominio_id: string;
      competencia: string;
      valor_total: number;
      tipo_rateio?: "igualitario" | "consumo" | "hibrido";
      consumo_total?: number;
    };

    if (!condominio_id || !valor_total) {
      return res.status(400).json({ ok: false, error: "condominio_id e valor_total são obrigatórios" });
    }

    const { dataInicio, dataFim } = await getCompetencia(condominio_id, competencia);

    // Busca leituras individuais do período
    const { data: leituras } = await supabase
      .from("leituras_agua")
      .select("unidade_id, consumo, hidrometros(tipo)")
      .eq("condominio_id", condominio_id)
      .gte("data_leitura", dataInicio)
      .lte("data_leitura", dataFim);

    const individuais = (leituras || []).filter((l: any) => l.hidrometros?.tipo === "individual");
    const consumoTotalReal = consumo_total ?? individuais.reduce((s: number, l: any) => s + toNum(l.consumo), 0);
    const nUnidades = individuais.length || 1;
    const vlrUni = toNum(valor_total);

    // Agrupa consumo por unidade
    const consumoPorUnidade: Record<string, number> = {};
    individuais.forEach((l: any) => {
      const uid = l.unidade_id || `u_${Math.random()}`;
      consumoPorUnidade[uid] = (consumoPorUnidade[uid] || 0) + toNum(l.consumo);
    });
    const uniIds = Object.keys(consumoPorUnidade);
    const n = uniIds.length || nUnidades;

    // Calcula valor por unidade conforme tipo
    const unidades = uniIds.map(uid => {
      const cons = consumoPorUnidade[uid];
      let valor = 0;
      if (tipo_rateio === "igualitario") {
        valor = vlrUni / n;
      } else if (tipo_rateio === "consumo") {
        valor = consumoTotalReal > 0 ? (cons / consumoTotalReal) * vlrUni : vlrUni / n;
      } else {
        // híbrido: 70% consumo + 30% igualitário
        const parcConsumO = consumoTotalReal > 0 ? (cons / consumoTotalReal) * (vlrUni * 0.7) : 0;
        const parcEqual   = (vlrUni * 0.3) / n;
        valor = parcConsumO + parcEqual;
      }
      return { unidade_id: uid, consumo: cons, valor: Math.round(valor * 100) / 100 };
    });

    // Salva rateio
    const { data: rateio, error: errRateio } = await supabase
      .from("rateio_agua")
      .insert({
        condominio_id,
        competencia: `${competencia || new Date().toISOString().slice(0, 7)}-01`,
        consumo_total: consumoTotalReal,
        valor_total: vlrUni,
        tipo_rateio,
      })
      .select()
      .single();

    if (!errRateio && rateio && unidades.length > 0) {
      await supabase.from("rateio_unidades").insert(
        unidades.map(u => ({ rateio_id: rateio.id, ...u }))
      );
    }

    res.json({
      ok: true,
      tipo_rateio,
      consumo_total: consumoTotalReal,
      valor_total: vlrUni,
      n_unidades: n,
      unidades,
      rateio_id: rateio?.id,
    });
  } catch (err) {
    console.error("[agua/rateio]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── GET /api/agua/alertas ───────────────────────────────────────────────────
router.get("/agua/alertas", async (req: Request, res: Response) => {
  try {
    const condoId = (req.query.condominio_id as string) || "";
    const { data } = await supabase
      .from("alertas_agua")
      .select("*")
      .eq("condominio_id", condoId)
      .order("created_at", { ascending: false })
      .limit(50);
    res.json({ ok: true, alertas: data || [] });
  } catch (err) {
    console.error("[agua/alertas]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── GET /api/agua/hidrometros ───────────────────────────────────────────────
router.get("/agua/hidrometros", async (req: Request, res: Response) => {
  try {
    const condoId = (req.query.condominio_id as string) || "";
    const { data } = await supabase
      .from("hidrometros")
      .select("*")
      .eq("condominio_id", condoId)
      .eq("ativo", true)
      .order("created_at", { ascending: false });
    res.json({ ok: true, hidrometros: data || [] });
  } catch (err) {
    console.error("[agua/hidrometros]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── POST /api/agua/hidrometros ──────────────────────────────────────────────
router.post("/agua/hidrometros", async (req: Request, res: Response) => {
  try {
    const { condominio_id, unidade_id, tipo = "individual", numero_serie, localizacao } = req.body;
    if (!condominio_id || !numero_serie) {
      return res.status(400).json({ ok: false, error: "condominio_id e numero_serie são obrigatórios" });
    }
    const { data, error } = await supabase
      .from("hidrometros")
      .insert({ condominio_id, unidade_id, tipo, numero_serie, localizacao, ativo: true })
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, hidrometro: data });
  } catch (err) {
    console.error("[agua/hidrometros POST]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ─── POST /api/agua/analise-di ───────────────────────────────────────────────
// Di analisa consumo de água com IA (Claude)
router.post("/agua/analise-di", async (req: Request, res: Response) => {
  try {
    const { condominio_id, nome_condominio = "Condomínio" } = req.body as {
      condominio_id: string;
      nome_condominio?: string;
    };

    // Busca dados para contexto
    const hoje = new Date();
    const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const { dataInicio, dataFim } = await getCompetencia(condominio_id, comp);

    const [{ data: leiturasMes }, { data: alertas }, { data: hidrometros }] = await Promise.all([
      supabase.from("leituras_agua").select("consumo, data_leitura, hidrometros(tipo, numero_serie)").eq("condominio_id", condominio_id).gte("data_leitura", dataInicio).lte("data_leitura", dataFim),
      supabase.from("alertas_agua").select("tipo, nivel, descricao, created_at").eq("condominio_id", condominio_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("hidrometros").select("tipo, numero_serie, localizacao").eq("condominio_id", condominio_id).eq("ativo", true),
    ]);

    const consumoTotal = (leiturasMes || []).reduce((s: number, l: any) => s + toNum(l.consumo), 0);
    const alertasCriticos = (alertas || []).filter((a: any) => a.nivel === "critico").length;
    const alertasAltos = (alertas || []).filter((a: any) => a.nivel === "alto").length;

    const contexto = `
Condomínio: ${nome_condominio}
Competência: ${comp}

HIDRÔMETROS ATIVOS: ${(hidrometros || []).length}
- Individuais: ${(hidrometros || []).filter((h: any) => h.tipo === "individual").length}
- Gerais: ${(hidrometros || []).filter((h: any) => h.tipo === "geral").length}

LEITURAS DO MÊS:
- Total de leituras: ${(leiturasMes || []).length}
- Consumo total individual: ${consumoTotal.toFixed(1)} m³

ALERTAS ATIVOS: ${(alertas || []).length}
- Críticos: ${alertasCriticos}
- Altos: ${alertasAltos}
${(alertas || []).slice(0, 5).map((a: any) => `• [${a.nivel}] ${a.tipo}: ${a.descricao}`).join("\n")}
    `.trim();

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      system: `Você é Di, a Síndica Virtual do ImobCore, especialista em gestão de água de condomínios.
Analise o consumo de água do condomínio e identifique:
- Vazamentos e desperdícios
- Anomalias de consumo
- Oportunidades de economia

Responda em JSON com este formato exato:
{
  "resumo": "texto com resumo executivo em 2-3 frases",
  "score": 85,
  "alertas": [
    { "tipo": "vazamento|alto_consumo|economia", "nivel": "critico|alto|medio|baixo", "titulo": "...", "descricao": "..." }
  ],
  "recomendacoes": [
    { "titulo": "...", "descricao": "...", "economia_estimada": "..." }
  ],
  "previsao_proximo_mes": "texto curto"
}`,
      messages: [
        {
          role: "user",
          content: `Analise o consumo de água com os seguintes dados:\n\n${contexto}`,
        },
      ],
    });

    const raw = completion.content[0].type === "text" ? completion.content[0].text : "";
    let analise: Record<string, unknown>;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      analise = jsonMatch ? JSON.parse(jsonMatch[0]) : { resumo: raw };
    } catch {
      analise = { resumo: raw };
    }

    res.json({ ok: true, analise, contexto_usado: { consumoTotal, alertas: alertas?.length ?? 0 } });
  } catch (err) {
    console.error("[agua/analise-di]", err);
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

export default router;
