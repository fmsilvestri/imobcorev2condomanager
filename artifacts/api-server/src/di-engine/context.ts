import { supabase } from "../lib/supabase.js";
import { type Perfil, CATALOGO_MODULOS, getAcoesPorPerfil } from "./modulos.js";

export type { Perfil };

export interface DiSnapshot {
  condNome?: string;
  condCidade?: string;
  sindico?: string;
  totalUnidades?: number;
  totalMoradores?: number;
  osAbertas?: number;
  osUrgentes?: number;
  saldo?: number;
  inadPct?: number;
  nivelAgua?: number | null;
  nomeGestor?: string;
}

export interface DiCtx {
  systemPrompt: string;
  nomeDi: string;
  tomComunicacao: string;
  modulosAtivos: string[];
  limiteFinanceiro: number;
  diAtiva: boolean;
}

// Mapa de tom → descrição legível usada no system prompt
// Valores aceitos pelo DB: direto_empatico | formal | amigavel
const TOM_LABEL: Record<string, string> = {
  direto_empatico: "direto e empático, próximo sem ser informal",
  formal:          "formal e profissional, linguagem institucional",
  amigavel:        "amigável, acolhedor e próximo",
  suave:           "suave e acolhedor, paciente",
  tecnico:         "técnico e objetivo, sem rodeios",
};

const FALLBACK_IDENTIDADE = `Você é Di, a Síndica Virtual Inteligente do ImobCore — especialista em gestão condominial.
Personalidade: direto e empático, próximo sem ser informal. Fale em português brasileiro natural com emojis moderados.
Sempre responda com base nos dados reais fornecidos. Nunca invente informações.`;

function substituirVars(texto: string, snap: DiSnapshot, cfg: {
  nome_di: string;
  tom_comunicacao: string;
  limite_financeiro: number;
  modulos_ativos: string[];
}): string {
  const tomLabel = TOM_LABEL[cfg.tom_comunicacao] ?? cfg.tom_comunicacao;
  const modulosStr = cfg.modulos_ativos.join(", ") || "todos";

  return texto
    .replace(/\{\{nome_condominio\}\}/g, snap.condNome || "Condomínio")
    .replace(/\{\{total_unidades\}\}/g, String(snap.totalUnidades || 0))
    .replace(/\{\{total_moradores\}\}/g, String(snap.totalMoradores || 0))
    .replace(/\{\{os_abertas\}\}/g, String(snap.osAbertas || 0))
    .replace(/\{\{os_urgentes\}\}/g, String(snap.osUrgentes || 0))
    .replace(/\{\{saldo\}\}/g, (snap.saldo ?? 0).toFixed(2))
    .replace(/\{\{inadimplencia_pct\}\}/g, String(snap.inadPct || 0))
    .replace(/\{\{nivel_agua\}\}/g, snap.nivelAgua != null ? `${snap.nivelAgua}%` : "desconhecido")
    .replace(/\{\{nome_gestor\}\}/g, snap.nomeGestor || "Gestor")
    .replace(/\{\{sindico\}\}/g, snap.sindico || "Síndico")
    .replace(/\{\{nome_di\}\}/g, cfg.nome_di)
    .replace(/\{\{tom_comunicacao\}\}/g, tomLabel)
    .replace(/\{\{limite_financeiro\}\}/g, `R$ ${cfg.limite_financeiro.toFixed(2)}`)
    .replace(/\{\{limite\}\}/g, String(cfg.limite_financeiro))
    .replace(/\{\{modulos_ativos\}\}/g, modulosStr);
}

