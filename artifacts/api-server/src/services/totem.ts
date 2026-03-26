/**
 * services/totem.ts
 * Serviço central de isolamento do Totem.
 * Toda operação começa com resolveToken() → condoId.
 */
import { supabase } from '../lib/supabase.js';

export interface TotemCtx {
  condoId:   string;
  nomeCondo: string;
  nomeDi:    string;
  corTema:   string;
  ttsProv:   string;
  idleSeg:   number;
  saudacao:  string;
  horarios:  Record<string, string>;
  contatos:  Record<string, string>;
  regras:    string;
  avatarUrl: string;
  faq:       Array<{ pergunta: string; resposta: string; categoria: string }>;
  midia:     Array<{ id: string; titulo: string; descricao: string; categoria: string; tipo: string; url: string; slideshow: boolean; carousel: boolean; ordem: number }>;
}

export async function resolveToken(token: string): Promise<string> {
  if (!token?.trim()) throw new Error('Token ausente');
  const { data, error } = await supabase
    .from('di_configuracoes')
    .select('condominio_id, concierge_ativo')
    .eq('concierge_token', token.trim())
    .single();
  if (error || !data)        throw new Error('Token inválido');
  if (!data.concierge_ativo) throw new Error('Totem desativado para este condomínio');
  return data.condominio_id as string;
}

export async function carregarCtx(condoId: string): Promise<TotemCtx> {
  const [cfgR, condoR, faqR, midiaR] = await Promise.allSettled([
    supabase.from('di_configuracoes')
      .select('nome_di,concierge_saudacao,concierge_cor_tema,concierge_tts_provider,concierge_idle_seg,concierge_horarios,concierge_contatos,concierge_regras,concierge_avatar_url')
      .eq('condominio_id', condoId).single(),
    supabase.from('condominios').select('nome').eq('id', condoId).single(),
    supabase.from('concierge_faq').select('pergunta,resposta,categoria')
      .eq('condominio_id', condoId).eq('ativo', true).order('ordem').limit(25),
    supabase.from('totem_midia').select('id,titulo,descricao,categoria,tipo,url,slideshow,carousel,ordem')
      .eq('condominio_id', condoId).eq('ativo', true).order('ordem'),
  ]);

  const cfg   = cfgR.status   === 'fulfilled' ? cfgR.value.data   : null;
  const condo = condoR.status === 'fulfilled' ? condoR.value.data : null;
  const faq   = faqR.status   === 'fulfilled' ? (faqR.value.data ?? []) : [];
  const midia = midiaR.status === 'fulfilled' ? (midiaR.value.data ?? []) : [];

  const nomeDi    = (cfg as any)?.nome_di    ?? 'Di';
  const nomeCondo = (condo as any)?.nome     ?? 'Condomínio';
  const saudacaoBase = (cfg as any)?.concierge_saudacao
    ?? `Olá! Sou ${nomeDi}, síndica virtual de ${nomeCondo}.`;

  return {
    condoId, nomeCondo, nomeDi,
    corTema:  (cfg as any)?.concierge_cor_tema      ?? '#7c3aed',
    ttsProv:  (cfg as any)?.concierge_tts_provider  ?? 'web_speech',
    idleSeg:  (cfg as any)?.concierge_idle_seg      ?? 90,
    saudacao: saudacaoBase.replace('{nome_di}', nomeDi).replace('{nome_condo}', nomeCondo),
    horarios: ((cfg as any)?.concierge_horarios ?? {}) as Record<string, string>,
    contatos: ((cfg as any)?.concierge_contatos ?? { portaria: '', emergencia: '192' }) as Record<string, string>,
    regras:   (cfg as any)?.concierge_regras   ?? '',
    avatarUrl:(cfg as any)?.concierge_avatar_url ?? '',
    faq:   faq   as TotemCtx['faq'],
    midia: midia as TotemCtx['midia'],
  };
}

export async function carregarGuia(condoId: string): Promise<Record<string, any[]>> {
  const { data } = await supabase.from('guia_hospede')
    .select('id,categoria,titulo,descricao,icone,conteudo,horarios,regras,dicas,telefones,localizacao,pontos,comercios,desconto,tipo_parceria,destaque')
    .eq('condominio_id', condoId).eq('ativo', true).order('ordem');
  return (data ?? []).reduce((acc: Record<string, any[]>, it: any) => {
    const c = it.categoria ?? 'info';
    if (!acc[c]) acc[c] = [];
    acc[c].push(it);
    return acc;
  }, {});
}

