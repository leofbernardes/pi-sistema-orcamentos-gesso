const statusPermitidos = ["Pendente", "Em andamento", "Finalizado", "Recusado"];
const el = (id) => document.querySelector(`#${id}`);
let orcamentos = [];
let pagamentoId = null;
let statusId = null;
let detalhesId = null;
let exclusao = null;

function criar(tag, texto, classe) {
  const elemento = document.createElement(tag);
  if (texto !== undefined) elemento.textContent = texto;
  if (classe) elemento.className = classe;
  return elemento;
}

function botao(texto, acao, rotulo = texto) {
  const elemento = criar("button", texto, texto === "Excluir" ? "details-button danger-button" : "details-button");
  elemento.type = "button";
  elemento.setAttribute("aria-label", rotulo);
  elemento.addEventListener("click", acao);
  return elemento;
}

function badge(texto, financeiro = false) {
  const classe = financeiro ? { "Em aberto": "finance-open", "Parcialmente pago": "finance-partial", Pago: "finance-paid" }[texto]
    : `status-${normalizarBusca(texto).replace(/ /g, "-")}`;
  return criar("span", texto, `status ${classe}`);
}

function vencido(orcamento) {
  return orcamento.status === "Pendente" && orcamento.dataValidade && orcamento.dataValidade < Orcamento.dataAtual();
}

function obterOrcamento(id) {
  const registro = carregarOrcamentos().orcamentos.find((item) => item.id === id);
  if (!registro) throw new Error("Orçamento não encontrado. Atualize a página.");
  return registro;
}

function listarOrcamentos() {
  const termo = normalizarBusca(el("busca").value);
  const status = el("filtro-status").value;
  const financeiro = el("filtro-financeiro").value;
  const filtrados = orcamentos.filter((registro) => {
    const modelo = new Orcamento(registro);
    return normalizarBusca(`${registro.codigo} ${registro.cliente?.codigo || ""} ${registro.cliente?.nome || ""}`).includes(termo)
      && (status === "todos" || registro.status === status)
      && (financeiro === "todos" || modelo.obterSituacaoFinanceira() === financeiro);
  }).sort((a, b) => String(b.dataCriacao).localeCompare(String(a.dataCriacao)) || Number(b.codigo.slice(4)) - Number(a.codigo.slice(4)));
  el("lista-orcamentos").replaceChildren(...filtrados.map(criarLinha));
  el("tabela-regiao").hidden = !filtrados.length;
  el("vazio").hidden = Boolean(filtrados.length);
  el("vazio-titulo").textContent = orcamentos.length ? "Nenhum orçamento encontrado." : "Nenhum orçamento cadastrado.";
  el("vazio-descricao").textContent = orcamentos.length ? "Ajuste a busca ou os filtros para consultar outros orçamentos." : "Os novos orçamentos aparecerão aqui.";
  el("vazio-novo").hidden = Boolean(orcamentos.length);
  el("contador").textContent = `${filtrados.length} de ${orcamentos.length} orçamento(s)`;
}

function criarLinha(registro) {
  const modelo = new Orcamento(registro);
  const linha = criar("tr");
  linha.append(criar("td", registro.codigo));
  const cliente = criar("td", registro.cliente?.nome || "—", "client-name");
  cliente.append(criar("small", registro.cliente?.codigo || "—", "client-code"));
  linha.append(cliente, criar("td", formatarData(registro.dataCriacao)));
  [modelo.obterTotalFinanceiro(), modelo.calcularTotalPago(), modelo.calcularSaldoAberto()].forEach((valor) => linha.append(criar("td", formatarPreco(valor), "amount")));
  const financeiro = criar("td"); financeiro.append(badge(modelo.obterSituacaoFinanceira(), true));
  const status = criar("td"); status.append(badge(registro.status));
  if (vencido(registro)) status.append(criar("span", "Vencido", "expired"));
  const acoes = criar("td");
  const grupo = criar("div", undefined, "client-actions");
  for (const [texto, acao] of [["Ver", () => visualizar(registro.id)],
    ["Editar", () => { window.location.href = `./novo-orcamento.html?editar=${encodeURIComponent(registro.id)}`; }],
    ["Pagamento", () => abrirPagamento(registro.id)], ["Status", () => abrirStatus(registro.id)],
    ["Excluir", () => abrirExclusao(registro.id)]]) {
    grupo.append(botao(texto, () => tentarAbrir(acao), `${texto} orçamento ${registro.codigo}`));
  }
  acoes.append(grupo); linha.append(financeiro, status, acoes);
  return linha;
}

