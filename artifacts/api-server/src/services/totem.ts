/**
 * services/totem.ts
 * Isolamento total: token → condoId → todas queries filtradas.
 */
import { supabase } from '../lib/supabase.js';

export interface TotemCtx {
  condoId:    string;
  nomeCondo:  string;
  nomeDi:     string;
  corTema:    string;
  ttsProv:    string;
  idleSeg:    number;
  saudacao:   string;
  horarios:   Record<string, string>;
  contatos:   Record<string, string>;
  regras:     string;
  avatarUrl:  string;
  wifiRede:   string;
  wifiSenha:  string;
  checkinH:   string;
  checkoutH:  string;
  cidade:     string;
  faq:        Array<{ pergunta: string; resposta: string; categoria: string }>;
  midia:      Array<{ id: string; titulo: string; descricao: string; categoria: string;
                      tipo: string; url: string; slideshow: boolean; carousel: boolean; ordem: number }>;
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
      .select('nome_di,concierge_saudacao,concierge_cor_tema,concierge_tts_provider,' +
              'concierge_idle_seg,concierge_horarios,concierge_contatos,concierge_regras,' +
              'concierge_avatar_url,concierge_wifi_rede,concierge_wifi_senha,' +
              'concierge_checkin_h,concierge_checkout_h,concierge_cidade')
      .eq('condominio_id', condoId).single(),
    supabase.from('condominios').select('nome').eq('id', condoId).single(),
    supabase.from('concierge_faq').select('pergunta,resposta,categoria')
      .eq('condominio_id', condoId).eq('ativo', true).order('ordem').limit(25),
    supabase.from('totem_midia')
      .select('id,titulo,descricao,categoria,tipo,url,slideshow,carousel,ordem')
      .eq('condominio_id', condoId).eq('ativo', true).order('ordem'),
  ]);

  const cfg   = cfgR.status   === 'fulfilled' ? cfgR.value.data   : null;
  const condo = condoR.status === 'fulfilled' ? condoR.value.data : null;
  const faq   = faqR.status   === 'fulfilled' ? (faqR.value.data ?? [])   : [];
  const midia = midiaR.status === 'fulfilled' ? (midiaR.value.data ?? []) : [];

  const nomeDi    = (cfg as any)?.nome_di  ?? 'Di';
  const nomeCondo = (condo as any)?.nome   ?? 'Condomínio';
  const saudBase  = (cfg as any)?.concierge_saudacao
    ?? `Olá! Sou ${nomeDi}, síndica virtual de ${nomeCondo}.`;

  return {
    condoId, nomeCondo, nomeDi,
    corTema:   (cfg as any)?.concierge_cor_tema      ?? '#7c3aed',
    ttsProv:   (cfg as any)?.concierge_tts_provider  ?? 'web_speech',
    idleSeg:   (cfg as any)?.concierge_idle_seg      ?? 90,
    saudacao:  saudBase.replace('{nome_di}', nomeDi).replace('{nome_condo}', nomeCondo),
    horarios:  ((cfg as any)?.concierge_horarios  ?? {}) as Record<string, string>,
    contatos:  ((cfg as any)?.concierge_contatos  ?? { portaria: '', emergencia: '192' }) as Record<string, string>,
    regras:    (cfg as any)?.concierge_regras     ?? '',
    avatarUrl: (cfg as any)?.concierge_avatar_url ?? '',
    wifiRede:  (cfg as any)?.concierge_wifi_rede  ?? '',
    wifiSenha: (cfg as any)?.concierge_wifi_senha ?? '',
    checkinH:  (cfg as any)?.concierge_checkin_h  ?? '14h',
    checkoutH: (cfg as any)?.concierge_checkout_h ?? '12h',
    cidade:    (cfg as any)?.concierge_cidade     ?? 'Rio de Janeiro',
    faq:   faq   as TotemCtx['faq'],
    midia: midia as TotemCtx['midia'],
  };
}

export async function carregarGuia(condoId: string): Promise<Record<string, any[]>> {
  const { data, error } = await supabase.from('guia_hospede')
    .select('*')
    .eq('condominio_id', condoId).eq('ativo', true).order('ordem');
  if (error) console.error('[carregarGuia]', error.message);
  // Merge rich data from `conteudo` JSON blob into top-level for SPA consumption.
  // conteudo wins for extra fields (regras, dicas, status, desconto, tipo_parceria).
  const items = (data ?? []).map((row: any) => {
    const c = typeof row.conteudo === 'string' ? JSON.parse(row.conteudo) : (row.conteudo || {});
    return { ...row, ...c };   // conteudo wins for rich fields
  });
  return items.reduce((acc: Record<string, any[]>, it: any) => {
    const cat = it.categoria ?? 'info';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(it);
    return acc;
  }, {});
}