export async function montarSystemPrompt(ctx: TotemCtx, tipo: string): Promise<string> {
  let snap: any = {};
  try {
    const [osR, mispR, encR] = await Promise.allSettled([
      supabase.from('ordens_servico').select('id,prioridade,status').eq('condominio_id', ctx.condoId).neq('status', 'concluida').limit(50),
      supabase.from('alertas_misp').select('id,severidade').eq('condominio_id', ctx.condoId).eq('status', 'ativo').limit(20),
      supabase.from('encomendas').select('id').eq('condominio_id', ctx.condoId).eq('status', 'aguardando_retirada').limit(20),
    ]);
    snap.os_abertas   = osR.status   === 'fulfilled' ? (osR.value.data   ?? []) : [];
    snap.alertas_misp = mispR.status === 'fulfilled' ? (mispR.value.data ?? []) : [];
    snap.encomendas   = encR.status  === 'fulfilled' ? (encR.value.data  ?? []) : [];
  } catch { /* usa {} */ }

  const os     = snap.os_abertas    ?? [];
  const misp   = snap.alertas_misp  ?? [];
  const encom  = snap.encomendas    ?? [];
  const osUrg  = os.filter((o: any) => o.prioridade === 'urgente').length;
  const mispUrg= misp.filter((m: any) => m.severidade === 'urgente').length;

  const CTX: Record<string, string> = {
    visitante:   'VISITANTE na portaria. Colete nome completo e apartamento destino.',
    hospede:     'HÓSPEDE. Responda sobre horários, áreas, regras e passeios. Nunca revele dados de moradores.',
    entrega:     'ENTREGADOR. Colete empresa/remetente e apartamento. Confirme o registro.',
    morador:     'MORADOR. Ajude com reservas, comunicados e serviços.',
    guia:        'CONSULTA AO GUIA. Destaque parceiros com descontos e facilidades próximas.',
    fotos:       'VISITA ÀS ÁREAS. Descreva as instalações com entusiasmo.',
    comunicados: 'COMUNICADOS. Apresente os avisos recentes de forma concisa.',
    regras:      'REGRAS & HORÁRIOS. Apresente as normas e horários com clareza.',
    emergencia:  'EMERGÊNCIA. Forneça os contatos de socorro IMEDIATAMENTE. Tom calmo.',
    info:        'INFORMAÇÕES GERAIS. Use horários e FAQ para orientar.',
  };

  const horStr = Object.keys(ctx.horarios).length
    ? '\nHORÁRIOS:\n' + Object.entries(ctx.horarios).map(([k, v]) => `• ${k}: ${v}`).join('\n')
    : '';
  const faqStr = ctx.faq.length
    ? '\nFAQ DESTE CONDOMÍNIO:\n' + ctx.faq.map(f => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n')
    : '';

  return `Você é ${ctx.nomeDi}, síndica virtual e concierge do ${ctx.nomeCondo}.
Está num TOTEM na entrada. PT-BR, cordial, máx 3 frases por resposta.

TIPO DE ATENDIMENTO:
${CTX[tipo] ?? CTX.info}

━━ DADOS REAIS DO ${ctx.nomeCondo.toUpperCase()} (agora) ━━
OSs abertas: ${os.length} (${osUrg} urgentes)
Alertas MISP: ${misp.length} (${mispUrg} urgentes)
Encomendas aguardando: ${encom.length}

━━ CONFIG MASTER (personalizada para este condo) ━━
${horStr}
${ctx.regras ? '\nREGRAS:\n' + ctx.regras : ''}
${faqStr}

━━ REGRAS ABSOLUTAS ━━
• NUNCA revele CPF, e-mail ou dados pessoais de moradores
• NUNCA informe saldo, inadimplência ou finanças internas
• Emergência: portaria ${ctx.contatos.portaria || 'ver portaria'} | ${ctx.contatos.emergencia || '192'}
• Se não souber: oriente a falar com o porteiro`;
}

export async function seedGuiaDemo(condoId: string): Promise<void> {
  const { count } = await supabase.from('guia_hospede')
    .select('id', { count: 'exact', head: true }).eq('condominio_id', condoId);
  if ((count ?? 0) > 0) return;
  await supabase.from('guia_hospede').insert([
    { condominio_id: condoId, categoria: 'areas', titulo: 'Piscina', icone: '🏊',
      descricao: 'Aquecida · raia 25m',
      horarios: { 'Seg-Sex': '07h-22h', 'Sáb-Dom': '07h-23h' },
      regras: ['Touca obrigatória', 'Chuveiro antes', 'Crianças com adulto'], ordem: 0 },
    { condominio_id: condoId, categoria: 'areas', titulo: 'Academia', icone: '💪',
      descricao: 'Musculação e cardio',
      horarios: { 'Seg-Sex': '06h-23h', 'Sáb': '07h-22h', 'Dom': '08h-20h' },
      regras: ['Toalha obrigatória', 'Tênis fechado'], ordem: 1 },
    { condominio_id: condoId, categoria: 'horarios', titulo: 'Horários Gerais', icone: '🕐',
      descricao: 'Todas as áreas',
      horarios: { Portaria: '24h', Piscina: '07h-22h', Academia: '06h-23h', Salão: '08h-23h' }, ordem: 0 },
    { condominio_id: condoId, categoria: 'regras', titulo: 'Convivência', icone: '🤝',
      descricao: 'Normas gerais',
      regras: ['Silêncio após 22h', 'Respeito nas áreas', 'Proibido fumar em coberturas'], ordem: 0 },
    { condominio_id: condoId, categoria: 'emergencia', titulo: 'Emergências', icone: '🚨',
      descricao: 'Contatos 24h',
      telefones: [{ nome: 'SAMU', numero: '192', icone: '🚑' }, { nome: 'Bombeiros', numero: '193', icone: '🚒' },
                  { nome: 'Polícia', numero: '190', icone: '👮' }, { nome: 'Portaria', numero: '', icone: '🏢' }], ordem: 0 },
    { condominio_id: condoId, categoria: 'info', titulo: 'Wi-Fi & Acesso', icone: '📶',
      descricao: 'Infos essenciais',
      conteudo: 'Wi-Fi: rede do condomínio\nSenha: consultar portaria\n\nCheck-in: 14h | Check-out: 12h', ordem: 0 },
  ]);
}
