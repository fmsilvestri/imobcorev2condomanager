import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Comunicado {
  id: string; condominio_id: string; titulo: string; corpo: string;
  gerado_por_ia: boolean; created_at: string;
  canais: string[]; categoria: string; publico_alvo: string; prioridade: string;
  status: string; agendado_para?: string; enviado_em?: string;
  total_destinatarios: number; total_entregues: number; total_lidos: number;
  di_gerado: boolean; template_key?: string;
}
interface CanalConfig {
  condominio_id: string; wa_token?: string; wa_numero?: string; wa_instance?: string;
  wa_provider?: string; tg_bot_token?: string; tg_chat_id?: string;
  email_from?: string; email_smtp?: string;
}
interface Regra {
  id: string; nome: string; gatilho: string; canais: string[]; template_key?: string; ativo: boolean; delay_minutos: number;
}
interface OS { id: string; titulo: string; categoria: string; prioridade: string; status: string }
interface Props {
  condId: string; condNome: string; sindicoNome?: string;
  ossAbertas?: OS[];
  showToast: (msg: string, t?: string) => void;
}

// ─── Templates ────────────────────────────────────────────────────────────────
const TEMPLATES: Record<string, { titulo: string; categoria: string; corpo: string; icon: string; tags: string[] }> = {
  manutencao_programada: {
    titulo: "Manutenção preventiva programada", categoria: "manutencao", icon: "🔧", tags: ["manutencao","preventiva"],
    corpo: `Prezados moradores do {CONDO_NOME},\n\nInformamos que será realizada manutenção preventiva em {EQUIPAMENTO} no dia {DATA}.\n\n{IMPACTO}\n\nAtenciosamente,\n{SINDICO_NOME} - Síndico\nDi - Síndica Virtual ImobCore`,
  },
  interrupcao_agua: {
    titulo: "Interrupção no fornecimento de água", categoria: "manutencao", icon: "💧", tags: ["urgente","infra"],
    corpo: `Prezados moradores,\n\nInformamos que haverá interrupção no fornecimento de água das {HORA_INICIO} às {HORA_FIM} do dia {DATA} para manutenção na rede hidráulica.\n\nOrientamos armazenar água com antecedência.\n\nAtenciosamente,\n{SINDICO_NOME} - Síndico`,
  },
  convocacao_assembleia: {
    titulo: "Convocação de Assembleia Geral", categoria: "assembleia", icon: "🗳️", tags: ["assembleia","formal"],
    corpo: `CONVOCAÇÃO DE ASSEMBLEIA GERAL ORDINÁRIA\n\nConvocamos todos os condôminos para a Assembleia que será realizada:\n\n📅 Data: {DATA}\n📍 Local: Salão de Festas - Torre A\n⏰ Hora: {HORA}\n\nPauta:\n{PAUTA}\n\n{SINDICO_NOME} - Síndico`,
  },
  boleto_lembrete: {
    titulo: "Lembrete — boleto condominial", categoria: "financeiro", icon: "💰", tags: ["financeiro","mensal"],
    corpo: `Prezado(a) morador(a),\n\nLembramos que o boleto do condomínio referente a {MES_ANO} vence no dia {DATA_VENC}.\n\n💰 Valor: R$ {VALOR}\n🔗 2ª via: acesse o app ImobCore\n\nEvite multas e juros!\n\nAdministração {CONDO_NOME}`,
  },
  elevador_manutencao: {
    titulo: "Elevador temporariamente fora de serviço", categoria: "manutencao", icon: "🛗", tags: ["manutencao","atencao"],
    corpo: `Prezados moradores,\n\nInformamos que o Elevador {ELEVADOR} está temporariamente fora de serviço para manutenção.\n\n⏰ Previsão de retorno: {DATA_RETORNO}\n↕️ Utilize o Elevador {ALT} durante este período.\n\nPedimos desculpas pelo transtorno.\n{SINDICO_NOME} - Síndico`,
  },
  regras_convivencia: {
    titulo: "Lembrete de regras de convivência", categoria: "aviso_geral", icon: "📋", tags: ["convivencia","periodico"],
    corpo: `Prezados moradores,\n\nLembramos algumas regras importantes de convivência:\n\n🔇 Silêncio após 22h nos finais de semana\n🗑️ Descarte correto do lixo nas lixeiras\n🐾 Pets sempre com coleira nas áreas comuns\n🚗 Vagas somente para veículos cadastrados\n\nContamos com a colaboração de todos!\n{SINDICO_NOME} - Síndico`,
  },
  simulacao_incendio: {
    titulo: "Simulação de incêndio — AVISO", categoria: "seguranca", icon: "🔥", tags: ["seguranca","obrigatorio"],
    corpo: `SIMULAÇÃO DE INCÊNDIO — AVISO IMPORTANTE\n\nInformamos que será realizado exercício de abandono de emergência no dia {DATA} às {HORA}.\n\n⚠️ A sirene soará por aproximadamente 5 minutos.\nNão se alarme — é um exercício obrigatório.\n\nSiga as instruções dos brigadistas.\n{SINDICO_NOME} - Síndico`,
  },
  piscina_fechamento: {
    titulo: "Fechamento temporário da piscina", categoria: "manutencao", icon: "🏊", tags: ["manutencao","lazer"],
    corpo: `Prezados moradores,\n\nA piscina estará fechada temporariamente nos dias {DATAS} para tratamento químico e manutenção preventiva.\n\n🏊 Previsão de reabertura: {DATA_RETORNO}\n\nAgradecemos a compreensão.\n{SINDICO_NOME} - Síndico`,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (d?: string) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDateShort = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
const CANAL_INFO: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  whatsapp: { label: "WhatsApp", icon: "💬", color: "#25D366", bg: "rgba(37,211,102,.12)" },
  telegram: { label: "Telegram", icon: "✈️", color: "#0088CC", bg: "rgba(0,136,204,.12)" },
  app:      { label: "App ImobCore", icon: "📱", color: "#7C5CFC", bg: "rgba(124,92,252,.12)" },
  email:    { label: "E-mail", icon: "✉️", color: "#F59E0B", bg: "rgba(245,158,11,.12)" },
};
const CAT_INFO: Record<string, { label: string; color: string }> = {
  manutencao:  { label: "Manutenção", color: "#F59E0B" },
  financeiro:  { label: "Financeiro", color: "#10B981" },
  seguranca:   { label: "Segurança", color: "#EF4444" },
  assembleia:  { label: "Assembleia", color: "#6366F1" },
  aviso_geral: { label: "Aviso Geral", color: "#94A3B8" },
  emergencia:  { label: "🚨 Emergência", color: "#DC2626" },
};
const PRIO_INFO: Record<string, { label: string; color: string; bg: string }> = {
  normal:  { label: "Normal",  color: "#94A3B8", bg: "rgba(148,163,184,.1)" },
  alta:    { label: "Alta",    color: "#F59E0B", bg: "rgba(245,158,11,.1)" },
  urgente: { label: "Urgente", color: "#EF4444", bg: "rgba(239,68,68,.1)" },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

// Canal Selector Pills
function CanalSelector({ selected, onChange, cfg }: { selected: string[]; onChange: (v: string[]) => void; cfg: CanalConfig | null }) {
  const canais = ["whatsapp","telegram","app","email"];
  const isCfg = (c: string) => {
    if (c === "whatsapp") return !!(cfg?.wa_token && cfg?.wa_instance);
    if (c === "telegram") return !!(cfg?.tg_bot_token && cfg?.tg_chat_id);
    if (c === "app") return true;
    if (c === "email") return !!(cfg?.email_smtp);
    return false;
  };
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter(x => x !== c) : [...selected, c]);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {canais.map(c => {
        const info = CANAL_INFO[c];
        const on = selected.includes(c);
        const configured = isCfg(c);
        return (
          <button key={c} onClick={() => toggle(c)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${on ? info.color : "rgba(148,163,184,.2)"}`, background: on ? info.bg : "transparent", color: on ? info.color : "#94A3B8", cursor: "pointer", fontSize: 12, fontWeight: on ? 700 : 400, transition: "all .15s" }}>
            <span>{info.icon}</span>
            <span>{info.label}</span>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: configured ? "#10B981" : "#EF4444", display: "inline-block" }} title={configured ? "Configurado" : "Não configurado"} />
          </button>
        );
      })}
    </div>
  );
}

// Di Insight Strip
function DiInsightStrip({ condNome, sindicoNome, categoria, ossAbertas, onGerar, loading }: {
  condNome: string; sindicoNome: string; categoria: string; ossAbertas: OS[];
  onGerar: (titulo?: string) => void; loading: boolean;
}) {
  const ossUrgentes = ossAbertas.filter(o => o.prioridade === "urgente" && o.status !== "fechada");
  const sugestao = ossUrgentes.length > 0
    ? `baseado nas ${ossUrgentes.length} OS(s) urgente(s) abertas (${ossUrgentes[0]?.titulo?.slice(0, 30)}...), enviar aviso aos moradores`
    : categoria === "manutencao" ? "enviar aviso sobre manutenção preventiva programada"
    : categoria === "financeiro" ? "lembrete de vencimento do boleto condominial"
    : "enviar comunicado geral aos moradores";

  return (
    <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,.08) 0%, rgba(168,85,247,.06) 100%)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 28, flexShrink: 0 }}>🤖</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#818CF8", fontWeight: 700, marginBottom: 3 }}>Di sugere</div>
        <div style={{ fontSize: 12, color: "#C4B5FD", lineHeight: 1.4 }}>Com base no contexto atual do {condNome}: {sugestao}</div>
      </div>
      <button onClick={() => onGerar(ossUrgentes[0]?.titulo)} disabled={loading} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(139,92,246,.4)", background: "rgba(139,92,246,.15)", color: "#A78BFA", cursor: loading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
        {loading ? "⏳ Gerando..." : "✨ Di gera texto"}
      </button>
    </div>
  );
}

// WA Preview
function WAPreview({ titulo, corpo, condNome }: { titulo: string; corpo: string; condNome: string }) {
  const max = 1000;
  const msg = `📢 *${condNome}*\n\n*${titulo}*\n\n${corpo}\n\n_via ImobCore · Síndica Virtual Di_`;
  const over = msg.length > max;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#25D366", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <span>💬</span> Preview WhatsApp
        <span style={{ marginLeft: "auto", color: over ? "#EF4444" : "#64748B", fontWeight: 400 }}>{msg.length}/{max}</span>
      </div>
      <div style={{ background: "#0A1F13", border: "1px solid rgba(37,211,102,.2)", borderRadius: 10, padding: 12, minHeight: 120 }}>
        <div style={{ background: "#1A3A22", borderRadius: 8, padding: "10px 12px", maxWidth: "85%" }}>
          <div style={{ fontSize: 11, color: "#25D366", fontWeight: 700, marginBottom: 4 }}>📢 {condNome}</div>
          <div style={{ fontSize: 11, color: "#E2E8F0", fontWeight: 700, marginBottom: 4 }}>{titulo || "(título)"}</div>
          <div style={{ fontSize: 11, color: "#CBD5E1", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{corpo || "(corpo do comunicado)"}</div>
          <div style={{ fontSize: 9, color: "#25D366", marginTop: 6 }}>via ImobCore · Síndica Virtual Di</div>
        </div>
      </div>
    </div>
  );
}

// TG Preview
function TGPreview({ titulo, corpo, condNome }: { titulo: string; corpo: string; condNome: string }) {
  const max = 4096;
  const msg = `🏢 ${condNome}\n\n${titulo}\n\n${corpo}\n\nImobCore v2 · Di - Síndica Virtual`;
  const over = msg.length > max;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#0088CC", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <span>✈️</span> Preview Telegram
        <span style={{ marginLeft: "auto", color: over ? "#EF4444" : "#64748B", fontWeight: 400 }}>{msg.length}/{max}</span>
      </div>
      <div style={{ background: "#0A1929", border: "1px solid rgba(0,136,204,.2)", borderRadius: 10, padding: 12, minHeight: 120 }}>
        <div style={{ background: "#112233", borderRadius: 8, padding: "10px 12px", maxWidth: "85%", borderLeft: "3px solid #0088CC" }}>
          <div style={{ fontSize: 11, color: "#38BDF8", fontWeight: 700, marginBottom: 4 }}>🏢 {condNome}</div>
          <div style={{ fontSize: 11, color: "#E2E8F0", fontWeight: 700, marginBottom: 4 }}>{titulo || "(título)"}</div>
          <div style={{ fontSize: 11, color: "#CBD5E1", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{corpo || "(corpo do comunicado)"}</div>
          <div style={{ fontSize: 9, color: "#0088CC", marginTop: 6 }}>ImobCore v2 · Di - Síndica Virtual</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ComunicadosModule({ condId, condNome, sindicoNome = "Síndico", ossAbertas = [], showToast }: Props) {
  const [tab, setTab] = useState<"novo"|"templates"|"historico"|"agendados"|"metricas">("novo");
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [cfg, setCfg] = useState<CanalConfig | null>(null);
  const [loading, setLoading] = useState(false);

  // Composer state
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [categoria, setCategoria] = useState("aviso_geral");
  const [publicoAlvo, setPublicoAlvo] = useState("todos");
  const [prioridade, setPrioridade] = useState("normal");
  const [canais, setCanais] = useState<string[]>(["app"]);
  const [agendarPara, setAgendarPara] = useState("");
  const [diLoading, setDiLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [templateKey, setTemplateKey] = useState<string | undefined>();

  // Historico state
  const [histFiltro, setHistFiltro] = useState("todos");
  const [histBusca, setHistBusca] = useState("");

  // Metricas state
  const [relLoading, setRelLoading] = useState(false);
  const [relatorio, setRelatorio] = useState("");

  // Canal config edit
  const [showCfgEdit, setShowCfgEdit] = useState(false);
  const [cfgForm, setCfgForm] = useState<Partial<CanalConfig>>({});

  const loadData = useCallback(async () => {
    if (!condId) return;
    setLoading(true);
    try {
      const [comRes, cfgRes, regRes] = await Promise.allSettled([
        fetch(`/api/comunicados?condominio_id=${condId}`).then(r => r.json()),
        fetch(`/api/comunicados/canal-config?condominio_id=${condId}`).then(r => r.json()),
        fetch(`/api/comunicados/regras?condominio_id=${condId}`).then(r => r.json()),
      ]);
      if (comRes.status === "fulfilled" && Array.isArray(comRes.value)) setComunicados(comRes.value);
      if (cfgRes.status === "fulfilled" && !cfgRes.value?.error) { setCfg(cfgRes.value); setCfgForm(cfgRes.value); }
      if (regRes.status === "fulfilled" && Array.isArray(regRes.value)) setRegras(regRes.value);
    } finally { setLoading(false); }
  }, [condId]);

  useEffect(() => { loadData(); }, [loadData]);

  const applyTemplate = (key: string) => {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    setTemplateKey(key);
    setCategoria(tpl.categoria);
    const corpoFilled = tpl.corpo
      .replace(/{CONDO_NOME}/g, condNome)
      .replace(/{SINDICO_NOME}/g, sindicoNome)
      .replace(/{DATA}/g, new Date(Date.now() + 7*24*3600*1000).toLocaleDateString("pt-BR"))
      .replace(/{HORA}/g, "19h30")
      .replace(/{MES_ANO}/g, new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
    setTitulo(tpl.titulo);
    setCorpo(corpoFilled);
    setTab("novo");
    showToast(`Template "${tpl.titulo}" carregado`, "success");
  };

  const gerarComDi = async (tituloBase?: string) => {
    setDiLoading(true);
    try {
      const ossRel = ossAbertas.filter(o => o.status !== "fechada").slice(0, 5);
      const r = await fetch("/api/comunicados/gerar-com-di", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condominio_id: condId, condominio_nome: condNome, sindico_nome: sindicoNome, categoria, titulo_base: tituloBase || titulo, oss_abertas: ossRel })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setTitulo(data.titulo || titulo);
      setCorpo(data.corpo);
      showToast("✅ Di gerou o texto do comunicado", "success");
    } catch (e: any) { showToast(e.message || "Erro ao gerar com Di", "error"); }
    setDiLoading(false);
  };

  const salvarRascunho = async () => {
    if (!titulo.trim() || !corpo.trim()) { showToast("Título e corpo são obrigatórios", "warn"); return; }
    try {
      const r = await fetch("/api/comunicados", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condominio_id: condId, titulo, corpo, categoria, publico_alvo: publicoAlvo, prioridade, canais, agendado_para: agendarPara || null, template_key: templateKey, di_gerado: diLoading })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      showToast("📝 Rascunho salvo", "success");
      setComunicados(prev => [data.comunicado, ...prev.filter(c => c.id !== data.comunicado.id)]);
      resetComposer();
    } catch (e: any) { showToast(e.message, "error"); }
  };

  const enviarComunicado = async (canalList?: string[]) => {
    if (!titulo.trim() || !corpo.trim()) { showToast("Título e corpo são obrigatórios", "warn"); return; }
    const canaisEnvio = canalList || canais;
    if (!canaisEnvio.length) { showToast("Selecione ao menos um canal", "warn"); return; }
    setEnviando(true);
    try {
      // First save
      const saveRes = await fetch("/api/comunicados", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condominio_id: condId, titulo, corpo, categoria, publico_alvo: publicoAlvo, prioridade, canais: canaisEnvio, template_key: templateKey, di_gerado: false })
      });
      const saved = await saveRes.json();
      if (saved.error) throw new Error(saved.error);
      // Then send
      const sendRes = await fetch(`/api/comunicados/${saved.comunicado.id}/enviar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condominio_id: condId, canais: canaisEnvio })
      });
      const sendData = await sendRes.json();
      if (sendData.error) throw new Error(sendData.error);
      showToast(`✅ Comunicado enviado via ${canaisEnvio.join(" + ")}`, "success");
      await loadData();
      resetComposer();
    } catch (e: any) { showToast(e.message, "error"); }
    setEnviando(false);
  };

  const enviarExistente = async (id: string) => {
    const com = comunicados.find(c => c.id === id);
    if (!com) return;
    try {
      const r = await fetch(`/api/comunicados/${id}/enviar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condominio_id: condId, canais: com.canais?.length ? com.canais : ["app"] })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      showToast("✅ Comunicado reenviado", "success");
      await loadData();
    } catch (e: any) { showToast(e.message, "error"); }
  };

  const deletarComunicado = async (id: string) => {
    if (!window.confirm("Excluir este comunicado?")) return;
    const r = await fetch(`/api/comunicados/${id}`, { method: "DELETE" });
    if (r.ok) { setComunicados(prev => prev.filter(c => c.id !== id)); showToast("Removido", "success"); }
  };

  const reenviarComposer = (com: Comunicado) => {
    setTitulo(com.titulo); setCorpo(com.corpo); setCategoria(com.categoria);
    setPublicoAlvo(com.publico_alvo); setPrioridade(com.prioridade);
    setCanais(com.canais?.length ? com.canais : ["app"]);
    setTemplateKey(com.template_key);
    setTab("novo");
  };

  const resetComposer = () => {
    setTitulo(""); setCorpo(""); setCategoria("aviso_geral"); setPublicoAlvo("todos");
    setPrioridade("normal"); setCanais(["app"]); setAgendarPara(""); setTemplateKey(undefined);
  };

  const salvarCanalConfig = async () => {
    try {
      const r = await fetch("/api/comunicados/canal-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condominio_id: condId, ...cfgForm })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setCfg({ ...cfg, ...cfgForm } as CanalConfig);
      setShowCfgEdit(false);
      showToast("✅ Configuração salva", "success");
    } catch (e: any) { showToast(e.message, "error"); }
  };

  const gerarRelatorio = async () => {
    setRelLoading(true);
    try {
      const total = comunicados.filter(c => c.status === "enviado").length;
      const diTotal = comunicados.filter(c => c.di_gerado).length;
      const entregues = comunicados.reduce((a, c) => a + (c.total_entregues || 0), 0);
      const lidos = comunicados.reduce((a, c) => a + (c.total_lidos || 0), 0);
      const r = await fetch("/api/comunicados/gerar-com-di", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          condominio_id: condId, condominio_nome: condNome, sindico_nome: sindicoNome,
          categoria: "aviso_geral",
          titulo_base: `Relatório de engajamento de comunicados: ${total} enviados, ${diTotal} gerados por Di, ${entregues} entregues, ${lidos} lidos.`,
          oss_abertas: []
        })
      });
      const data = await r.json();
      setRelatorio(data.corpo || "");
    } catch (e: any) { showToast(e.message, "error"); }
    setRelLoading(false);
  };

  // Computed stats
  const enviados = comunicados.filter(c => c.status === "enviado");
  const agendados = comunicados.filter(c => c.status === "agendado");
  const rascunhos = comunicados.filter(c => c.status === "rascunho");
  const totalEntregues = enviados.reduce((a, c) => a + (c.total_entregues || 0), 0);
  const totalLidos = enviados.reduce((a, c) => a + (c.total_lidos || 0), 0);
  const diGerados = comunicados.filter(c => c.di_gerado).length;
  const taxaEntrega = enviados.length > 0 && totalEntregues > 0 ? Math.round(totalEntregues / Math.max(enviados.reduce((a, c) => a + (c.total_destinatarios || 0), 0), 1) * 100) : 0;

  // Historico filters
  const comsFiltrados = comunicados.filter(c => {
    const matchFiltro = histFiltro === "todos" ? true : histFiltro === "di" ? c.di_gerado : c.canais?.includes(histFiltro);
    const matchBusca = !histBusca || c.titulo.toLowerCase().includes(histBusca.toLowerCase()) || c.corpo.toLowerCase().includes(histBusca.toLowerCase());
    return matchFiltro && matchBusca;
  });

  // ─── Styles ────────────────────────────────────────────────────────────────
  const s = {
    wrap: { color: "#E2E8F0", fontFamily: "Inter, system-ui, sans-serif" } as React.CSSProperties,
    tabRow: { display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(148,163,184,.1)", paddingBottom: 0 } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({ padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", background: active ? "rgba(99,102,241,.12)" : "transparent", color: active ? "#A5B4FC" : "#64748B", cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400, borderBottom: active ? "2px solid #6366F1" : "2px solid transparent" }),
    label: { fontSize: 11, color: "#94A3B8", fontWeight: 600, marginBottom: 5, display: "block" } as React.CSSProperties,
    input: { width: "100%", background: "rgba(15,23,42,.8)", border: "1px solid rgba(148,163,184,.15)", borderRadius: 8, padding: "9px 12px", color: "#E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" as const },
    select: { width: "100%", background: "#1E293B", border: "1px solid rgba(148,163,184,.15)", borderRadius: 8, padding: "9px 12px", color: "#E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" as const },
    textarea: { width: "100%", background: "rgba(15,23,42,.8)", border: "1px solid rgba(148,163,184,.15)", borderRadius: 8, padding: "9px 12px", color: "#E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" as const, resize: "vertical" as const, minHeight: 140, fontFamily: "inherit", lineHeight: 1.6 },
    btn: (color: string, bg: string): React.CSSProperties => ({ padding: "8px 16px", borderRadius: 8, border: `1px solid ${color}44`, background: bg, color, cursor: "pointer", fontSize: 12, fontWeight: 700 }),
    card: { background: "rgba(30,41,59,.5)", border: "1px solid rgba(148,163,184,.1)", borderRadius: 10, padding: 14, marginBottom: 10 } as React.CSSProperties,
    badge: (color: string, bg: string): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${color}33` }),
    kpi: { background: "rgba(30,41,59,.6)", border: "1px solid rgba(148,163,184,.1)", borderRadius: 10, padding: 16, textAlign: "center" as const, flex: 1 },
  };

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#E0E7FF" }}>📢 Central de Comunicados</div>
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>WhatsApp · Telegram · App · E-mail — Potencializado pela Di IA</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {loading && <span style={{ fontSize: 11, color: "#64748B", alignSelf: "center" }}>⏳ carregando...</span>}
          <button onClick={() => setShowCfgEdit(true)} style={s.btn("#94A3B8", "rgba(148,163,184,.08)")}>⚙️ Canais</button>
          <button onClick={() => { resetComposer(); setTab("novo"); }} style={s.btn("#A5B4FC", "rgba(99,102,241,.1)")}>＋ Novo</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabRow}>
        {([["novo","✍️ Novo"],["templates","📚 Templates"],["historico","📋 Histórico"],["agendados","🗓️ Agendados"],["metricas","📊 Métricas"]] as const).map(([k, l]) => (
          <button key={k} style={s.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ── TAB: NOVO ────────────────────────────────────────────────────────── */}
      {tab === "novo" && (
        <div>
          <DiInsightStrip condNome={condNome} sindicoNome={sindicoNome} categoria={categoria} ossAbertas={ossAbertas} onGerar={gerarComDi} loading={diLoading} />

          {/* Canal selector */}
          <label style={s.label}>📡 Canais de envio</label>
          <CanalSelector selected={canais} onChange={setCanais} cfg={cfg} />

          {/* Form row 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>CATEGORIA</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)} style={s.select}>
                {Object.entries(CAT_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>PÚBLICO-ALVO</label>
              <select value={publicoAlvo} onChange={e => setPublicoAlvo(e.target.value)} style={s.select}>
                <option value="todos">Todos os moradores</option>
                <option value="conselho">Conselho</option>
                <option value="torre_a">Torre A</option>
                <option value="torre_b">Torre B</option>
                <option value="inadimplentes">Inadimplentes</option>
              </select>
            </div>
            <div>
              <label style={s.label}>PRIORIDADE</label>
              <select value={prioridade} onChange={e => setPrioridade(e.target.value)} style={s.select}>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">🚨 Urgente</option>
              </select>
            </div>
          </div>

          {/* Titulo */}
          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>TÍTULO *</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título do comunicado..." style={s.input} />
          </div>

          {/* Corpo */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...s.label, display: "flex", justifyContent: "space-between" }}>
              <span>CORPO *</span>
              <span style={{ color: corpo.length > 900 ? "#EF4444" : "#64748B" }}>{corpo.length}/1000</span>
            </label>
            <textarea value={corpo} onChange={e => setCorpo(e.target.value)} placeholder="Texto do comunicado para os moradores..." style={{ ...s.textarea, borderColor: corpo.length > 1000 ? "rgba(239,68,68,.5)" : undefined }} />
          </div>

          {/* Agendar */}
          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>🗓️ AGENDAR ENVIO (opcional)</label>
            <input type="datetime-local" value={agendarPara} onChange={e => setAgendarPara(e.target.value)} style={{ ...s.input, maxWidth: 280 }} />
          </div>

          {/* Preview side-by-side */}
          {(titulo || corpo) && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {canais.includes("whatsapp") && <WAPreview titulo={titulo} corpo={corpo} condNome={condNome} />}
              {canais.includes("telegram") && <TGPreview titulo={titulo} corpo={corpo} condNome={condNome} />}
              {!canais.includes("whatsapp") && !canais.includes("telegram") && (
                <div style={{ flex: 1, background: "rgba(30,41,59,.4)", border: "1px solid rgba(148,163,184,.1)", borderRadius: 10, padding: 16, color: "#475569", fontSize: 12 }}>
                  Selecione WhatsApp ou Telegram para ver o preview formatado
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={salvarRascunho} disabled={enviando} style={s.btn("#94A3B8", "rgba(148,163,184,.08)")}>📝 Salvar rascunho</button>
            {canais.includes("whatsapp") && (
              <button onClick={() => enviarComunicado(["whatsapp"])} disabled={enviando} style={s.btn("#25D366", "rgba(37,211,102,.1)")}>💬 Enviar WA</button>
            )}
            {canais.includes("telegram") && (
              <button onClick={() => enviarComunicado(["telegram"])} disabled={enviando} style={s.btn("#0088CC", "rgba(0,136,204,.1)")}>✈️ Enviar TG</button>
            )}
            {canais.length > 1 && (
              <button onClick={() => enviarComunicado()} disabled={enviando} style={s.btn("#6366F1", "rgba(99,102,241,.12)")}>
                {enviando ? "⏳ Enviando..." : `🚀 Enviar todos (${canais.length})`}
              </button>
            )}
            {canais.length === 1 && !canais.includes("whatsapp") && !canais.includes("telegram") && (
              <button onClick={() => enviarComunicado()} disabled={enviando} style={s.btn("#6366F1", "rgba(99,102,241,.12)")}>
                {enviando ? "⏳ Enviando..." : "🚀 Enviar"}
              </button>
            )}
            {templateKey && <span style={s.badge("#94A3B8", "rgba(148,163,184,.1)")}>📄 template: {TEMPLATES[templateKey]?.icon} {TEMPLATES[templateKey]?.titulo?.slice(0,25)}...</span>}
          </div>
        </div>
      )}

      {/* ── TAB: TEMPLATES ───────────────────────────────────────────────────── */}
      {tab === "templates" && (
        <div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>Clique em um template para pré-preencher o compositor. 8 templates disponíveis.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {Object.entries(TEMPLATES).map(([key, tpl]) => (
              <div key={key} onClick={() => applyTemplate(key)} style={{ ...s.card, cursor: "pointer", transition: "all .15s", borderColor: "rgba(99,102,241,.15)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(99,102,241,.4)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(30,41,59,.8)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(99,102,241,.15)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(30,41,59,.5)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 28 }}>{tpl.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", lineHeight: 1.3 }}>{tpl.titulo}</div>
                    <span style={s.badge(CAT_INFO[tpl.categoria]?.color || "#94A3B8", `${CAT_INFO[tpl.categoria]?.color || "#94A3B8"}15`)}>{CAT_INFO[tpl.categoria]?.label}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {tpl.corpo.slice(0, 120)}...
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                  {tpl.tags.map(t => <span key={t} style={s.badge("#475569", "rgba(71,85,105,.1)")}>{t}</span>)}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "#6366F1", fontWeight: 700 }}>→ Usar template</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: HISTÓRICO ───────────────────────────────────────────────────── */}
      {tab === "historico" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input value={histBusca} onChange={e => setHistBusca(e.target.value)} placeholder="🔍 Buscar..." style={{ ...s.input, maxWidth: 220, flex: "0 0 auto" }} />
            {["todos","whatsapp","telegram","app","email","di"].map(f => (
              <button key={f} onClick={() => setHistFiltro(f)} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${histFiltro === f ? "#6366F1" : "rgba(148,163,184,.2)"}`, background: histFiltro === f ? "rgba(99,102,241,.12)" : "transparent", color: histFiltro === f ? "#A5B4FC" : "#64748B", cursor: "pointer", fontSize: 11, fontWeight: histFiltro === f ? 700 : 400 }}>
                {f === "di" ? "✨ Di IA" : f === "todos" ? "Todos" : CANAL_INFO[f]?.icon + " " + CANAL_INFO[f]?.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>{comsFiltrados.length} comunicado(s)</div>
          {comsFiltrados.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 13 }}>Nenhum comunicado encontrado</div>}
          {comsFiltrados.map(c => (
            <div key={c.id} style={s.card}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{c.titulo}</span>
                    {c.di_gerado && <span style={s.badge("#A78BFA", "rgba(167,139,250,.1)")}>✨ Di IA</span>}
                    <span style={s.badge(PRIO_INFO[c.prioridade]?.color || "#94A3B8", PRIO_INFO[c.prioridade]?.bg || "rgba(148,163,184,.1)")}>{PRIO_INFO[c.prioridade]?.label}</span>
                    <span style={{ ...s.badge(c.status === "enviado" ? "#10B981" : c.status === "agendado" ? "#F59E0B" : "#64748B", c.status === "enviado" ? "rgba(16,185,129,.1)" : c.status === "agendado" ? "rgba(245,158,11,.1)" : "rgba(100,116,139,.1)") }}>{c.status === "enviado" ? "✅ Enviado" : c.status === "agendado" ? "🗓️ Agendado" : "📝 Rascunho"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 6 }}>{c.corpo}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {(c.canais || ["app"]).map(can => (
                      <span key={can} style={s.badge(CANAL_INFO[can]?.color || "#64748B", `${CANAL_INFO[can]?.color || "#64748B"}15`)}>{CANAL_INFO[can]?.icon} {CANAL_INFO[can]?.label}</span>
                    ))}
                    <span style={{ fontSize: 10, color: "#475569" }}>{fmtDate(c.enviado_em || c.created_at)}</span>
                    {c.status === "enviado" && c.total_destinatarios > 0 && (
                      <span style={{ fontSize: 10, color: "#64748B" }}>· {c.total_entregues}/{c.total_destinatarios} entregues · {c.total_lidos} lidos</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => reenviarComposer(c)} title="Reenviar" style={s.btn("#6366F1", "rgba(99,102,241,.08)")}>↩️</button>
                  {c.status === "rascunho" && <button onClick={() => enviarExistente(c.id)} title="Enviar agora" style={s.btn("#10B981", "rgba(16,185,129,.08)")}>🚀</button>}
                  <button onClick={() => deletarComunicado(c.id)} title="Excluir" style={s.btn("#EF4444", "rgba(239,68,68,.08)")}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: AGENDADOS ───────────────────────────────────────────────────── */}
      {tab === "agendados" && (
        <div>
          {/* Agendamentos */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 10 }}>📅 Envios agendados ({agendados.length})</div>
          {agendados.length === 0 && <div style={{ ...s.card, color: "#475569", textAlign: "center", padding: 24, fontSize: 12 }}>Nenhum envio agendado. Use o campo "Agendar envio" no compositor.</div>}
          {agendados.map(c => (
            <div key={c.id} style={s.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{c.titulo}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>📅 {fmtDate(c.agendado_para)}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {(c.canais || []).map(can => <span key={can} style={s.badge(CANAL_INFO[can]?.color || "#64748B", `${CANAL_INFO[can]?.color}15`)}>{CANAL_INFO[can]?.icon} {CANAL_INFO[can]?.label}</span>)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => reenviarComposer(c)} style={s.btn("#6366F1", "rgba(99,102,241,.08)")}>✏️ Editar</button>
                  <button onClick={() => deletarComunicado(c.id)} style={s.btn("#EF4444", "rgba(239,68,68,.08)")}>✕ Cancelar</button>
                </div>
              </div>
            </div>
          ))}

          {/* Regras automáticas */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginTop: 20, marginBottom: 10 }}>⚡ Regras automáticas ({regras.length})</div>
          {regras.length === 0 && (
            <div style={{ ...s.card, color: "#475569" }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>Nenhuma regra configurada. Abaixo as regras disponíveis para ativar:</div>
              {[
                { gatilho: "os_urgente_aberta", nome: "OS urgente → aviso moradores", canais: ["whatsapp","telegram"], delay: 5 },
                { gatilho: "boleto_mensal", nome: "Boleto mensal → lembrete dia 5", canais: ["whatsapp","app"], delay: 0 },
                { gatilho: "plano_manutencao_7d", nome: "Plano manutenção → aviso 7 dias antes", canais: ["app"], delay: 0 },
                { gatilho: "sensor_alerta_critico", nome: "Sensor crítico → notifica síndico", canais: ["telegram"], delay: 0 },
              ].map(r => (
                <div key={r.gatilho} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(148,163,184,.08)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{r.nome}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      {r.canais.map(c => <span key={c} style={s.badge(CANAL_INFO[c]?.color || "#64748B", `${CANAL_INFO[c]?.color}15`)}>{CANAL_INFO[c]?.icon}</span>)}
                      {r.delay > 0 && <span style={s.badge("#64748B", "rgba(100,116,139,.1)")}>⏱ {r.delay}min</span>}
                    </div>
                  </div>
                  <span style={s.badge("#F59E0B", "rgba(245,158,11,.1)")}>Apply Migration 14</span>
                </div>
              ))}
            </div>
          )}
          {regras.map(r => (
            <div key={r.id} style={s.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{r.nome}</span>
                    <span style={r.ativo ? s.badge("#10B981", "rgba(16,185,129,.1)") : s.badge("#EF4444", "rgba(239,68,68,.1)")}>{r.ativo ? "✅ Ativa" : "❌ Inativa"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>gatilho: <code style={{ color: "#94A3B8" }}>{r.gatilho}</code> · delay: {r.delay_minutos}min</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    {(r.canais || []).map(c => <span key={c} style={s.badge(CANAL_INFO[c]?.color || "#64748B", `${CANAL_INFO[c]?.color}15`)}>{CANAL_INFO[c]?.icon} {CANAL_INFO[c]?.label}</span>)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: MÉTRICAS ────────────────────────────────────────────────────── */}
      {tab === "metricas" && (
        <div>
          {/* KPIs */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { label: "Total enviados", valor: enviados.length, icon: "📤", color: "#6366F1" },
              { label: "Taxa entrega", valor: `${taxaEntrega}%`, icon: "✅", color: "#10B981" },
              { label: "Total lidos", valor: totalLidos, icon: "👁️", color: "#38BDF8" },
              { label: "Gerados por Di", valor: diGerados, icon: "✨", color: "#A78BFA" },
            ].map(k => (
              <div key={k.label} style={s.kpi}>
                <div style={{ fontSize: 24 }}>{k.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: k.color, margin: "4px 0" }}>{k.valor}</div>
                <div style={{ fontSize: 10, color: "#64748B" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* By canal */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 10 }}>Por canal</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            {Object.entries(CANAL_INFO).map(([key, info]) => {
              const count = comunicados.filter(c => c.canais?.includes(key)).length;
              const pct = comunicados.length > 0 ? Math.round(count / comunicados.length * 100) : 0;
              return (
                <div key={key} style={{ ...s.card, flex: 1, minWidth: 120, margin: 0 }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{info.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: info.color }}>{count}</div>
                  <div style={{ fontSize: 10, color: "#64748B", marginBottom: 8 }}>{info.label}</div>
                  <div style={{ height: 4, background: "rgba(148,163,184,.1)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: info.color, borderRadius: 2, transition: "width .4s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* By categoria */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 10 }}>Por categoria</div>
          <div style={{ ...s.card, marginBottom: 20 }}>
            {Object.entries(CAT_INFO).map(([key, info]) => {
              const count = comunicados.filter(c => c.categoria === key).length;
              if (count === 0) return null;
              const pct = comunicados.length > 0 ? Math.round(count / comunicados.length * 100) : 0;
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", width: 100, flexShrink: 0 }}>{info.label}</div>
                  <div style={{ flex: 1, height: 6, background: "rgba(148,163,184,.1)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: info.color, borderRadius: 3, transition: "width .4s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: info.color, fontWeight: 700, width: 30, textAlign: "right" }}>{count}</div>
                </div>
              );
            })}
          </div>

          {/* Di relatório */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>✨ Relatório de engajamento — Di</div>
            <button onClick={gerarRelatorio} disabled={relLoading} style={s.btn("#A78BFA", "rgba(167,139,250,.1)")}>
              {relLoading ? "⏳ Gerando..." : "Di gera relatório"}
            </button>
          </div>
          {relatorio && (
            <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 10, padding: 16, fontSize: 12, color: "#CBD5E1", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {relatorio}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: CONFIG CANAIS ─────────────────────────────────────────────── */}
      {showCfgEdit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && setShowCfgEdit(false)}>
          <div style={{ background: "#1E293B", border: "1px solid rgba(99,102,241,.3)", borderRadius: 14, padding: 28, width: 520, maxWidth: "95vw", maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#E0E7FF", marginBottom: 20 }}>⚙️ Configuração de Canais</div>

            {/* WhatsApp */}
            <div style={{ background: "rgba(37,211,102,.05)", border: "1px solid rgba(37,211,102,.2)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#25D366", marginBottom: 10 }}>💬 WhatsApp via Z-API</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={s.label}>Instance ID</label>
                  <input value={cfgForm.wa_instance || ""} onChange={e => setCfgForm(p => ({ ...p, wa_instance: e.target.value }))} placeholder="sua-instance-id" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Token</label>
                  <input value={cfgForm.wa_token || ""} onChange={e => setCfgForm(p => ({ ...p, wa_token: e.target.value }))} placeholder="seu-token-zapi" type="password" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Número (formato 5548...)</label>
                  <input value={cfgForm.wa_numero || ""} onChange={e => setCfgForm(p => ({ ...p, wa_numero: e.target.value }))} placeholder="5548999999999" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Provider</label>
                  <select value={cfgForm.wa_provider || "zapi"} onChange={e => setCfgForm(p => ({ ...p, wa_provider: e.target.value }))} style={s.select}>
                    <option value="zapi">Z-API</option>
                    <option value="twilio">Twilio</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Telegram */}
            <div style={{ background: "rgba(0,136,204,.05)", border: "1px solid rgba(0,136,204,.2)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0088CC", marginBottom: 10 }}>✈️ Telegram Bot</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={s.label}>Bot Token (via @BotFather)</label>
                  <input value={cfgForm.tg_bot_token || ""} onChange={e => setCfgForm(p => ({ ...p, tg_bot_token: e.target.value }))} placeholder="123456:ABC..." type="password" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Chat ID do grupo</label>
                  <input value={cfgForm.tg_chat_id || ""} onChange={e => setCfgForm(p => ({ ...p, tg_chat_id: e.target.value }))} placeholder="-1001234567890" style={s.input} />
                </div>
              </div>
            </div>

            {/* Email */}
            <div style={{ background: "rgba(245,158,11,.05)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", marginBottom: 10 }}>✉️ E-mail SMTP</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={s.label}>SMTP Host</label>
                  <input value={cfgForm.email_smtp || ""} onChange={e => setCfgForm(p => ({ ...p, email_smtp: e.target.value }))} placeholder="smtp.gmail.com" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>From (e-mail)</label>
                  <input value={cfgForm.email_from || ""} onChange={e => setCfgForm(p => ({ ...p, email_from: e.target.value }))} placeholder="sindico@condo.com.br" style={s.input} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCfgEdit(false)} style={s.btn("#64748B", "rgba(100,116,139,.1)")}>Cancelar</button>
              <button onClick={salvarCanalConfig} style={s.btn("#6366F1", "rgba(99,102,241,.12)")}>✅ Salvar configuração</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
