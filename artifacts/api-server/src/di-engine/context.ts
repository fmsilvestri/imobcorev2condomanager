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
}

const FALLBACK_IDENTIDADE = `Você é Di, a Síndica Virtual Inteligente do ImobCore — especialista em gestão condominial.
Personalidade: profissional, simpática, direta e eficiente. Fale em português brasileiro natural com emojis moderados.
Sempre responda com base nos dados reais fornecidos. Nunca invente informações.`;

function substituirVars(texto: string, snap: DiSnapshot, cfg: {
  nome_di: string;
  tom_comunicacao: string;
  limite_financeiro: number;
}): string {
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
    .replace(/\{\{tom_comunicacao\}\}/g, cfg.tom_comunicacao)
    .replace(/\{\{nome_di\}\}/g, cfg.nome_di)
    .replace(/\{\{limite_financeiro\}\}/g, `R$ ${cfg.limite_financeiro.toFixed(2)}`);
}

export async function carregarContextoDi(
  condoId: string,
  snapshot: DiSnapshot = {},
  perfil: Perfil = "gestor",
  nomeUsuario = "Usuário",
  unidadeId?: string
): Promise<DiCtx> {
  // ── 1. Carregar configuração do condomínio ────────────────────────────────
  let cfg = {
    nome_di: "Di",
    tom_comunicacao: "profissional",
    modulos_ativos: CATALOGO_MODULOS.map((m) => m.id),
    limite_financeiro: 1000,
    identidade_persona: null as string | null,
    system_prompt: null as string | null,
    regras_de_ouro: null as string | null,
    di_ativa: true,
  };

  try {
    const q = condoId
      ? supabase.from("di_configuracoes").select("nome_di,tom_comunicacao,modulos_ativos,limite_financeiro,identidade_persona,system_prompt,regras_de_ouro,di_ativa").eq("condominio_id", condoId).maybeSingle()
      : supabase.from("di_configuracoes").select("nome_di,tom_comunicacao,modulos_ativos,limite_financeiro,identidade_persona,system_prompt,regras_de_ouro,di_ativa").is("condominio_id", null).maybeSingle();

    const { data } = await q;
    if (data) {
      cfg = {
        nome_di: data.nome_di || "Di",
        tom_comunicacao: data.tom_comunicacao || "profissional",
        modulos_ativos: Array.isArray(data.modulos_ativos) ? data.modulos_ativos : CATALOGO_MODULOS.map((m) => m.id),
        limite_financeiro: Number(data.limite_financeiro) || 1000,
        identidade_persona: data.identidade_persona || null,
        system_prompt: data.system_prompt || null,
        regras_de_ouro: data.regras_de_ouro || null,
        di_ativa: data.di_ativa !== false,
      };
    }
  } catch { /* usa fallback */ }

  // ── 2. Carregar blocos de prompt (bloco/fixo são as colunas reais) ────────
  let blocosTexto = "";
  try {
    const { data: blocos } = await supabase
      .from("di_system_prompt")
      .select("bloco,titulo,conteudo,fixo")
      .or(condoId ? `condominio_id.eq.${condoId},condominio_id.is.null` : "condominio_id.is.null")
      .order("bloco", { ascending: true });

    if (blocos && blocos.length > 0) {
      // Monta o prompt: blocos globais primeiro (fixo=true têm prioridade)
      const blocosMapa = new Map<string, string>();
      // Primeiro: globais (condominio_id null)
      for (const b of blocos) {
        if (!blocosMapa.has(b.bloco)) {
          blocosMapa.set(b.bloco, b.conteudo || "");
        }
      }
      // Depois: override por condomínio (substitui se existir para esse condo)
      for (const b of blocos) {
        blocosMapa.set(b.bloco, b.conteudo || "");
      }

      blocosTexto = Array.from(blocosMapa.values())
        .filter(Boolean)
        .map((t) => substituirVars(t, snapshot, cfg))
        .join("\n\n");
    }
  } catch { /* usa fallback */ }

  // ── 3. Construir sistema de prompts ───────────────────────────────────────
  // Prioridade: campos de di_configuracoes > blocos da tabela > fallback
  const identidadeSection = cfg.identidade_persona
    ? substituirVars(cfg.identidade_persona, snapshot, cfg)
    : (blocosTexto || FALLBACK_IDENTIDADE);

  const additionaisSection = [
    cfg.system_prompt ? substituirVars(cfg.system_prompt, snapshot, cfg) : null,
    cfg.regras_de_ouro ? `REGRAS DE OURO:\n${substituirVars(cfg.regras_de_ouro, snapshot, cfg)}` : null,
  ].filter(Boolean).join("\n\n");

  // ── 4. Montar lista de módulos disponíveis para este perfil ───────────────
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
    additionaisSection || null,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO DA SESSÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Usuário: ${nomeUsuario}${unidadeId ? ` | Unidade: ${unidadeId}` : ""}
Perfil: ${perfil}
Condomínio ID: ${condoId || "global"}`,
    snapshotTexto ? `\n${snapshotTexto}` : null,
    `\nMÓDULOS DISPONÍVEIS (${perfil}):\n${modulosTexto}`,
    `\nLimite para aprovar transações sem consulta: R$ ${cfg.limite_financeiro.toFixed(2)}.
Responda sempre em português brasileiro. Seja direta, precisa e baseada nos dados acima.`,
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt: promptFinal,
    nomeDi: cfg.nome_di,
    tomComunicacao: cfg.tom_comunicacao,
    modulosAtivos: cfg.modulos_ativos,
    limiteFinanceiro: cfg.limite_financeiro,
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