export async function carregarContextoDi(
  condoId: string,
  snapshot: DiSnapshot = {},
  perfil: Perfil = "gestor",
  nomeUsuario = "Usuário",
  unidadeId?: string
): Promise<DiCtx> {
  // ── 1. Carregar configuração operacional do condomínio ─────────────────────
  let cfg = {
    nome_di: "Di",
    tom_comunicacao: "direto_empatico",
    modulos_ativos: CATALOGO_MODULOS.map((m) => m.id),
    limite_financeiro: 1000,
    identidade_persona: null as string | null,
    system_prompt: null as string | null,
    regras_de_ouro: null as string | null,
    di_ativa: true,
    idioma: "pt_BR",
  };

  try {
    const q = condoId
      ? supabase
          .from("di_configuracoes")
          .select("nome_di,tom_comunicacao,modulos_ativos,limite_financeiro,identidade_persona,system_prompt,regras_de_ouro,di_ativa,idioma")
          .eq("condominio_id", condoId)
          .maybeSingle()
      : supabase
          .from("di_configuracoes")
          .select("nome_di,tom_comunicacao,modulos_ativos,limite_financeiro,identidade_persona,system_prompt,regras_de_ouro,di_ativa,idioma")
          .is("condominio_id", null)
          .maybeSingle();

    const { data } = await q;
    if (data) {
      cfg = {
        nome_di:          data.nome_di           || "Di",
        tom_comunicacao:  data.tom_comunicacao    || "direto_empatico",
        modulos_ativos:   Array.isArray(data.modulos_ativos) ? data.modulos_ativos : CATALOGO_MODULOS.map((m) => m.id),
        limite_financeiro: Number(data.limite_financeiro) || 1000,
        identidade_persona: data.identidade_persona || null,
        system_prompt:    data.system_prompt      || null,
        regras_de_ouro:   data.regras_de_ouro     || null,
        di_ativa:         data.di_ativa !== false,
        idioma:           data.idioma             || "pt_BR",
      };
    }
  } catch { /* usa fallback */ }

  // ── 2. Carregar blocos de prompt (global + condo-específicos mesclados) ────
  // Blocos do condo substituem os globais para o mesmo bloco_id
  let blocosTexto = "";
  try {
    const [globalRes, condoRes] = await Promise.all([
      supabase
        .from("di_system_prompt")
        .select("bloco,conteudo")
        .is("condominio_id", null)
        .order("bloco", { ascending: true }),
      condoId
        ? supabase
            .from("di_system_prompt")
            .select("bloco,conteudo")
            .eq("condominio_id", condoId)
            .order("bloco", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const globalMap = new Map<string, string>();
    for (const b of globalRes.data ?? []) {
      globalMap.set(b.bloco, b.conteudo || "");
    }

    // Condo-específicos sobrescrevem global bloco a bloco
    for (const b of condoRes.data ?? []) {
      globalMap.set(b.bloco, b.conteudo || "");
    }

    if (globalMap.size > 0) {
      blocosTexto = Array.from(globalMap.values())
        .filter(Boolean)
        .map((t) => substituirVars(t, snapshot, cfg))
        .join("\n\n");
    }
  } catch { /* usa fallback */ }

  // ── 3. Construir system prompt ─────────────────────────────────────────────
  // Prioridade: system_prompt do condo > identidade_persona > blocos > fallback
  const identidadeSection = cfg.system_prompt
    ? substituirVars(cfg.system_prompt, snapshot, cfg)
    : cfg.identidade_persona
      ? substituirVars(cfg.identidade_persona, snapshot, cfg)
      : (blocosTexto || substituirVars(FALLBACK_IDENTIDADE, snapshot, cfg));

  const adicionaisSection = cfg.regras_de_ouro
    ? `REGRAS DE OURO:\n${substituirVars(cfg.regras_de_ouro, snapshot, cfg)}`
    : null;

  // ── 4. Módulos disponíveis para este perfil (filtrado por modulos_ativos) ──
  const modulosPermitidos = CATALOGO_MODULOS.filter(
    (m) => cfg.modulos_ativos.includes(m.id) && m.perfis.includes(perfil)
  );

  const modulosTexto = modulosPermitidos.length > 0
    ? modulosPermitidos.map((m) => {
        const acoes = getAcoesPorPerfil(m, perfil).join(", ");
        return `• ${m.icone} ${m.nome} [${m.id}] — ações: ${acoes}`;
      }).join("\n")
    : "• Nenhum módulo ativo para este perfil";

  // ── 5. Snapshot da situação atual ─────────────────────────────────────────
  const snapshotTexto = buildSnapshotTexto(snapshot, perfil);

  // ── 6. Montar system prompt final ─────────────────────────────────────────
  const promptFinal = [
    identidadeSection,
    adicionaisSection,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO DA SESSÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Usuário: ${nomeUsuario}${unidadeId ? ` | Unidade: ${unidadeId}` : ""}
Perfil: ${perfil}
Condomínio ID: ${condoId || "global"}`,
    snapshotTexto ? `\n${snapshotTexto}` : null,
    `\nMÓDULOS DISPONÍVEIS (${perfil}):\n${modulosTexto}`,
    `\nLimite para aprovar transações sem consulta: R$ ${cfg.limite_financeiro.toFixed(2)}.
Tom de comunicação: ${TOM_LABEL[cfg.tom_comunicacao] ?? cfg.tom_comunicacao}.
Responda sempre em ${cfg.idioma === "pt_BR" ? "português brasileiro" : cfg.idioma}. Seja direta, precisa e baseada nos dados acima.`,
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt: promptFinal,
    nomeDi: cfg.nome_di,
    tomComunicacao: cfg.tom_comunicacao,
    modulosAtivos: cfg.modulos_ativos,
    limiteFinanceiro: cfg.limite_financeiro,
    diAtiva: cfg.di_ativa,
  };
}

function buildSnapshotTexto(snap: DiSnapshot, perfil: Perfil): string {
  const linhas: string[] = [];

  if (snap.condNome) {
    linhas.push(`Condomínio: ${snap.condNome}${snap.condCidade ? ` — ${snap.condCidade}` : ""}`);
  }
  if (snap.sindico) linhas.push(`Síndico: ${snap.sindico}`);
  if (snap.totalUnidades) linhas.push(`Unidades: ${snap.totalUnidades}${snap.totalMoradores ? ` | Moradores: ${snap.totalMoradores}` : ""}`);

  const podeFin = ["master", "gestor", "sindico"].includes(perfil);
  if (podeFin && snap.saldo !== undefined) {
    const emoji = snap.saldo >= 0 ? "✅" : "⚠️ NEGATIVO";
    linhas.push(`Saldo: R$ ${snap.saldo.toFixed(2)} ${emoji}`);
    if (snap.inadPct !== undefined) {
      const emoji2 = snap.inadPct > 10 ? "⚠️" : "✅";
      linhas.push(`Inadimplência: ${snap.inadPct}% ${emoji2}`);
    }
  }

  if (snap.osAbertas !== undefined) {
    linhas.push(`OSs abertas: ${snap.osAbertas}${snap.osUrgentes ? ` (${snap.osUrgentes} urgentes 🔴)` : ""}`);
  }

  if (snap.nivelAgua != null) {
    const emoji = snap.nivelAgua < 25 ? "🔴 CRÍTICO" : snap.nivelAgua < 60 ? "🟡 ATENÇÃO" : "🟢 OK";
    linhas.push(`Nível médio de água: ${snap.nivelAgua}% ${emoji}`);
  }

  if (linhas.length === 0) return "";
  return `SITUAÇÃO DO CONDOMÍNIO:\n${linhas.map((l) => `• ${l}`).join("\n")}`;
}