export async function montarSystemPrompt(ctx: TotemCtx, tipo: string): Promise<string> {
  let os: any[] = [], misp: any[] = [], encom: any[] = [];
  try {
    const [osR, mispR, encR] = await Promise.allSettled([
      supabase.from('ordens_servico').select('id,prioridade').eq('condominio_id', ctx.condoId).neq('status','concluida').limit(50),
      supabase.from('alertas_misp').select('id,severidade').eq('condominio_id', ctx.condoId).eq('status','ativo').limit(20),
      supabase.from('encomendas').select('id').eq('condominio_id', ctx.condoId).eq('status','aguardando_retirada').limit(20),
    ]);
    os    = osR.status   === 'fulfilled' ? (osR.value.data   ?? []) : [];
    misp  = mispR.status === 'fulfilled' ? (mispR.value.data ?? []) : [];
    encom = encR.status  === 'fulfilled' ? (encR.value.data  ?? []) : [];
  } catch {}

  const osUrg   = os.filter((o: any) => o.prioridade === 'urgente').length;
  const mispUrg = misp.filter((m: any) => m.severidade === 'urgente').length;

  const CTX: Record<string, string> = {
    hospede:    `HÓSPEDE buscando informações. Responda sobre áreas, serviços, horários, ` +
                `passeios em ${ctx.cidade}, parceiros com descontos. Nunca revele dados de moradores.`,
    visitante:  'VISITANTE na portaria. Colete nome completo e apartamento destino. ' +
                'Ao obter ambos, confirme notificação ao morador.',
    entrega:    'ENTREGADOR. Colete empresa/remetente e apartamento. Confirme o registro.',
    morador:    'MORADOR. Auxilie com reservas, comunicados e serviços.',
    emergencia: 'EMERGÊNCIA. Forneça contatos imediatamente. Tom calmo e direto.',
    info:       'INFORMAÇÕES GERAIS. Use horários e FAQ para orientar.',
  };

  const horStr  = Object.keys(ctx.horarios).length
    ? '\nHORÁRIOS:\n' + Object.entries(ctx.horarios).map(([k,v]) => `• ${k}: ${v}`).join('\n') : '';
  const wifiStr = ctx.wifiRede
    ? `\nWI-FI: Rede "${ctx.wifiRede}" | Senha: ${ctx.wifiSenha || 'consultar portaria'}` : '';
  const checkStr = `\nCHECK-IN: ${ctx.checkinH} | CHECK-OUT: ${ctx.checkoutH}`;
  const faqStr  = ctx.faq.length
    ? '\nFAQ:\n' + ctx.faq.map(f => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n') : '';

  return `Você é ${ctx.nomeDi}, síndica virtual e concierge do ${ctx.nomeCondo} em ${ctx.cidade}.
Está num TOTEM na entrada. Responda em PT-BR, cordial, máx 3 frases.

${CTX[tipo] ?? CTX.info}

━━ DADOS REAIS DO ${ctx.nomeCondo.toUpperCase()} ━━
OSs abertas: ${os.length} (${osUrg} urgentes)
Alertas MISP: ${misp.length} (${mispUrg} urgentes)
Encomendas aguardando: ${encom.length}

━━ CONFIG DESTE CONDOMÍNIO ━━
${horStr}${wifiStr}${checkStr}
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

  // Helper: serialise rich data to conteudo JSON (avoids DDL migrations).
  // carregarGuia merges conteudo back into the item on read.
  const row = (
    cat: string, titulo: string, icone: string, ordem: number,
    descricao: string, opts: Record<string,any> = {},
    horarios: Record<string,string> = {},
    pontos: any[] = [], telefones: any[] = []
  ) => ({
    condominio_id: condoId, categoria: cat, titulo, icone, ordem,
    descricao, horarios, pontos, telefones, ativo: true,
    // pack rich fields into conteudo (already JSONB in schema)
    conteudo: {
      status:       opts.status       ?? 'aberto',
      regras:       opts.regras       ?? [],
      dicas:        opts.dicas        ?? [],
      desconto:     opts.desconto     ?? '',
      tipo_parceria: opts.tipo_parceria ?? '',
    },
  });

  const { error } = await supabase.from('guia_hospede').insert([
    // ── ÁREAS ─────────────────────────────────────────
    row('areas','Piscina','🏊',0,'Aquecida · raia 25m · deck de lazer',
      { status:'aberto', regras:['Touca obrigatória','Chuveiro antes de entrar','Crianças com adulto','Sem vidros na borda'],
        dicas:['Manhãs de semana: menos movimento','Toalhas gratuitas na portaria'] },
      { 'Seg-Sex':'07h-22h', 'Sáb-Dom':'07h-23h' }),
    row('areas','Academia','💪',1,'Musculação e cardio completos',
      { status:'aberto', regras:['Toalha obrigatória nos equipamentos','Tênis fechado obrigatório'],
        dicas:['Pico 18h-20h — prefira as manhãs'] },
      { 'Seg-Sex':'06h-23h', 'Sáb':'07h-22h', 'Dom':'08h-20h' }),
    row('areas','Salão de Festas','🎉',2,'Cozinha · churrasqueira · área externa',
      { status:'disponivel', regras:['Reservar 72h antes','Caução R$ 200','Máx 60 pessoas'],
        dicas:['Churrasqueira a gás inclusa','Reservas via portaria ou app'] },
      { Disponível:'08h-23h', 'Barulho até':'22h' }),
    row('areas','Área Pet','🐾',3,'Espaço com bebedouro e saquinhos',
      { status:'aberto', regras:['Coleira obrigatória','Recolher dejetos'] },
      { Diário:'06h-22h' }),
    row('areas','Brinquedoteca','🧸',4,'Jogos e espaço infantil seguro',
      { status:'aberto', regras:['Até 10 anos','Adulto responsável'] },
      { 'Seg-Sex':'08h-20h', 'Sáb-Dom':'08h-21h' }),
    row('areas','Coworking','💻',5,'Wi-Fi 1Gbps · impressora · mesas privativas',
      { status:'aberto', regras:['Silêncio rigoroso','Reuniões com fones de ouvido'],
        dicas:['Café e água gratuitos','Impressora: 10 páginas/dia grátis'] },
      { Todos:'07h-22h' }),
    // ── SERVIÇOS ──────────────────────────────────────
    row('servicos','Wi-Fi & Conectividade','📶',0,'Rede 1Gbps · cobertura total · gratuito',
      { dicas:['Rede: consultar portaria','Velocidade: 1Gbps simétrico'] }),
    row('servicos','Portaria 24h','🏢',1,'Recepção · encomendas · chaves · 24h'),
    row('servicos','Bagageiro Gratuito','🧳',2,'Guarda volumes · check-in antecipado · gratuito'),
    row('servicos','Lavanderia Express','👕',3,'Parceiro a 180m · Seg-Sáb 08h-20h · pago'),
    row('servicos','Delivery Facilitado','🍕',4,'iFood · Rappi · portaria recebe 24h'),
    row('servicos','Concierge Di IA','🎩',5,'Pergunte qualquer coisa 24h · Claude AI'),
    // ── PASSEIOS ──────────────────────────────────────
    row('passeios','Pontos Turísticos','📸',0,'Os imperdíveis da região', {}, {},
      [ { nome:'Cristo Redentor',  icone:'✝️',  descricao:'Monumento mais icônico',        distancia:'12km · ~25min Uber' },
        { nome:'Pão de Açúcar',    icone:'⛰️',  descricao:'Teleférico · vista panorâmica',  distancia:'8km · ~20min Uber'  },
        { nome:'Jardim Botânico',  icone:'🌿',  descricao:'Passeio na natureza',            distancia:'6km · ~15min Uber'  },
        { nome:'Museu do Amanhã',  icone:'🔭',  descricao:'Ciências · Praça Mauá',          distancia:'15km · ~30min Uber' } ]),
    // ── RESTAURANTES ──────────────────────────────────
    row('restaurantes','Ao Redor (500m)','🍽️',0,'Melhores opções a pé',
      { dicas:['Reserve nos fins de semana'] }, {},
      [ { nome:'Botequim Informal',  icone:'🍺', descricao:'Petiscos e chope',      distancia:'80m'  },
        { nome:'Garcia & Rodrigues', icone:'🥗', descricao:'Delicatessen · brunch', distancia:'200m' },
        { nome:'Caranguejo',         icone:'🦀', descricao:'Frutos do mar',          distancia:'350m' } ]),
    // ── PARCERIAS ─────────────────────────────────────
    row('parcerias','Academia Top Fit Plus','🏋️',0,'Plano corporativo para hóspedes',
      { desconto:'30% OFF', tipo_parceria:'Fitness',
        dicas:['Mensalidade R$ 89/mês (normal R$ 129)','Matrícula isenta para hóspedes','Rua N.S. Copacabana 680 · 400m'] },
      {}, [{ nome:'Top Fit Plus', icone:'💪', descricao:'Rua N.S. Copacabana 680', distancia:'400m' }]),
    row('parcerias','Sorriso Dental Copa','🦷',1,'Clínica parceira · atendimento prioritário',
      { desconto:'15% OFF', tipo_parceria:'Saúde',
        dicas:['Consulta de avaliação gratuita','Parcelamento 12x sem juros','(21) 99777-1234 · 300m'] }),
    row('parcerias','Pizzaria Bella Napoli','🍕',2,'Delivery prioritário · frete grátis',
      { desconto:'10% OFF', tipo_parceria:'Gastronomia',
        dicas:['Cupom: CONDO10','Frete grátis para o condo','Funciona até 00h30'] }),
    // ── EMERGÊNCIA ────────────────────────────────────
    row('emergencia','Emergências','🚨',0,'Contatos 24h', {}, {},
      [], [ { nome:'SAMU',numero:'192',icone:'🚑' },{ nome:'Bombeiros',numero:'193',icone:'🚒' },
             { nome:'Polícia',numero:'190',icone:'👮' },{ nome:'Portaria',numero:'',icone:'🏢' } ]),
  ]);
  if (error) console.error('[seedGuiaDemo]', error.message, error.details);
}
