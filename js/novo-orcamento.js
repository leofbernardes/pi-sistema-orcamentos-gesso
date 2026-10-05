const STORAGE_KEY = "pizzol_orcamentos";
const CODIGO_KEY = "pizzol_proximo_codigo_orcamento";
const form = document.querySelector("#orcamento-form");
const campos = ["clienteId", "validadeDias", "rua", "numero", "cidade", "cep",
  "adicionalValor", "adicionalDescricao", "descontoPercentual", "condicoesPagamento", "observacoes"];
const camposItem = ["servicoId", "quantidade"];
const storageErro = document.querySelector("#storage-error");
const salvarErro = document.querySelector("#salvar-erro");
const modal = document.querySelector("#cancelar-modal");
let clientes = [];
let servicos = [];
let rascunho = new Orcamento();
let estadoInicial = "";
let destinoCancelamento = "../index.html";

function comArmazenamento(acao) {
  return navigator.locks ? navigator.locks.request(STORAGE_KEY, acao) : Promise.resolve().then(acao);
}

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function lerDecimal(texto) {
  const valor = texto.trim().replace(/^R\$\s*/, "");
  // Mesmo formato brasileiro utilizado no cadastro de Serviços e Preços.
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(valor)) return NaN;
  return Number(valor.replace(/\./g, "").replace(",", "."));
}

function somenteNumeros(texto) { return texto.replace(/\D/g, ""); }
function formatarCep(texto) { return somenteNumeros(texto).replace(/^(\d{5})(\d+)/, "$1-$2"); }
function formatarData(data) { return data ? data.split("-").reverse().join("/") : "—"; }
function formatarCodigo(codigo) { return String(codigo).padStart(3, "0"); }
function formatarTelefone(texto) {
  const numeros = somenteNumeros(texto);
  const corte = numeros.length > 10 ? 7 : 6;
  return numeros.length >= 10 ? `(${numeros.slice(0, 2)}) ${numeros.slice(2, corte)}-${numeros.slice(corte)}` : texto;
}

function enderecoCliente(cliente) {
  return { rua: cliente.rua || "", numero: cliente.numero || "", cidade: cliente.cidade || "", cep: cliente.cep || "" };
}

function lerLista(chave) {
  const dados = JSON.parse(localStorage.getItem(chave) || "[]");
  if (!Array.isArray(dados) || dados.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error("Formato de armazenamento inválido.");
  }
  return dados;
}

function carregarCatalogos() {
  const novosClientes = lerLista("pizzol_clientes");
  const novosServicos = lerLista("pizzol_servicos");
  for (const [lista, atributos] of [[novosClientes, ["nome", "telefone", "rua", "numero", "cidade", "cep"]],
    [novosServicos, ["nome", "tipo", "unidade"]]]) {
    const ids = new Set();
    lista.forEach((item) => {
      if (typeof item.id !== "string" || !item.id || ids.has(item.id)
        || !/^\d+$/.test(String(item.codigo)) || !["Ativo", "Inativo"].includes(item.status)
        || atributos.some((campo) => typeof item[campo] !== "string")) {
        throw new Error("Cadastro inválido.");
      }
      ids.add(item.id);
    });
  }
  if (novosServicos.some((item) => !Number.isFinite(item.preco) || item.preco <= 0 || item.preco > 999999.99)) {
    throw new Error("Preço inválido no cadastro.");
  }
  clientes = novosClientes.filter((cliente) => cliente.status === "Ativo");
  servicos = novosServicos.filter((servico) => servico.status === "Ativo");
}

function carregarOrcamentos() {
  const orcamentos = lerLista(STORAGE_KEY);
  const codigos = new Set();
  const ids = new Set();
  let proximo = 1;
  orcamentos.forEach((orcamento) => {
    const numero = /^ORC-\d+$/.test(orcamento.codigo) ? Number(orcamento.codigo.slice(4)) : 0;
    if (!Number.isSafeInteger(numero) || numero < 1 || codigos.has(numero)
      || typeof orcamento.id !== "string" || !orcamento.id || ids.has(orcamento.id)) {
      throw new Error("Orçamento armazenado inválido.");
    }
    codigos.add(numero);
    ids.add(orcamento.id);
    proximo = Math.max(proximo, numero + 1);
  });
  const contador = localStorage.getItem(CODIGO_KEY);
  if (contador !== null) {
    if (!/^\d+$/.test(contador) || !Number.isSafeInteger(Number(contador)) || Number(contador) < 1) {
      throw new Error("Sequência inválida.");
    }
    proximo = Math.max(proximo, Number(contador));
  }
  if (!Number.isSafeInteger(proximo + 1)) throw new Error("Limite de códigos atingido.");
  return { orcamentos, proximo };
}