function tentarAbrir(acao) {
  try { acao(); } catch (erro) { mostrarErro("storage-error", erro); }
}

function mostrarErro(id, erro) {
  el(id).textContent = erro.message || "Não foi possível acessar o armazenamento do navegador. Os dados foram preservados.";
  el(id).hidden = false;
  el(id).focus();
}

function preencherResumo(lista, pares) {
  lista.replaceChildren();
  pares.forEach(([rotulo, valor]) => lista.append(criar("dt", rotulo), criar("dd", valor === "" || valor == null ? "—" : valor)));
}

function resumoFinanceiro(registro) {
  const modelo = new Orcamento(registro);
  return [["Total do orçamento", formatarPreco(modelo.obterTotalFinanceiro())],
    ["Total pago", formatarPreco(modelo.calcularTotalPago())], ["Saldo em aberto", formatarPreco(modelo.calcularSaldoAberto())],
    ["Situação financeira", modelo.obterSituacaoFinanceira()]];
}

function secao(titulo, pares) {
  const elemento = criar("section", undefined, "detail-section");
  elemento.append(criar("h3", titulo));
  if (pares) {
    const lista = criar("dl", undefined, "client-details");
    preencherResumo(lista, pares); elemento.append(lista);
  }
  el("ver-conteudo").append(elemento);
  return elemento;
}

function tabela(titulo, colunas, linhas) {
  const regiao = criar("div", undefined, "table-container");
  regiao.tabIndex = 0; regiao.setAttribute("role", "region"); regiao.setAttribute("aria-label", titulo);
  const tabela = criar("table"), head = criar("thead"), tr = criar("tr"), body = criar("tbody");
  colunas.forEach((nome) => { const th = criar("th", nome); th.setAttribute("scope", "col"); tr.append(th); });
  head.append(tr);
  linhas.forEach((valores) => {
    const linha = criar("tr");
    valores.forEach((valor) => {
      const celula = criar("td");
      if (typeof valor === "object") celula.append(valor);
      else celula.textContent = valor;
      celula.className = "note-cell";
      linha.append(celula);
    });
    body.append(linha);
  });
  tabela.append(head, body); regiao.append(tabela); return regiao;
}

function visualizar(id) {
  const registro = obterOrcamento(id);
  detalhesId = id;
  el("ver-conteudo").replaceChildren();
  el("ver-titulo").textContent = `Ver orçamento — ${registro.codigo}`;
  secao("Identificação", [["Código", registro.codigo], ["Data", formatarData(registro.dataCriacao)],
    ["Validade", `${formatarData(registro.dataValidade)} (${registro.validadeDias} dias)`],
    ["Status", registro.status + (vencido(registro) ? " · Vencido" : "")]]);
  const cliente = registro.cliente || {}, endereco = cliente.endereco || {}, obra = registro.enderecoObra || {};
  secao("Cliente", [["Código", cliente.codigo], ["Nome", cliente.nome], ["Telefone", formatarTelefone(cliente.telefone || "")],
    ["Endereço histórico", [endereco.rua, endereco.numero, endereco.cidade, formatarCep(endereco.cep || "")].filter(Boolean).join(", ")]]);
  secao("Local da obra", [["Rua", obra.rua], ["Número", obra.numero], ["Cidade", obra.cidade], ["CEP", formatarCep(obra.cep || "")]]);
  secao("Serviços").append(tabela("Serviços do orçamento", ["Serviço", "Tipo", "Unidade", "Quantidade", "Preço unitário", "Subtotal"],
    registro.itens.map((item) => [`${item.codigoServico} — ${item.nomeServico}`, item.tipo, item.unidade,
      item.quantidade.toLocaleString("pt-BR"), formatarPreco(item.precoUnitario), formatarPreco(item.subtotal)])));
  secao("Resumo", [["Subtotal", formatarPreco(registro.subtotalServicos)], ["Adicional", formatarPreco(registro.adicional?.valor || 0)],
    ["Descrição", registro.adicional?.descricao], ["Desconto %", `${registro.descontoPercentual}%`],
    ["Valor desconto", formatarPreco(registro.descontoValor)], ["Total final", formatarPreco(registro.totalFinal)]]);
  const pagamentos = secao("Pagamentos");
  if (registro.pagamentos?.length) pagamentos.append(tabela("Histórico de pagamentos", ["Data", "Forma", "Valor", "Observação", "Ação"],
    registro.pagamentos.map((pagamento) => [formatarData(pagamento.data), pagamento.formaPagamento, formatarPreco(pagamento.valor),
      pagamento.observacao || "—", botao("Excluir", () => tentarAbrir(() => abrirExclusao(id, pagamento.id)),
        `Excluir pagamento de ${formatarPreco(pagamento.valor)} em ${formatarData(pagamento.data)}`)])));
  else pagamentos.append(criar("p", "Nenhum pagamento registrado."));
  const resumo = criar("dl", undefined, "client-details"); preencherResumo(resumo, resumoFinanceiro(registro)); pagamentos.append(resumo);
  if (registro.condicoesPagamento) secao("Condições de pagamento").append(criar("p", registro.condicoesPagamento));
  if (registro.observacoes) secao("Observações").append(criar("p", registro.observacoes));
  if (!el("ver-modal").open) el("ver-modal").showModal();
}

