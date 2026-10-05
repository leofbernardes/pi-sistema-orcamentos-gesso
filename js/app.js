// O Dashboard apenas lê os cadastros: não migra dados nem atualiza sequências.
function carregarClientesDashboard() {
  return lerLista("pizzol_clientes");
}

function carregarOrcamentosDashboard() {
  const registros = lerLista("pizzol_orcamentos");
  if (registros.some((item) => !Number.isFinite(item.totalFinal) || item.totalFinal < 0
    || !/^ORC-\d+$/.test(item.codigo)
    || (item.dataCriacao != null && typeof item.dataCriacao !== "string")
    || (item.itens != null && (!Array.isArray(item.itens)
      || item.itens.some((servico) => !servico || typeof servico !== "object" || Array.isArray(servico)))))) {
    throw new Error("Formato de orçamentos inválido.");
  }
  return registros;
}

function calcularValorTotalOrcado(orcamentos) {
  return orcamentos.reduce((centavos, item) => centavos + Math.round(item.totalFinal * 100), 0) / 100;
}

function contarOrcamentosPendentes(orcamentos) {
  return orcamentos.filter((item) => item.status === "Pendente").length;
}

function obterOrcamentosRecentes(orcamentos) {
  return [...orcamentos].sort((a, b) => String(b.dataCriacao || "").localeCompare(String(a.dataCriacao || ""))
    || Number(b.codigo.slice(4)) - Number(a.codigo.slice(4))).slice(0, 5);
}

function descreverServicos(orcamento) {
  const itens = orcamento.itens || [];
  if (!itens.length) return "Sem serviços";
  return itens.length === 1 ? itens[0].nomeServico || "—" : `${itens.length} serviços`;
}

function renderizarCards(clientes, orcamentos) {
  // Uma falha de leitura é diferente de um cadastro vazio: não mostrar zeros enganosos.
  document.querySelector("#valor-total").textContent = orcamentos ? formatarPreco(calcularValorTotalOrcado(orcamentos)) : "—";
  document.querySelector("#orcamentos-pendentes").textContent = orcamentos ? String(contarOrcamentosPendentes(orcamentos)) : "—";
  document.querySelector("#clientes-cadastrados").textContent = clientes ? String(clientes.length) : "—";
}

function criarElementoDashboard(tag, texto, classe) {
  const elemento = document.createElement(tag);
  if (texto !== undefined) elemento.textContent = texto;
  if (classe) elemento.className = classe;
  return elemento;
}

function criarLinhaRecente(orcamento) {
  const linha = criarElementoDashboard("tr");
  const nome = orcamento.cliente?.nome || orcamento.clienteNome || "—";
  linha.append(criarElementoDashboard("td", nome, "client-name"),
    criarElementoDashboard("td", descreverServicos(orcamento)),
    criarElementoDashboard("td", formatarPreco(orcamento.totalFinal), "amount"));
  const status = criarElementoDashboard("td");
  const classesStatus = { Pendente: "status-pendente", "Em andamento": "status-em-andamento",
    Finalizado: "status-finalizado", Recusado: "status-recusado" };
  status.append(criarElementoDashboard("span", orcamento.status || "—", `status ${classesStatus[orcamento.status] || "status-inativo"}`));
  const data = criarElementoDashboard("td");
  const tempo = criarElementoDashboard("time", formatarData(orcamento.dataCriacao));
  if (orcamento.dataCriacao) tempo.setAttribute("datetime", orcamento.dataCriacao);
  data.append(tempo);
  const acao = criarElementoDashboard("td");
  const link = criarElementoDashboard("a", "Ver detalhes", "details-button");
  link.setAttribute("href", `./pages/orcamentos.html?orcamento=${encodeURIComponent(orcamento.codigo)}`);
  link.setAttribute("aria-label", `Ver detalhes do orçamento ${orcamento.codigo} de ${nome}`);
  acao.append(link);
  linha.append(status, data, acao);
  return linha;
}

function renderizarOrcamentosRecentes(orcamentos) {
  const lista = document.querySelector("#orcamentos-recentes");
  const nota = document.querySelector("#recentes-nota");
  if (!orcamentos || !orcamentos.length) {
    const linha = criarElementoDashboard("tr");
    const celula = criarElementoDashboard("td", orcamentos ? "Nenhum orçamento cadastrado." : "Não foi possível carregar os orçamentos.");
    celula.setAttribute("colspan", "6");
    linha.append(celula); lista.replaceChildren(linha);
    nota.textContent = orcamentos ? "Os novos orçamentos aparecerão aqui." : "Verifique o armazenamento do navegador e recarregue a página.";
    return;
  }
  const recentes = obterOrcamentosRecentes(orcamentos);
  lista.replaceChildren(...recentes.map(criarLinhaRecente));
  nota.textContent = `Exibindo ${recentes.length} de ${orcamentos.length} orçamento(s) cadastrado(s).`;
}

function atualizarDashboard() {
  let clientes = null;
  let orcamentos = null;
  const erros = [];
  try { clientes = carregarClientesDashboard(); }
  catch { erros.push("Não foi possível carregar os clientes."); }
  try { orcamentos = carregarOrcamentosDashboard(); }
  catch { erros.push("Não foi possível carregar os orçamentos."); }
  renderizarCards(clientes, orcamentos);
  renderizarOrcamentosRecentes(orcamentos);
  const aviso = document.querySelector("#dashboard-error");
  aviso.textContent = erros.length ? `${erros.join(" ")} Os dados existentes foram preservados. Verifique o armazenamento do navegador e recarregue a página.` : "";
  aviso.hidden = !erros.length;
}

// O script defer já encontra o HTML pronto; pageshow também cobre o retorno pelo histórico.
atualizarDashboard();
window.addEventListener("pageshow", atualizarDashboard);
window.addEventListener("storage", (evento) => {
  if (["pizzol_clientes", "pizzol_orcamentos", null].includes(evento.key)) atualizarDashboard();
});