function normalizarBusca(texto) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

// O texto da pesquisa é separado do id: digitar nunca confirma uma seleção.
function criarBusca(nome, campoId, obterRegistros, aoSelecionar, mensagemVazia) {
  const input = form.elements[`busca-${nome}`];
  const identidade = form.elements[campoId];
  const container = document.querySelector(`#autocomplete-${nome}`);
  const lista = document.querySelector(`#resultados-${nome}`);
  let resultados = [];
  let destacado = -1;

  function fechar() {
    lista.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    destacado = -1;
  }

  function destacar(indice) {
    destacado = indice;
    Array.from(lista.children).forEach((opcao, index) => opcao.setAttribute("data-highlighted", String(index === indice)));
    if (indice >= 0) {
      input.setAttribute("aria-activedescendant", lista.children[indice].id);
      lista.children[indice].scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }

  function selecionar(registro) {
    identidade.value = registro.id;
    input.value = `${formatarCodigo(registro.codigo)} - ${registro.nome}`;
    limparErro(campoId);
    aoSelecionar();
    fechar();
  }

  function abrir() {
    const termo = identidade.value ? "" : normalizarBusca(input.value);
    resultados = obterRegistros().filter((registro) =>
      normalizarBusca(`${formatarCodigo(registro.codigo)} - ${registro.nome}`).includes(termo));
    const opcoes = resultados.map((registro, index) => {
      const opcao = document.createElement("li");
      opcao.id = `opcao-${nome}-${index}`;
      opcao.textContent = `${formatarCodigo(registro.codigo)} - ${registro.nome}`;
      opcao.setAttribute("role", "option");
      opcao.setAttribute("aria-selected", String(registro.id === identidade.value));
      // Mantém o foco no combobox até o clique selecionar o resultado.
      opcao.addEventListener("pointerdown", (event) => event.preventDefault());
      opcao.addEventListener("click", () => selecionar(registro));
      return opcao;
    });
    if (!opcoes.length) {
      const vazio = document.createElement("li");
      vazio.className = "search-empty";
      vazio.textContent = mensagemVazia;
      vazio.setAttribute("role", "status");
      opcoes.push(vazio);
    }
    lista.replaceChildren(...opcoes);
    lista.hidden = false;
    input.setAttribute("aria-expanded", "true");
    destacar(resultados.findIndex((registro) => registro.id === identidade.value));
  }

  function atualizar() {
    const selecionado = obterRegistros().find((registro) => registro.id === identidade.value);
    if (identidade.value && !selecionado) {
      identidade.value = "";
      input.value = "";
    } else if (selecionado) input.value = `${formatarCodigo(selecionado.codigo)} - ${selecionado.nome}`;
    aoSelecionar();
    if (!lista.hidden) abrir();
  }

  input.addEventListener("input", () => {
    identidade.value = "";
    limparErro(campoId);
    salvarErro.hidden = true;
    document.querySelector("#sucesso").hidden = true;
    aoSelecionar();
    abrir();
  });
  input.addEventListener("focus", abrir);
  input.addEventListener("click", abrir);
  input.addEventListener("blur", fechar);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      if (!lista.hidden) { event.preventDefault(); event.stopPropagation(); fechar(); }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (lista.hidden) abrir();
      if (resultados.length) destacar(event.key === "ArrowDown"
        ? (destacado + 1) % resultados.length
        : (destacado <= 0 ? resultados.length : destacado) - 1);
    } else if (event.key === "Enter") {
      // Enter dentro da busca não submete o orçamento por acidente.
      event.preventDefault();
      if (!lista.hidden && destacado >= 0) selecionar(resultados[destacado]);
    } else if (event.key === "Tab") fechar();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!container.contains(event.target)) fechar();
  });
  return { atualizar, fechar };
}

