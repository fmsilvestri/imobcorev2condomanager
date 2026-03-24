export type Perfil = "master" | "gestor" | "sindico" | "morador" | "zelador";

export interface ModuloDef {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  perfis: Perfil[];
  acoes: string[];
}

export const CATALOGO_MODULOS: ModuloDef[] = [
  {
    id: "os",
    nome: "Ordens de Serviço",
    descricao: "Gestão completa de OSs, prioridades, responsáveis e histórico",
    icone: "🔧",
    perfis: ["master", "gestor", "sindico", "zelador"],
    acoes: ["visualizar", "criar", "editar", "fechar", "atribuir"],
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    descricao: "Receitas, despesas, inadimplência, fluxo de caixa e relatórios",
    icone: "💰",
    perfis: ["master", "gestor", "sindico"],
    acoes: ["visualizar", "lancar", "aprovar", "relatorio"],
  },
  {
    id: "iot",
    nome: "IOT / Sensores",
    descricao: "Monitoramento de reservatórios, sensores e alertas em tempo real",
    icone: "📡",
    perfis: ["master", "gestor", "sindico", "zelador"],
    acoes: ["visualizar", "configurar", "alertas"],
  },
  {
    id: "misp",
    nome: "MISP / Manutenção",
    descricao: "Equipamentos, planos de manutenção preventiva e corretiva",
    icone: "⚙️",
    perfis: ["master", "gestor", "sindico", "zelador"],
    acoes: ["visualizar", "cadastrar", "agendar", "executar"],
  },
  {
    id: "encomendas",
    nome: "Encomendas",
    descricao: "Controle de recebimento e retirada de encomendas por unidade",
    icone: "📦",
    perfis: ["master", "gestor", "sindico", "zelador", "morador"],
    acoes: ["visualizar", "registrar", "confirmar_retirada"],
  },
  {
    id: "portaria",
    nome: "Portaria Virtual",
    descricao: "Acesso de visitantes, moradores e prestadores de serviço",
    icone: "🚪",
    perfis: ["master", "gestor", "sindico", "zelador"],
    acoes: ["visualizar", "autorizar", "bloquear", "historico"],
  },
  {
    id: "reservas",
    nome: "Reservas",
    descricao: "Agendamento de áreas comuns: salão, churrasqueira, academia",
    icone: "📅",
    perfis: ["master", "gestor", "sindico", "morador"],
    acoes: ["visualizar", "reservar", "cancelar", "aprovar"],
  },
  {
    id: "comunicados",
    nome: "Comunicados",
    descricao: "Avisos, circulares e comunicações com moradores e síndico",
    icone: "📢",
    perfis: ["master", "gestor", "sindico", "morador"],
    acoes: ["visualizar", "criar", "publicar", "enviar"],
  },
  {
    id: "votacoes",
    nome: "Votações",
    descricao: "Assembleias virtuais, enquetes e votações condominiais",
    icone: "🗳️",
    perfis: ["master", "gestor", "sindico", "morador"],
    acoes: ["visualizar", "criar", "votar", "encerrar"],
  },
  {
    id: "crm",
    nome: "CRM / Moradores",
    descricao: "Cadastro, histórico e relacionamento com moradores e proprietários",
    icone: "👥",
    perfis: ["master", "gestor", "sindico"],
    acoes: ["visualizar", "cadastrar", "editar", "historico"],
  },
  {
    id: "diagnostico",
    nome: "Diagnóstico IA",
    descricao: "Análise completa do condomínio com score e recomendações da Di",
    icone: "🩺",
    perfis: ["master", "gestor", "sindico"],
    acoes: ["visualizar", "calcular", "exportar"],
  },
  {
    id: "condo3dmap",
    nome: "Mapa 3D",
    descricao: "Visualização interativa do condomínio em 3D com status de áreas",
    icone: "🗺️",
    perfis: ["master", "gestor", "sindico", "morador", "zelador"],
    acoes: ["visualizar"],
  },
];

export function getModuloPorId(id: string): ModuloDef | undefined {
  return CATALOGO_MODULOS.find((m) => m.id === id);
}

export function getModulosPorPerfil(perfil: Perfil): ModuloDef[] {
  return CATALOGO_MODULOS.filter((m) => m.perfis.includes(perfil));
}

export function getAcoesPorPerfil(modulo: ModuloDef, perfil: Perfil): string[] {
  if (!modulo.perfis.includes(perfil)) return [];
  if (perfil === "master" || perfil === "gestor") return modulo.acoes;
  if (perfil === "sindico") return modulo.acoes.filter((a) => a !== "aprovar" || modulo.id !== "financeiro");
  if (perfil === "morador") return modulo.acoes.filter((a) => ["visualizar", "reservar", "votar", "confirmar_retirada"].includes(a));
  if (perfil === "zelador") return modulo.acoes.filter((a) => ["visualizar", "executar", "registrar"].includes(a));
  return ["visualizar"];
}
