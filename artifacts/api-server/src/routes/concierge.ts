/**
 * routes/concierge.ts
 * API do Totem — auth por token, isolamento total por condoId.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { supabase }    from '../lib/supabase.js';
import {
  resolveToken, carregarCtx, carregarGuia,
  montarSystemPrompt, seedGuiaDemo,
} from '../services/totem.js';
import Anthropic from '@anthropic-ai/sdk';

const r = Router();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'imobcore-admin-2026';
let _cl: Anthropic | null = null;
const cl = () => _cl ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── requireMaster middleware ──────────────────────────────────────────────────
function requireMaster(req: Request, res: Response, next: NextFunction) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Acesso negado' }) as any;
  }
  next();
}

// ── token auth middleware ─────────────────────────────────────────────────────
async function authToken(req: Request, res: Response, next: NextFunction) {
  const token = (req.headers['x-concierge-token'] as string) || (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Token obrigatório' }) as any;
  try {
    (req as any).condoId = await resolveToken(token);
    next();
  } catch (e) { res.status(403).json({ error: (e as Error).message }); }
}

// ═══════════════════════════════════════════════════════════════════
// MASTER CRUD — requireMaster protegido
// ═══════════════════════════════════════════════════════════════════

// FAQ
r.get('/master/faq/:cId', requireMaster, async (req, res) => {
  const { data } = await supabase.from('concierge_faq').select('*')
    .eq('condominio_id', req.params.cId).order('ordem');
  res.json(data ?? []);
});
r.put('/master/faq/:cId', requireMaster, async (req, res) => {
  const { faq } = req.body;
  await supabase.from('concierge_faq').delete().eq('condominio_id', req.params.cId);
  if (faq?.length) await supabase.from('concierge_faq').insert(
    faq.map((f: any, i: number) => ({
      condominio_id: req.params.cId, pergunta: f.pergunta, resposta: f.resposta,
      categoria: f.categoria ?? 'geral', ordem: i, ativo: true,
    }))
  );
  res.json({ ok: true });
});

// Métricas do dia
r.get('/master/metricas/:cId', requireMaster, async (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('concierge_sessoes').select('tipo')
    .eq('condominio_id', req.params.cId).gte('iniciada_em', hoje);
  const rows = data ?? [];
  res.json({
    total:      rows.length,
    visitantes: rows.filter((r: any) => r.tipo === 'visitante').length,
    hospedes:   rows.filter((r: any) => r.tipo === 'hospede').length,
    entregas:   rows.filter((r: any) => r.tipo === 'entrega').length,
    info:       rows.filter((r: any) => r.tipo === 'info').length,
  });
});

// Guia CRUD
r.get('/master/guia/:cId', requireMaster, async (req, res) => {
  const { data } = await supabase.from('guia_hospede').select('*')
    .eq('condominio_id', req.params.cId).order('categoria').order('ordem');
  res.json(data ?? []);
});
r.post('/master/guia/:cId', requireMaster, async (req, res) => {
  const { data, error } = await supabase.from('guia_hospede')
    .insert({ condominio_id: req.params.cId, ...req.body, updated_at: new Date().toISOString() })
    .select().single();
  res.json({ ok: !error, data });
});
r.put('/master/guia/:cId/:id', requireMaster, async (req, res) => {
  const { data } = await supabase.from('guia_hospede')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('condominio_id', req.params.cId).select().single();
  res.json({ ok: true, data });
});
r.delete('/master/guia/:cId/:id', requireMaster, async (req, res) => {
  await supabase.from('guia_hospede').delete()
    .eq('id', req.params.id).eq('condominio_id', req.params.cId);
  res.json({ ok: true });
});
r.post('/master/guia/:cId/seed', requireMaster, async (req, res) => {
  await seedGuiaDemo(req.params.cId); res.json({ ok: true });
});

// Mídia CRUD
r.get('/master/midia/:cId', requireMaster, async (req, res) => {
  const { data } = await supabase.from('totem_midia').select('*')
    .eq('condominio_id', req.params.cId).order('ordem');
  res.json(data ?? []);
});
r.post('/master/midia/:cId', requireMaster, async (req, res) => {
  const { data, error } = await supabase.from('totem_midia')
    .insert({ condominio_id: req.params.cId, ...req.body }).select().single();
  res.json({ ok: !error, data });
});
r.put('/master/midia/:cId/:id', requireMaster, async (req, res) => {
  const { data } = await supabase.from('totem_midia')
    .update(req.body).eq('id', req.params.id).eq('condominio_id', req.params.cId).select().single();
  res.json({ ok: true, data });
});
r.delete('/master/midia/:cId/:id', requireMaster, async (req, res) => {
  await supabase.from('totem_midia').delete()
    .eq('id', req.params.id).eq('condominio_id', req.params.cId);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// TOTEM API — autenticado por token de condomínio
// ═══════════════════════════════════════════════════════════════════
r.use('/config',       authToken);
r.use('/chat',         authToken);
r.use('/guia',         authToken);
r.use('/midia',        authToken);
r.use('/comunicados',  authToken);
r.use('/emergencia',   authToken);

r.get('/config', async (req, res) => {
  try {
    const ctx = await carregarCtx((req as any).condoId);
    res.json({
      condominio_id: ctx.condoId, nome_condo: ctx.nomeCondo, nome_di: ctx.nomeDi,
      cor_tema: ctx.corTema, tts_provider: ctx.ttsProv, idle_seg: ctx.idleSeg,
      saudacao: ctx.saudacao, horarios: ctx.horarios, contatos: ctx.contatos,
      avatar_url: ctx.avatarUrl, faq: ctx.faq, midia: ctx.midia,
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

r.post('/chat', async (req, res) => {
  const { mensagem, historico = [], tipo = 'info' } = req.body ?? {};
  if (!mensagem?.trim()) return res.status(400).json({ error: 'mensagem obrigatória' }) as any;
  const condoId = (req as any).condoId;
  try {
    const ctx          = await carregarCtx(condoId);
    const systemPrompt = await montarSystemPrompt(ctx, tipo);
    const messages: Anthropic.MessageParam[] = [
      ...historico.slice(-8).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: mensagem },
    ];
    const msg = await cl().messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 300,
      system: systemPrompt, messages,
    });
    const resposta = (msg.content.find(b => b.type === 'text') as Anthropic.TextBlock)?.text ?? '';
    let acao = false;
    if (tipo === 'visitante') acao = await _regVisitante(mensagem, historico, condoId);
    if (tipo === 'entrega')   acao = await _regEntrega(mensagem, historico, condoId);
    if (tipo === 'emergencia') _regEmergencia(condoId).catch(() => {});
    supabase.from('concierge_sessoes').insert({ condominio_id: condoId, tipo }).then(() => {}).catch(() => {});
    res.json({ resposta, acao_executada: acao });
  } catch {
    res.json({ resposta: 'Não foi possível conectar. Fale com a portaria.', offline: true });
  }
});

r.get('/guia', async (req, res) => {
  const condoId = (req as any).condoId;
  try {
    let guia = await carregarGuia(condoId);
    if (!Object.keys(guia).length) { await seedGuiaDemo(condoId); guia = await carregarGuia(condoId); }
    res.json(guia);
  } catch { res.json({}); }
});

r.get('/midia', async (req, res) => {
  const condoId = (req as any).condoId;
  try {
    const { data } = await supabase.from('totem_midia')
      .select('id,titulo,descricao,categoria,tipo,url,slideshow,carousel,ordem')
      .eq('condominio_id', condoId).eq('ativo', true).order('ordem');
    res.json(data ?? []);
  } catch { res.json([]); }
});

r.get('/comunicados', async (req, res) => {
  const condoId = (req as any).condoId;
  try {
    const { data } = await supabase.from('comunicados').select('titulo,corpo,tipo,created_at')
      .eq('condominio_id', condoId).order('created_at', { ascending: false }).limit(5);
    res.json(data ?? []);
  } catch { res.json([]); }
});

r.post('/emergencia', async (req, res) => {
  _regEmergencia((req as any).condoId).catch(() => {});
  res.json({ ok: true });
});

// ─── Helpers internos ────────────────────────────────────────────────────────
async function _regVisitante(msg: string, hist: any[], condoId: string): Promise<boolean> {
  const conv = [...hist.map((m: any) => m.content), msg].join(' ');
  const apto = conv.match(/\b(?:ap(?:to)?\.?\s*|apartamento\s*)(\d{2,4}[a-z]?)/i)?.[1];
  const nome = conv.match(/(?:me chamo|meu nome [eé]|sou o?a?\s+)([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+[A-Z][a-z]+)*)/i)?.[1];
  if (!apto || !nome) return false;
  await supabase.from('visitantes_portaria').insert({
    condominio_id: condoId, nome, destino_unidade: apto, tipo: 'visita', status: 'aguardando_autorizacao',
  }).catch(() => {});
  await supabase.from('notificacoes').insert({
    condominio_id: condoId, titulo: `Visitante: ${nome}`,
    corpo: `${nome} chegou para o Apto ${apto}.`, canal: 'push', destino: apto, lida: false,
  }).catch(() => {});
  return true;
}

async function _regEntrega(msg: string, hist: any[], condoId: string): Promise<boolean> {
  const conv = [...hist.map((m: any) => m.content), msg].join(' ').toLowerCase();
  const apto = conv.match(/\b(?:ap(?:to)?\.?\s*|apartamento\s*)(\d{2,4}[a-z]?)/i)?.[1];
  if (!apto) return false;
  const rem = ['amazon', 'correios', 'ifood', 'rappi', 'shein', 'shopee', 'mercado livre']
    .find(x => conv.includes(x)) ?? 'Entregador';
  const perecivel = ['ifood', 'rappi', 'uber'].some(x => conv.includes(x));
  await supabase.from('encomendas').insert({
    condominio_id: condoId, remetente: rem,
    tipo: perecivel ? 'perecivel' : 'normal', destinatario_unidade: apto,
    sla_horas: perecivel ? 4 : 168, status: 'aguardando_retirada', lembretes_enviados: 0,
  }).catch(() => {});
  return true;
}

async function _regEmergencia(condoId: string): Promise<void> {
  await supabase.from('alertas_misp').insert({
    condominio_id: condoId, tipo: 'EMERGENCIA_TOTEM',
    descricao: 'Emergência acionada no Concierge Virtual — entrada do condomínio',
    local: 'Totem entrada', severidade: 'urgente', status: 'ativo',
  });
}

export default r;