function filtrarServicos() {
  buscaServico.atualizar();
}

function campoVisivel(campo) {
  if (campo === "itens") return document.querySelector("#itens-regiao");
  if (campo === "clienteId") return form.elements["busca-cliente"];
  if (campo === "servicoId") return form.elements["busca-servico"];
  return form.elements[campo];
}

function atualizarServico() {
  const servico = servicos.find((item) => item.id === form.elements.servicoId.value);
  document.querySelector("#unidade").value = servico?.unidade || "";
  document.querySelector("#precoUnitario").value = servico ? formatarPreco(servico.preco) : "";
}

function atualizarCliente() {
  const cliente = clientes.find((item) => item.id === form.elements.clienteId.value);
  document.querySelector("#cliente-resumo").hidden = !cliente;
  document.querySelector("#copiar-aviso").hidden = true;
  if (!cliente) return;
  document.querySelector("#cliente-codigo").textContent = formatarCodigo(cliente.codigo);
  document.querySelector("#cliente-nome").textContent = cliente.nome;
  document.querySelector("#cliente-telefone").textContent = formatarTelefone(cliente.telefone);
  document.querySelector("#cliente-endereco").textContent = [cliente.rua, cliente.numero, cliente.cidade,
    cliente.cep ? `CEP ${formatarCep(cliente.cep)}` : ""].filter(Boolean).join(", ");
}

function copiarEndereco() {
  const cliente = clientes.find((item) => item.id === form.elements.clienteId.value);
  document.querySelector("#copiar-aviso").hidden = Boolean(cliente);
  if (!cliente) return;
  Object.entries(enderecoCliente(cliente)).forEach(([campo, valor]) => {
    form.elements[campo].value = campo === "cep" ? formatarCep(valor) : valor;
    limparErro(campo);
  });
}

function limparErro(campo) {
  const elemento = campoVisivel(campo);
  elemento.removeAttribute("aria-invalid");
  document.querySelector(`#erro-${campo}`).hidden = true;
}

function mostrarErros(erros) {
  Object.entries(erros).forEach(([campo, mensagem]) => {
    const elemento = campoVisivel(campo);
    elemento.setAttribute("aria-invalid", "true");
    const erro = document.querySelector(`#erro-${campo}`);
    erro.textContent = mensagem;
    erro.hidden = false;
  });
  const primeiro = Object.keys(erros)[0];
  if (primeiro) campoVisivel(primeiro).focus();
  return Boolean(primeiro);
}

function quantidadeValida(valor) { return Number.isFinite(valor) && valor > 0 && valor <= 99999.99; }
function duasCasas(valor) { return Math.abs(valor * 100 - Math.round(valor * 100)) < 0.000001; }

function adicionarServico() {
  camposItem.forEach(limparErro);
  const servico = servicos.find((item) => item.id === form.elements.servicoId.value);
  const quantidade = lerDecimal(form.elements.quantidade.value);
  const erros = {};
  if (!servico) erros.servicoId = "Selecione um serviço ativo.";
  if (!quantidadeValida(quantidade)) erros.quantidade = "Informe uma quantidade maior que zero e até 99.999,99, com até duas casas decimais.";
  if (mostrarErros(erros)) return;
  rascunho.adicionarItem({ servicoId: servico.id, codigoServico: servico.codigo, nomeServico: servico.nome,
    tipo: servico.tipo, unidade: servico.unidade, precoUnitario: servico.preco, quantidade });
  limparErro("itens");
  form.elements.servicoId.value = "";
  form.elements["busca-servico"].value = "";
  buscaServico.fechar();
  form.elements.quantidade.value = "";
  atualizarServico();
  renderizarItens();
  form.elements["busca-servico"].focus();
}