function abrirPagamento(id) {
  const registro = obterOrcamento(id);
  pagamentoId = id;
  el("pagamento-form").reset();
  el("pagamento-data").value = Orcamento.dataAtual();
  el("pagamento-erro").hidden = true;
  preencherResumo(el("pagamento-resumo"), [["Código", registro.codigo], ["Cliente", registro.cliente.nome], ...resumoFinanceiro(registro)]);
  el("pagamento-modal").showModal(); el("pagamento-valor").focus();
}

function registrarPagamento(id, dados) {
  return alterarOrcamento(id, (registro) => {
    const modelo = new Orcamento(registro);
    modelo.adicionarPagamento(dados);
    return { ...registro, pagamentos: modelo.pagamentos };
  });
}

function removerPagamento(id, pagamento) {
  return alterarOrcamento(id, (registro) => {
    const modelo = new Orcamento(registro);
    modelo.removerPagamento(pagamento);
    return { ...registro, pagamentos: modelo.pagamentos };
  });
}

function abrirStatus(id) {
  const registro = obterOrcamento(id); statusId = id;
  el("status-identificacao").textContent = `${registro.codigo} — ${registro.cliente.nome}`;
  el("novo-status").value = registro.status; el("status-erro").hidden = true;
  el("status-modal").showModal(); el("novo-status").focus();
}

function alterarStatus(id, status) {
  if (!statusPermitidos.includes(status)) throw new Error("Selecione um status válido.");
  return alterarOrcamento(id, (registro) => ({ ...registro, status }));
}

function abrirExclusao(id, pagamento = null) {
  const registro = obterOrcamento(id);
  exclusao = { id, pagamento, tinhaPagamentos: Boolean(registro.pagamentos?.length) };
  el("excluir-titulo").textContent = pagamento ? "Excluir pagamento?" : "Excluir orçamento?";
  if (pagamento) {
    const item = registro.pagamentos.find((item) => item.id === pagamento);
    if (!item) throw new Error("Pagamento não encontrado. Atualize a página.");
    el("excluir-mensagem").textContent = `${formatarPreco(item.valor)} — ${item.formaPagamento} — ${formatarData(item.data)}. O pagamento será excluído.`;
  } else el("excluir-mensagem").textContent = `O orçamento ${registro.codigo} será excluído permanentemente.`;
  el("excluir-aviso").textContent = "Este orçamento possui pagamentos registrados.";
  el("excluir-aviso").hidden = Boolean(pagamento) || !exclusao.tinhaPagamentos;
  el("excluir-erro").hidden = true;
  el("excluir-modal").showModal(); el("cancelar-exclusao").focus();
}

async function executar(botaoId, erroId, modalId, acao, mensagem) {
  const botao = el(botaoId);
  if (botao.disabled) return;
  botao.disabled = true; el(erroId).hidden = true;
  try {
    await comArmazenamento(acao);
    el(modalId).close(); atualizarPagina();
    el("sucesso").textContent = mensagem; el("sucesso").hidden = false;
  } catch (erro) { mostrarErro(erroId, erro); }
  finally { botao.disabled = false; }
}

