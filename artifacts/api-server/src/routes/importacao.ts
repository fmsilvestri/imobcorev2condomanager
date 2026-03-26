/**
 * ImobCore V6 — Importação Financeira Inteligente
 * OFX + PDF + OCR (Claude Vision) + IA + Aprendizado Automático
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { Readable } from "stream";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Multer: memória (sem disco) ──────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/octet-stream",
      "text/plain",
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ];
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith(".ofx") || ext.endsWith(".qfx") || allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não suportado. Use OFX, PDF ou imagem."));
    }
  },
});

// ── HEURÍSTICA DE CLASSIFICAÇÃO ──────────────────────────────────────────────
const REGRAS: { pattern: RegExp; categoria: string; tipo?: "receita" | "despesa" }[] = [
  { pattern: /energia|eletricidade|cemig|copel|enel|cpfl|light/i, categoria: "Energia", tipo: "despesa" },
  { pattern: /agua|saneamento|sabesp|caesb|cagece|copasa|sanepar/i, categoria: "Água", tipo: "despesa" },
  { pattern: /gas|comgas/i, categoria: "Gás", tipo: "despesa" },
  { pattern: /salario|folha|rh|recursos humanos|funcionario|colaborador|pagamento pessoal/i, categoria: "Folha de Pagamento", tipo: "despesa" },
  { pattern: /manutencao|reparo|conserto|reforma|pintura|hidraulic|eletric/i, categoria: "Manutenção", tipo: "despesa" },
  { pattern: /limpeza|faxina|zeladoria|jardinagem/i, categoria: "Limpeza", tipo: "despesa" },
  { pattern: /seguro|apolice|bradesco seguros|porto seguro|mapfre/i, categoria: "Seguros", tipo: "despesa" },
  { pattern: /contabilidade|contador|auditoria|honorario/i, categoria: "Contabilidade", tipo: "despesa" },
  { pattern: /taxa condominial|condominio|cota|rateio|taxa ordinaria/i, categoria: "Taxa Condominial", tipo: "receita" },
  { pattern: /multa|juros|mora|inadimplente/i, categoria: "Multas e Juros", tipo: "receita" },
  { pattern: /aluguel|locacao|locação/i, categoria: "Aluguel", tipo: "receita" },
  { pattern: /reserva|fundo|emergencia|reservatorio/i, categoria: "Fundo de Reserva", tipo: "despesa" },
  { pattern: /elevador|otis|thyssen|schindler/i, categoria: "Elevador", tipo: "despesa" },
  { pattern: /portaria|porteiro|vigilancia|segurança|guarita/i, categoria: "Segurança", tipo: "despesa" },
  { pattern: /internet|telecom|telefone|net|vivo|claro|tim/i, categoria: "Telecom", tipo: "despesa" },
  { pattern: /imposto|iptu|taxa municipal|prefeitura/i, categoria: "Impostos", tipo: "despesa" },
  { pattern: /equipamento|compra|aquisicao/i, categoria: "Equipamentos", tipo: "despesa" },
  { pattern: /rendimento|aplicacao|investimento|cdb|poupanca|fundo invest/i, categoria: "Rendimentos", tipo: "receita" },
];

function heuristicaClassificar(texto: string, valor: number): { categoria: string; tipo: "receita" | "despesa"; confianca: number } {
  const textoLower = texto.toLowerCase();
  for (const regra of REGRAS) {
    if (regra.pattern.test(textoLower)) {
      return { categoria: regra.categoria, tipo: regra.tipo || (valor >= 0 ? "receita" : "despesa"), confianca: 0.75 };
    }
  }
  const tipo = valor >= 0 ? "receita" : "despesa";
  return { categoria: "Outros", tipo, confianca: 0.45 };
}

async function classificarComAprendizado(
  texto: string,
  valor: number,
  condominioId?: string
): Promise<{ categoria: string; tipo: "receita" | "despesa"; confianca: number; fonte: string }> {
  // 1. Buscar no aprendizado
  const { data: aprendidos } = await supabase
    .from("financeiro_aprendizado")
    .select("*")
    .order("vezes_usado", { ascending: false })
    .limit(200);

  if (aprendidos?.length) {
    const textoLower = texto.toLowerCase();
    let melhor: { categoria: string; tipo: string; confianca: number; score: number } | null = null;

    for (const ap of aprendidos) {
      const palavrasBase = (ap.texto_base || "").toLowerCase().split(" ").filter(Boolean);
      const palavrasTexto = textoLower.split(" ");
      const matches = palavrasBase.filter(p => p.length > 3 && palavrasTexto.some(t => t.includes(p)));
      const score = palavrasBase.length > 0 ? matches.length / palavrasBase.length : 0;

      if (score > 0.4 && (!melhor || score > melhor.score)) {
        melhor = { categoria: ap.categoria, tipo: ap.tipo, confianca: Math.min(0.95, 0.7 + score * 0.25) * (ap.confianca || 1), score };
      }
    }

    if (melhor && melhor.score > 0.4) {
      return {
        categoria: melhor.categoria,
        tipo: melhor.tipo as "receita" | "despesa",
        confianca: Number(melhor.confianca.toFixed(2)),
        fonte: "aprendizado",
      };
    }
  }

  // 2. Heurística local
  const heur = heuristicaClassificar(texto, valor);
  return { ...heur, fonte: heur.categoria !== "Outros" ? "heuristica" : "generico" };
}

// ── PARSER OFX ───────────────────────────────────────────────────────────────
interface OFXTransaction {
  tipo: "receita" | "despesa";
  valor: number;
  data: string;
  descricao: string;
  id_externo?: string;
}

function parseOFX(content: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = [];

  // Suporte a OFX SGML e XML
  const stmtEntries = content.match(/<STMTTRN>([\s\S]+?)<\/STMTTRN>/gi) || [];
  const sgmlBlocks = content.match(/\bSTMTTRN\b[\s\S]+?(?=\bSTMTTRN\b|<\/BANKTRANLIST|$)/gi) || [];
  const blocks = stmtEntries.length ? stmtEntries : sgmlBlocks;

  for (const block of blocks) {
    const getTag = (tag: string) => {
      const m = new RegExp(`<${tag}>([^<\n\r]+)`, "i").exec(block);
      return m ? m[1].trim() : "";
    };

    const trnamt = getTag("TRNAMT") || getTag("TRNAMT");
    const dtposted = getTag("DTPOSTED");
    const memo = getTag("MEMO") || getTag("NAME") || getTag("NAME");
    const fitid = getTag("FITID");

    if (!trnamt) continue;

    const valor = parseFloat(trnamt.replace(",", "."));
    let data = dtposted.slice(0, 8);
    if (data.length === 8) {
      data = `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}`;
    } else {
      data = new Date().toISOString().slice(0, 10);
    }

    transactions.push({
      tipo: valor >= 0 ? "receita" : "despesa",
      valor: Math.abs(valor),
      data,
      descricao: memo || "Transação OFX",
      id_externo: fitid,
    });
  }

  return transactions;
}

// ── PARSER PDF (texto) ────────────────────────────────────────────────────────
interface ExtractedLine {
  descricao: string;
  valor: number;
  data: string;
  tipo: "receita" | "despesa";
}

function extractLinesFromText(text: string): ExtractedLine[] {
  const lines: ExtractedLine[] = [];

  // Padrões brasileiros de extrato
  const valorPattern = /R\$\s*([\d.,]+)|(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  const dataPattern = /(\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/g;

  const textLines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 5);

  for (const line of textLines) {
    const valorMatch = line.match(/R\$\s*([\d.,]+)|((?<!\d)[\d]{1,3}(?:\.\d{3})*,\d{2}(?!\d))/);
    const dataMatch = line.match(/(\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/);

    if (!valorMatch) continue;

    const valorStr = (valorMatch[1] || valorMatch[2] || "0").replace(/\./g, "").replace(",", ".");
    const valor = parseFloat(valorStr);
    if (isNaN(valor) || valor <= 0 || valor > 10_000_000) continue;

    let data = new Date().toISOString().slice(0, 10);
    if (dataMatch) {
      const raw = dataMatch[1];
      if (raw.includes("/")) {
        const [d, m, y] = raw.split("/");
        const year = y.length === 2 ? `20${y}` : y;
        data = `${year}-${m}-${d}`;
      } else {
        data = raw;
      }
    }

    const descricao = line
      .replace(/R\$\s*[\d.,]+/g, "")
      .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
      .replace(/\d{4}-\d{2}-\d{2}/g, "")
      .replace(/[-]{2,}/g, "")
      .trim()
      .slice(0, 120);

    if (descricao.length < 3) continue;

    lines.push({ descricao, valor, data, tipo: "despesa" });
  }

  return lines.slice(0, 100);
}

// ── CLAUDE VISION para imagens / PDF escaneado ───────────────────────────────
async function extractWithClaudeVision(
  buffer: Buffer,
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf"
): Promise<ExtractedLine[]> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const base64 = buffer.toString("base64");
  const sourceMediaType = mediaType === "application/pdf" ? "image/jpeg" : mediaType;

  const prompt = `Você é um extrator financeiro especializado em documentos de condomínio brasileiro.
Analise esta imagem/documento e extraia TODOS os lançamentos financeiros encontrados.

Retorne EXATAMENTE um JSON válido no formato:
{
  "lancamentos": [
    { "descricao": "texto da transação", "valor": 1234.56, "data": "2024-01-15", "tipo": "receita|despesa" }
  ]
}

Regras:
- valor sempre positivo (número)
- tipo = "receita" para entradas, "despesa" para saídas
- data no formato YYYY-MM-DD
- Se não encontrar data específica, use hoje
- Inclua TODOS os itens visíveis, mesmo que a confiança seja baixa
- Se não encontrar nenhum lançamento, retorne {"lancamentos":[]}`;

  const msg = await ai.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: sourceMediaType as "image/png" | "image/jpeg" | "image/webp",
            data: base64,
          },
        },
        { type: "text", text: prompt },
      ],
    }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const jsonMatch = raw.match(/\{[\s\S]+\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return (parsed.lancamentos || []).map((l: any) => ({
    descricao: String(l.descricao || "").slice(0, 120),
    valor: Math.abs(Number(l.valor) || 0),
    data: String(l.data || new Date().toISOString().slice(0, 10)),
    tipo: l.tipo === "receita" ? "receita" : "despesa",
  })).filter((l: ExtractedLine) => l.valor > 0);
}

// ── DETECÇÃO DE DUPLICATAS ────────────────────────────────────────────────────
async function detectarDuplicatas(
  items: Array<{ valor: number; data: string; descricao: string }>,
  condominioId?: string
): Promise<Set<number>> {
  const duplicatas = new Set<number>();
  if (!condominioId) return duplicatas;

  const { data: existentes } = await supabase
    .from("lancamentos_financeiros")
    .select("valor, data, descricao")
    .eq("condominio_id", condominioId)
    .gte("data", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10));

  if (!existentes?.length) return duplicatas;

  items.forEach((item, idx) => {
    const duplicado = existentes.some(
      e =>
        Math.abs(Number(e.valor) - item.valor) < 0.01 &&
        e.data?.slice(0, 10) === item.data?.slice(0, 10)
    );
    if (duplicado) duplicatas.add(idx);
  });

  return duplicatas;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/financeiro/importar
router.post("/financeiro/importar", upload.single("arquivo"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

    const { condominio_id } = req.body;
    const file = req.file;
    const ext = file.originalname.toLowerCase();
    const mime = file.mimetype;

    let rawItems: Array<{ descricao: string; valor: number; data: string; tipo: "receita" | "despesa" }> = [];
    let metodo = "desconhecido";

    // ── OFX ──
    if (ext.endsWith(".ofx") || ext.endsWith(".qfx")) {
      const content = file.buffer.toString("latin1");
      const txns = parseOFX(content);
      rawItems = txns.map(t => ({ descricao: t.descricao, valor: t.valor, data: t.data, tipo: t.tipo }));
      metodo = "ofx";
    }

    // ── PDF texto ──
    else if (mime === "application/pdf") {
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(file.buffer);
        if (pdfData.text && pdfData.text.trim().length > 50) {
          rawItems = extractLinesFromText(pdfData.text);
          metodo = "pdf-texto";
        }
      } catch {}

      // Se PDF não tem texto ou extraiu muito pouco → Claude Vision
      if (rawItems.length < 2) {
        const visionItems = await extractWithClaudeVision(file.buffer, "application/pdf");
        if (visionItems.length > rawItems.length) {
          rawItems = visionItems;
          metodo = "claude-vision-pdf";
        }
      }
    }

    // ── Imagem (PNG/JPG) — Claude Vision ──
    else if (mime.startsWith("image/")) {
      const visionMime = mime as "image/png" | "image/jpeg" | "image/webp";
      rawItems = await extractWithClaudeVision(file.buffer, visionMime);
      metodo = "claude-vision-ocr";
    }

    if (!rawItems.length) {
      return res.status(422).json({ error: "Nenhum lançamento encontrado no arquivo. Verifique se é um extrato válido." });
    }

    // ── Classificar com IA + aprendizado ──
    const lancamentos = await Promise.all(
      rawItems.map(async (item, idx) => {
        const classif = await classificarComAprendizado(item.descricao, item.tipo === "receita" ? item.valor : -item.valor, condominio_id);
        return {
          idx,
          tipo: classif.tipo,
          categoria: classif.categoria,
          descricao: item.descricao,
          valor: item.valor,
          data: item.data,
          confianca: classif.confianca,
          fonte: classif.fonte,
          origem: metodo,
        };
      })
    );

    // ── Detectar duplicatas ──
    const duplicataIdxs = await detectarDuplicatas(rawItems, condominio_id);
    const resultado = lancamentos.map(l => ({
      ...l,
      duplicata_provavel: duplicataIdxs.has(l.idx),
      alerta: l.valor > 10000 && l.categoria === "Outros" ? "⚠️ Valor alto sem categoria definida" :
               l.duplicata_provavel ? "⚠️ Possível lançamento duplicado" : null,
    }));

    // Estatísticas
    const totalReceitas = resultado.filter(l => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
    const totalDespesas = resultado.filter(l => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
    const altaConfianca = resultado.filter(l => l.confianca >= 0.8).length;
    const baixaConfianca = resultado.filter(l => l.confianca < 0.5).length;

    res.json({
      ok: true,
      metodo,
      arquivo: file.originalname,
      total: resultado.length,
      estatisticas: {
        receitas: totalReceitas,
        despesas: totalDespesas,
        saldo: totalReceitas - totalDespesas,
        alta_confianca: altaConfianca,
        baixa_confianca: baixaConfianca,
        duplicatas: duplicataIdxs.size,
      },
      lancamentos: resultado,
    });
  } catch (e: unknown) {
    console.error("[importar]", e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/financeiro/importacao/confirmar — salvar lote aprovado
router.post("/financeiro/importacao/confirmar", async (req: Request, res: Response) => {
  try {
    const { condominio_id, lancamentos } = req.body as {
      condominio_id: string;
      lancamentos: Array<{
        tipo: string; categoria: string; descricao: string; valor: number; data: string;
        confianca: number; origem: string;
      }>;
    };

    if (!lancamentos?.length) return res.status(400).json({ error: "Nenhum lançamento para salvar." });

    // Inserir na tabela lancamentos_financeiros
    const rows = lancamentos.map(l => ({
      condominio_id: condominio_id || null,
      tipo: l.tipo,
      categoria: l.categoria,
      descricao: l.descricao,
      valor: l.valor,
      data: l.data,
      origem: l.origem || "importacao",
      status: "pago",
    }));

    const { error, data } = await supabase.from("lancamentos_financeiros").insert(rows).select("id");
    if (error) return res.status(400).json({ error: error.message });

    res.json({ ok: true, salvos: data?.length || rows.length });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/financeiro/aprender — aprendizado por feedback do usuário
router.post("/financeiro/aprender", async (req: Request, res: Response) => {
  try {
    const { texto_base, categoria, tipo } = req.body as {
      texto_base: string; categoria: string; tipo: string;
    };

    if (!texto_base || !categoria) return res.status(400).json({ error: "texto_base e categoria são obrigatórios." });

    const textNorm = texto_base.toLowerCase().slice(0, 200);

    // Verificar se já existe
    const { data: existente } = await supabase
      .from("financeiro_aprendizado")
      .select("id, vezes_usado")
      .eq("texto_base", textNorm)
      .eq("categoria", categoria)
      .single();

    if (existente) {
      await supabase
        .from("financeiro_aprendizado")
        .update({ vezes_usado: (existente.vezes_usado || 1) + 1, confianca: 1, tipo })
        .eq("id", existente.id);
    } else {
      await supabase.from("financeiro_aprendizado").insert({
        texto_base: textNorm,
        categoria,
        tipo,
        confianca: 1,
        vezes_usado: 1,
      });
    }

    res.json({ ok: true, aprendido: { texto_base: textNorm, categoria, tipo } });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/financeiro/aprendizado/stats — estatísticas de aprendizado
router.get("/financeiro/aprendizado/stats", async (_req: Request, res: Response) => {
  try {
    const { data, count } = await supabase
      .from("financeiro_aprendizado")
      .select("*", { count: "exact" })
      .order("vezes_usado", { ascending: false })
      .limit(10);

    res.json({ total: count || 0, top: data || [] });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/financeiro/importacao/di-insight — Di analisa o lote importado
router.post("/financeiro/importacao/di-insight", async (req: Request, res: Response) => {
  try {
    const { condominio_id, estatisticas, lancamentos } = req.body;

    const { data: cond } = condominio_id
      ? await supabase.from("condominios").select("nome").eq("id", condominio_id).single()
      : { data: null };

    const condNome = cond?.nome || "condomínio";
    const stats = estatisticas || {};
    const lotes = (lancamentos || []) as Array<{ categoria: string; valor: number; tipo: string; descricao: string; alerta?: string }>;

    const topDespesas = lotes
      .filter(l => l.tipo === "despesa")
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
      .map(l => `• ${l.categoria}: R$ ${Number(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — ${l.descricao}`)
      .join("\n");

    const alertas = lotes.filter(l => l.alerta).map(l => `• ${l.alerta}: ${l.descricao} (R$ ${l.valor})`).join("\n") || "• Nenhuma anomalia detectada";

    const prompt = `Você é Di, Síndica Virtual Inteligente do ${condNome}.

LOTE IMPORTADO — DADOS:
• Total de lançamentos: ${lotes.length}
• Receitas: R$ ${Number(stats.receitas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
• Despesas: R$ ${Number(stats.despesas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
• Saldo do lote: R$ ${Number(stats.saldo || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
• Alta confiança: ${stats.alta_confianca || 0} lançamentos
• Baixa confiança: ${stats.baixa_confianca || 0} lançamentos
• Duplicatas detectadas: ${stats.duplicatas || 0}

TOP DESPESAS IMPORTADAS:
${topDespesas || "• Nenhuma despesa"}

ALERTAS DETECTADOS:
${alertas}

Gere um briefing executivo conciso (máx 250 palavras) com:
1. RESUMO — o que foi importado, saldo, saúde do lote
2. ANOMALIAS — itens que merecem atenção
3. SUGESTÃO — 1-2 ações práticas imediatas`;

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await ai.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const texto = msg.content[0].type === "text" ? msg.content[0].text : "";
    const resumo = texto.match(/RESUMO[^:]*[:\s]+([\s\S]+?)(?=\n\s*\d+\.|ANOMALIA|SUGESTÃO|$)/i)?.[1]?.trim() || texto.slice(0, 300);
    const anomalias = texto.match(/ANOMALIA[S]?[^:]*[:\s]+([\s\S]+?)(?=\n\s*\d+\.|SUGESTÃO|$)/i)?.[1]?.trim() || "";
    const sugestao = texto.match(/SUGESTÃO[^:]*[:\s]+([\s\S]+)/i)?.[1]?.trim() || "";

    res.json({ resumo, anomalias, sugestao, texto_completo: texto, gerado_em: new Date().toISOString() });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/financeiro/importacao/migration-sql — SQL para criar tabelas
router.get("/financeiro/importacao/migration-sql", (_req: Request, res: Response) => {
  res.json({
    sql: `-- ImobCore V6 — Tabelas de Importação Financeira Inteligente
CREATE TABLE IF NOT EXISTS financeiro_aprendizado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texto_base TEXT NOT NULL,
  categoria TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  confianca NUMERIC DEFAULT 1,
  vezes_usado INT DEFAULT 1,
  criado_em TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aprendizado_texto ON financeiro_aprendizado(texto_base);
CREATE INDEX IF NOT EXISTS idx_aprendizado_categoria ON financeiro_aprendizado(categoria);`,
  });
});

export default router;