function renderizarItens() {
  const linhas = rascunho.itens.map((item) => {
    const linha = document.createElement("tr");
    [item.nomeServico, item.tipo, item.unidade, item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
      formatarPreco(item.precoUnitario), formatarPreco(item.calcularSubtotal())].forEach((valor, index) => {
      const celula = document.createElement("td");
      celula.textContent = valor;
      if (index === 0) celula.className = "client-name service-name";
      if (index >= 4) celula.className = "amount";
      linha.append(celula);
    });
    const acao = document.createElement("td");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "details-button danger-button";
    botao.textContent = "Remover";
    botao.setAttribute("aria-label", `Remover serviço ${item.nomeServico}`);
    botao.addEventListener("click", () => {
      rascunho.removerItem(item.id);
      renderizarItens();
      document.querySelector("#adicionar-servico").focus();
    });
    acao.append(botao);
    linha.append(acao);
    return linha;
  });
  document.querySelector("#lista-itens").replaceChildren(...linhas);
  document.querySelector("#itens-vazio").hidden = linhas.length > 0;
  atualizarTotais();
}

function lerDadosFormulario() {
  const dados = Object.fromEntries(campos.map((campo) => [campo, form.elements[campo].value.trim()]));
  dados.validadeDias = /^\d+$/.test(dados.validadeDias) ? Number(dados.validadeDias) : NaN;
  dados.adicionalValor = dados.adicionalValor ? lerDecimal(dados.adicionalValor) : 0;
  dados.descontoPercentual = lerDecimal(dados.descontoPercentual);
  return dados;
}

function atualizarTotais() {
  const dados = lerDadosFormulario();
  const adicionalValido = Number.isFinite(dados.adicionalValor) && dados.adicionalValor >= 0 && dados.adicionalValor <= 999999.99;
  const descontoValido = Number.isFinite(dados.descontoPercentual) && dados.descontoPercentual >= 0 && dados.descontoPercentual <= 100;
  rascunho.adicionalValor = adicionalValido ? dados.adicionalValor : 0;
  rascunho.descontoPercentual = descontoValido ? dados.descontoPercentual : 0;
  document.querySelector("#resumo-subtotal").textContent = formatarPreco(rascunho.calcularSubtotal());
  document.querySelector("#resumo-adicional").textContent = adicionalValido ? formatarPreco(rascunho.adicionalValor) : "—";
  const desconto = adicionalValido && descontoValido ? formatarPreco(rascunho.calcularValorDesconto()) : "—";
  document.querySelector("#resumo-desconto").textContent = desconto;
  document.querySelector("#valor-desconto").textContent = `Valor do desconto: ${desconto}`;
  document.querySelector("#resumo-total").textContent = adicionalValido && descontoValido ? formatarPreco(rascunho.calcularTotal()) : "—";
}

function atualizarValidade() {
  const dias = lerDadosFormulario().validadeDias;
  document.querySelector("#data-criacao").textContent = formatarData(rascunho.dataCriacao);
  document.querySelector("#data-criacao").setAttribute("datetime", rascunho.dataCriacao);
  const data = Orcamento.calcularDataValidade(rascunho.dataCriacao, dias);
  document.querySelector("#data-validade").textContent = `Válido até: ${formatarData(data)}`;
}

function atualizarContadores() {
  for (const [campo, limite] of [["condicoesPagamento", 200], ["observacoes", 500]]) {
    document.querySelector(`#contador-${campo}`).textContent = `${form.elements[campo].value.length} / ${limite}`;
  }
}