el("pagamento-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = pagamentoId;
  const dados = { valor: lerDecimal(el("pagamento-valor").value), formaPagamento: el("pagamento-forma").value,
    data: el("pagamento-data").value, observacao: el("pagamento-observacao").value };
  return executar("registrar-pagamento", "pagamento-erro", "pagamento-modal", () => registrarPagamento(id, dados), "Pagamento registrado com sucesso.");
});
el("pagamento-valor").addEventListener("input", () => {
  const campo = el("pagamento-valor");
  const digitos = somenteNumeros(campo.value);
  campo.value = digitos ? formatarPreco(Number(digitos) / 100) : "";
});
el("status-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = statusId, status = el("novo-status").value;
  return executar("salvar-status", "status-erro", "status-modal", () => alterarStatus(id, status), "Status atualizado com sucesso.");
});
el("confirmar-exclusao").addEventListener("click", () => {
  const alvo = { ...exclusao };
  return executar("confirmar-exclusao", "excluir-erro", "excluir-modal", () => {
    if (alvo.pagamento) return removerPagamento(alvo.id, alvo.pagamento);
    if (!alvo.tinhaPagamentos && obterOrcamento(alvo.id).pagamentos?.length) {
      exclusao.tinhaPagamentos = true;
      el("excluir-aviso").hidden = false;
      throw new Error("Um pagamento foi registrado em outra aba. Confira o aviso e confirme novamente a exclusão.");
    }
    excluirOrcamento(alvo.id);
  }, alvo.pagamento ? "Pagamento excluído com sucesso." : "Orçamento excluído com sucesso.");
});
document.querySelectorAll("[data-fechar]").forEach((botao) => botao.addEventListener("click", () => el(botao.getAttribute("data-fechar")).close()));
el("busca").addEventListener("input", listarOrcamentos);
el("filtro-status").addEventListener("change", listarOrcamentos);
el("filtro-financeiro").addEventListener("change", listarOrcamentos);

function atualizarPagina() {
  try {
    const registros = carregarOrcamentos().orcamentos;
    // Valida a leitura antes de substituir a lista exibida, sem migrar ou gravar os registros.
    registros.forEach((item) => {
      if (!item.cliente || !Array.isArray(item.itens) || !Number.isFinite(item.totalFinal) || item.totalFinal < 0) throw new Error("Orçamento armazenado inválido. Os dados foram preservados.");
      new Orcamento(item);
    });
    orcamentos = registros;
    listarOrcamentos(); el("storage-error").hidden = true;
    if (el("ver-modal").open) {
      if (orcamentos.some((item) => item.id === detalhesId)) visualizar(detalhesId);
      else el("ver-modal").close();
    }
    if (el("pagamento-modal").open && orcamentos.some((item) => item.id === pagamentoId)) {
      const registro = obterOrcamento(pagamentoId);
      preencherResumo(el("pagamento-resumo"), [["Código", registro.codigo], ["Cliente", registro.cliente.nome], ...resumoFinanceiro(registro)]);
    }
  } catch (erro) {
    el("lista-orcamentos").replaceChildren(); el("vazio").hidden = true;
    el("contador").textContent = "Não foi possível carregar os orçamentos.";
    mostrarErro("storage-error", erro);
  }
}
window.addEventListener("storage", (event) => {
  if ([STORAGE_KEY, CODIGO_KEY, null].includes(event.key)) atualizarPagina();
});
atualizarPagina();

// Entrada pelo Dashboard: reutiliza os mesmos detalhes e mantém a listagem disponível.
function abrirOrcamentoDaURL() {
  const codigo = new URLSearchParams(window.location.search || "").get("orcamento");
  if (!codigo || !el("storage-error").hidden) return;
  const registro = orcamentos.find((item) => item.codigo === codigo);
  if (registro) tentarAbrir(() => visualizar(registro.id));
  else mostrarErro("storage-error", new Error("Orçamento não encontrado. Ele pode ter sido excluído. Consulte a listagem abaixo."));
}
abrirOrcamentoDaURL();