function validarDados(dados, itens = rascunho.itens) {
  const erros = {};
  if (!clientes.some((cliente) => cliente.id === dados.clienteId)) erros.clienteId = "Selecione um cliente ativo.";
  if (!Number.isInteger(dados.validadeDias) || dados.validadeDias < 1 || dados.validadeDias > 365) erros.validadeDias = "Informe de 1 a 365 dias.";
  if (!dados.rua.trim()) erros.rua = "Informe a rua da obra.";
  if (!dados.cidade.trim()) erros.cidade = "Informe a cidade da obra.";
  else if (!/^[\p{L}\p{M} '\u2019-]+$/u.test(dados.cidade) || !/\p{L}/u.test(dados.cidade)) erros.cidade = "Use somente letras, espaços, hífen ou apóstrofo.";
  if (dados.numero && !/^\d{1,8}$/.test(dados.numero)) erros.numero = "Use somente números, com no máximo 8 dígitos.";
  if (dados.cep && !/^\d{5}-?\d{3}$/.test(dados.cep)) erros.cep = "Informe os 8 dígitos do CEP.";
  if (!itens.length) erros.itens = "Adicione pelo menos um serviço ao orçamento.";
  else if (itens.some((item) => !quantidadeValida(item.quantidade) || !duasCasas(item.quantidade)
    || !Number.isFinite(item.precoUnitario) || item.precoUnitario <= 0 || item.precoUnitario > 999999.99
    || !servicos.some((servico) => servico.id === item.servicoId))) {
    erros.itens = "Há itens inválidos ou serviços que não estão mais ativos. Remova esses itens e adicione serviços ativos com quantidade válida.";
  }
  if (!Number.isFinite(dados.adicionalValor) || dados.adicionalValor < 0 || dados.adicionalValor > 999999.99 || !duasCasas(dados.adicionalValor)) erros.adicionalValor = "Informe um adicional de R$ 0,00 a R$ 999.999,99.";
  if (!Number.isFinite(dados.descontoPercentual) || dados.descontoPercentual < 0 || dados.descontoPercentual > 100 || !duasCasas(dados.descontoPercentual)) erros.descontoPercentual = "Informe de 0 a 100%, com até duas casas decimais.";
  for (const [campo, limite] of Object.entries({ rua: 120, cidade: 60, adicionalDescricao: 120, condicoesPagamento: 200, observacoes: 500 })) {
    if (dados[campo].length > limite) erros[campo] = `Use no máximo ${limite} caracteres.`;
  }
  return erros;
}

function salvarOrcamento(dados) {
  // Relê os cadastros antes de validar: exclusões/inativações em outra aba não passam.
  carregarCatalogos();
  if (mostrarErros(validarDados(dados))) return null;
  const { orcamentos, proximo } = carregarOrcamentos();
  const cliente = clientes.find((item) => item.id === dados.clienteId);
  const orcamento = new Orcamento({ ...dados, codigo: `ORC-${formatarCodigo(proximo)}`,
    dataCriacao: rascunho.dataCriacao, clienteCodigo: cliente.codigo, clienteNome: cliente.nome,
    clienteTelefone: cliente.telefone, clienteEndereco: enderecoCliente(cliente),
    enderecoObra: { rua: dados.rua, numero: dados.numero, cidade: dados.cidade, cep: somenteNumeros(dados.cep) },
    itens: rascunho.itens });
  const serializado = JSON.stringify([...orcamentos, orcamento]);
  // Reserva após validar. Falha de gravação pode deixar lacuna, mas nunca reutiliza o código.
  localStorage.setItem(CODIGO_KEY, String(proximo + 1));
  localStorage.setItem(STORAGE_KEY, serializado);
  return orcamento;
}

function estadoFormulario() {
  const valores = [...campos, ...camposItem, "tipo", "busca-cliente", "busca-servico"].map((campo) => {
    const texto = form.elements[campo].value.trim();
    // Uma máscara que apenas troca espaços ou acrescenta centavos não é uma alteração.
    if (campo === "adicionalValor" || campo === "descontoPercentual") {
      const numero = campo === "adicionalValor" && !texto ? 0 : lerDecimal(texto);
      if (Number.isFinite(numero)) return numero;
    }
    return texto;
  });
  return JSON.stringify({ campos: valores, itens: rascunho.itens });
}

function limparFormulario() {
  form.reset();
  // Inputs hidden mantêm o valor atribuído mesmo após form.reset() no navegador.
  form.elements.clienteId.value = "";
  form.elements.servicoId.value = "";
  rascunho = new Orcamento();
  [...campos, ...camposItem, "itens"].forEach(limparErro);
  salvarErro.hidden = true;
  buscaCliente.fechar();
  buscaServico.fechar();
  buscaCliente.atualizar();
  filtrarServicos();
  atualizarCliente();
  atualizarValidade();
  atualizarContadores();
  renderizarItens();
  estadoInicial = estadoFormulario();
}

function atualizarPagina() {
  try {
    carregarCatalogos();
    carregarOrcamentos();
    storageErro.hidden = true;
  } catch {
    clientes = [];
    servicos = [];
    storageErro.textContent = "Não foi possível carregar os cadastros ou a sequência de orçamentos. Os dados existentes foram preservados. Verifique o armazenamento do navegador e recarregue a página.";
    storageErro.hidden = false;
  }
  buscaCliente.atualizar();
  filtrarServicos();
  atualizarCliente();
}

const buscaCliente = criarBusca("cliente", "clienteId", () => clientes, atualizarCliente, "Nenhum cliente encontrado.");
const buscaServico = criarBusca("servico", "servicoId", () => servicos.filter((servico) =>
  form.elements.tipo.value === "todos" || servico.tipo === form.elements.tipo.value), atualizarServico, "Nenhum serviço encontrado.");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const botao = document.querySelector("#salvar-orcamento");
  if (botao.disabled) return;
  [...campos, "itens"].forEach(limparErro);
  salvarErro.hidden = true;
  document.querySelector("#sucesso").hidden = true;
  const dados = lerDadosFormulario();
  botao.disabled = true;
  try {
    const salvo = await comArmazenamento(() => salvarOrcamento(dados));
    if (!salvo) return;
    limparFormulario();
    const sucesso = document.querySelector("#sucesso");
    sucesso.textContent = `Orçamento ${salvo.codigo} salvo com sucesso.`;
    sucesso.hidden = false;
    sucesso.focus();
  } catch {
    salvarErro.textContent = "Não foi possível salvar. Verifique o armazenamento do navegador e os cadastros. As informações preenchidas foram mantidas.";
    salvarErro.hidden = false;
  } finally {
    botao.disabled = false;
  }
});

campos.forEach((campo) => form.elements[campo].addEventListener("input", () => {
  if (campo === "numero" || campo === "cep") {
    const input = form.elements[campo];
    const digitosAntes = somenteNumeros(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
    const numeros = somenteNumeros(input.value).slice(0, 8);
    input.value = campo === "cep" ? formatarCep(numeros) : numeros;
    let cursor = 0;
    let encontrados = 0;
    while (cursor < input.value.length && encontrados < digitosAntes) {
      if (/\d/.test(input.value[cursor])) encontrados++;
      cursor++;
    }
    input.setSelectionRange(cursor, cursor);
  }
  limparErro(campo);
  salvarErro.hidden = true;
  document.querySelector("#sucesso").hidden = true;
  if (campo === "validadeDias") atualizarValidade();
  if (campo === "adicionalValor" || campo === "descontoPercentual") atualizarTotais();
  if (campo === "condicoesPagamento" || campo === "observacoes") atualizarContadores();
}));
camposItem.forEach((campo) => form.elements[campo].addEventListener("input", () => limparErro(campo)));
form.elements.adicionalValor.addEventListener("blur", () => {
  const valor = form.elements.adicionalValor.value.trim();
  const numero = valor ? lerDecimal(valor) : 0;
  if (Number.isFinite(numero)) form.elements.adicionalValor.value = formatarPreco(numero);
});
form.elements.clienteId.addEventListener("change", atualizarCliente);
form.elements.tipo.addEventListener("change", filtrarServicos);
form.elements.servicoId.addEventListener("change", atualizarServico);
document.querySelector("#copiar-endereco").addEventListener("click", copiarEndereco);
document.querySelector("#adicionar-servico").addEventListener("click", adicionarServico);

function solicitarSaida(destino) {
  if (estadoFormulario() === estadoInicial) { window.location.href = destino; return; }
  destinoCancelamento = destino;
  modal.showModal();
  document.querySelector("#continuar-editando").focus();
}
document.querySelector("#cancelar").addEventListener("click", () => solicitarSaida("../index.html"));
document.querySelector("#continuar-editando").addEventListener("click", () => modal.close());
document.querySelector("#descartar").addEventListener("click", () => { window.location.href = destinoCancelamento; });
modal.addEventListener("cancel", (event) => event.preventDefault());
// Também protege a navegação pelos links da própria página.
document.querySelectorAll("a[href]").forEach((link) => link.addEventListener("click", (event) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
  event.preventDefault();
  solicitarSaida(link.getAttribute("href"));
}));
window.addEventListener("storage", (event) => {
  if (["pizzol_clientes", "pizzol_servicos", STORAGE_KEY, CODIGO_KEY, null].includes(event.key)) atualizarPagina();
});
atualizarPagina();
limparFormulario();
