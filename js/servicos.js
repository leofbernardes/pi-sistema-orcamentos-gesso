const STORAGE_KEY = "pizzol_servicos";
const CODIGO_KEY = "pizzol_proximo_codigo_servico";
const TIPOS = [
  "Forro",
  "Parede",
  "Sanca / Cortineiro",
  "Moldura",
  "Gesso Liso",
  "Outro",
];
const UNIDADES = ["m²", "metro linear", "unidade"];
const campos = ["tipo", "nome", "unidade", "preco", "status", "descricao"];
const form = document.querySelector("#servico-form");
const modal = document.querySelector("#servico-modal");
const verModal = document.querySelector("#ver-modal");
const excluirModal = document.querySelector("#excluir-modal");
const lista = document.querySelector("#lista-servicos");
const busca = document.querySelector("#busca");
const filtroTipo = document.querySelector("#filtro-tipo");
const filtroStatus = document.querySelector("#filtro-status");
const salvarErro = document.querySelector("#salvar-erro");
const excluirErro = document.querySelector("#excluir-erro");
const storageErro = document.querySelector("#storage-error");
let servicos = [];
let editandoId = null;
let excluindoId = null;
let leituraFalhou = false;

// Segue o padrão de Clientes para evitar gravações simultâneas entre abas.
function comArmazenamento(acao) {
  return navigator.locks
    ? navigator.locks.request(STORAGE_KEY, acao)
    : Promise.resolve().then(acao);
}

function formatarCodigo(numero) {
  return String(numero).padStart(3, "0");
}

function numeroCodigo(codigo) {
  const numero = Number(codigo);
  return /^\d+$/.test(String(codigo)) &&
    Number.isSafeInteger(numero) &&
    numero > 0
    ? numero
    : 0;
}

function normalizarNome(nome) {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function lerPreco(texto) {
  const valor = texto.trim().replace(/^R\$\s*/, "");
  // Aceita 95, 95,50 e 1.250,50; rejeita formatos ambíguos e mais de duas casas decimais.
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(valor)) return NaN;
  return Number(valor.replace(/\./g, "").replace(",", "."));
}

function formatarPreco(preco) {
  return preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function validarDados(dados) {
  const erros = {};
  if (!TIPOS.includes(dados.tipo)) erros.tipo = "Selecione o tipo de serviço.";
  if (!dados.nome.trim()) erros.nome = "Informe o nome do serviço.";
  else if (dados.nome.length > 80) erros.nome = "Use no máximo 80 caracteres.";
  if (!UNIDADES.includes(dados.unidade))
    erros.unidade = "Selecione a unidade de medida.";
  if (!Number.isFinite(dados.preco) || dados.preco <= 0)
    erros.preco = "Informe um preço válido maior que R$ 0,00.";
  else if (dados.preco > 999999.99)
    erros.preco = "O preço máximo é R$ 999.999,99.";
  if (!["Ativo", "Inativo"].includes(dados.status))
    erros.status = "Selecione Ativo ou Inativo.";
  if (dados.descricao.length > 300)
    erros.descricao = "Use no máximo 300 caracteres.";
  return erros;
}

function carregarServicos() {
  const dados = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const ids = new Set();
  const codigos = new Set();
  if (!Array.isArray(dados)) throw new Error("Formato de serviços inválido.");
  dados.forEach((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      !numeroCodigo(item.codigo) ||
      codigos.has(numeroCodigo(item.codigo)) ||
      campos.some(
        (campo) =>
          typeof item[campo] !== (campo === "preco" ? "number" : "string"),
      )
    ) {
      throw new Error("Registro de serviço inválido.");
    }
    ids.add(item.id);
    codigos.add(numeroCodigo(item.codigo));
  });
  const contador = localStorage.getItem(CODIGO_KEY);
  if (contador !== null && !numeroCodigo(contador))
    throw new Error("Sequência inválida.");
  let proximo = numeroCodigo(contador) || 1;
  codigos.forEach((codigo) => {
    proximo = Math.max(proximo, codigo + 1);
  });
  if (!Number.isSafeInteger(proximo))
    throw new Error("Limite da sequência atingido.");

  servicos = dados.map((item) => Object.assign(new Servico(item), item));
  leituraFalhou = false;
  storageErro.hidden = true;
  return proximo;
}

function criarStatus(status) {
  const etiqueta = document.createElement("span");
  etiqueta.className = `status ${status === "Ativo" ? "status-finalizado" : "status-inativo"}`;
  etiqueta.textContent = status;
  return etiqueta;
}

function criarLinha(servico) {
  const linha = document.createElement("tr");
  const valores = [
    formatarCodigo(servico.codigo),
    servico.nome,
    servico.tipo,
    servico.unidade,
    servico.precoFormatado(),
    servico.status,
  ];
  valores.forEach((valor, index) => {
    const celula = document.createElement("td");
    if (index === 5) celula.append(criarStatus(valor));
    else celula.textContent = valor;
    if (index === 1) celula.className = "client-name service-name";
    if (index === 4) celula.className = "amount";
    linha.append(celula);
  });
  const acoes = document.createElement("td");
  const botoes = document.createElement("div");
  botoes.className = "client-actions";
  const operacoes = {
    Ver: visualizarServico,
    Editar: abrirFormulario,
    Excluir: abrirExclusao,
  };
  Object.entries(operacoes).forEach(([acao, executar]) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className =
      acao === "Excluir" ? "details-button danger-button" : "details-button";
    botao.textContent = acao;
    botao.setAttribute("aria-label", `${acao} serviço ${servico.nome}`);
    botao.addEventListener("click", () => executar(servico));
    botoes.append(botao);
  });
  acoes.append(botoes);
  linha.append(acoes);
  return linha;
}

function listarServicos() {
  const termo = normalizarNome(busca.value);
  const filtrados = servicos.filter((servico) => {
    const correspondeBusca =
      normalizarNome(servico.nome).includes(termo) ||
      formatarCodigo(servico.codigo).includes(termo);
    return (
      correspondeBusca &&
      (filtroTipo.value === "todos" || servico.tipo === filtroTipo.value) &&
      (filtroStatus.value === "todos" || servico.status === filtroStatus.value)
    );
  });
  lista.replaceChildren(...filtrados.map(criarLinha));
  const total = servicos.length;
  document.querySelector("#contador").textContent =
    total === 1 ? "1 serviço cadastrado" : `${total} serviços cadastrados`;
  document.querySelector("#estado-vazio").hidden =
    filtrados.length > 0 || leituraFalhou;
  document.querySelector("#vazio-titulo").textContent = total
    ? "Nenhum serviço encontrado."
    : "Nenhum serviço cadastrado.";
  document.querySelector("#vazio-descricao").textContent = total
    ? "Tente outro código, nome, tipo ou status."
    : "Cadastre os serviços utilizados pela Pizzol para começar a criar orçamentos.";
  document.querySelector("#novo-servico-vazio").hidden = total > 0;
}

function limparErro(campo) {
  form.elements[campo].removeAttribute("aria-invalid");
  document.querySelector(`#erro-${campo}`).hidden = true;
}

function mostrarErros(erros) {
  Object.entries(erros).forEach(([campo, mensagem]) => {
    form.elements[campo].setAttribute("aria-invalid", "true");
    const erro = document.querySelector(`#erro-${campo}`);
    erro.textContent = mensagem;
    erro.hidden = false;
  });
  const primeiro = Object.keys(erros)[0];
  if (primeiro) form.elements[primeiro].focus();
  return Boolean(primeiro);
}

function atualizarContadorDescricao() {
  document.querySelector("#contador-descricao").textContent =
    `${form.elements.descricao.value.length} / 300`;
}

function abrirFormulario(servico = null) {
  form.reset();
  campos.forEach(limparErro);
  salvarErro.hidden = true;
  editandoId = servico ? servico.id : null;
  document.querySelector("#form-titulo").textContent = servico
    ? "Editar Serviço"
    : "Novo Serviço";
  document.querySelector("#salvar-servico").textContent = servico
    ? "Salvar Alterações"
    : "Salvar Serviço";
  if (servico) {
    campos.forEach((campo) => {
      form.elements[campo].value = servico[campo];
    });
    form.elements.preco.value = servico.precoFormatado();
  }
  atualizarContadorDescricao();
  modal.showModal();
  form.elements.tipo.focus();
}

function salvarServico(dados, id) {
  const proximo = carregarServicos();
  const existente = servicos.find((servico) => servico.id === id);
  if (id && !existente) throw new Error("Serviço removido em outra aba.");
  const duplicado = servicos.some(
    (servico) =>
      servico.id !== id &&
      servico.tipo === dados.tipo &&
      normalizarNome(servico.nome) === normalizarNome(dados.nome),
  );
  if (duplicado) {
    mostrarErros({ nome: "Já existe um serviço com este nome neste tipo." });
    return;
  }
  const codigo = existente ? existente.codigo : formatarCodigo(proximo);
  const seguinte = existente ? proximo : proximo + 1;
  if (!Number.isSafeInteger(seguinte))
    throw new Error("Limite da sequência atingido.");
  const servico = Object.assign(
    new Servico({ ...dados, id, codigo }),
    existente,
    dados,
  );
  const atualizados = existente
    ? servicos.map((atual) => (atual.id === id ? servico : atual))
    : [...servicos, servico];
  // Reserva antes da gravação. Se houver falha, pode haver uma lacuna, nunca reuso.
  localStorage.setItem(CODIGO_KEY, String(seguinte));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizados));
  servicos = atualizados;
  modal.close();
  listarServicos();
  document.querySelector("#novo-servico").focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const botao = document.querySelector("#salvar-servico");
  if (botao.disabled) return;
  salvarErro.hidden = true;
  campos.forEach(limparErro);
  const dados = Object.fromEntries(new FormData(form));
  dados.nome = dados.nome.trim();
  dados.preco = lerPreco(dados.preco);
  if (mostrarErros(validarDados(dados))) return;
  botao.disabled = true;
  const id = editandoId;
  try {
    await comArmazenamento(() => salvarServico(dados, id));
  } catch {
    salvarErro.textContent =
      "Não foi possível salvar. Verifique o armazenamento do navegador e se o serviço ainda está cadastrado.";
    salvarErro.hidden = false;
  } finally {
    botao.disabled = false;
  }
});

function visualizarServico(servico) {
  ["codigo", "nome", "tipo", "unidade", "descricao"].forEach((campo) => {
    document.querySelector(`#ver-${campo}`).textContent =
      campo === "codigo" ? formatarCodigo(servico.codigo) : servico[campo];
  });
  document.querySelector("#ver-preco").textContent = servico.precoFormatado();
  document
    .querySelector("#ver-status")
    .replaceWith(
      Object.assign(criarStatus(servico.status), { id: "ver-status" }),
    );
  document.querySelector("#descricao-secao").hidden = !servico.descricao.trim();
  verModal.showModal();
}

function abrirExclusao(servico) {
  excluindoId = servico.id;
  excluirErro.hidden = true;
  document.querySelector("#excluir-mensagem").textContent =
    `O serviço ${servico.nome} será removido do sistema. Essa ação não poderá ser desfeita.`;
  excluirModal.showModal();
  document.querySelector("#cancelar-exclusao").focus();
}

document
  .querySelector("#confirmar-exclusao")
  .addEventListener("click", async () => {
    const botao = document.querySelector("#confirmar-exclusao");
    if (botao.disabled || !excluindoId) return;
    botao.disabled = true;
    const id = excluindoId;
    try {
      await comArmazenamento(() => {
        const proximo = carregarServicos();
        const atualizados = servicos.filter((servico) => servico.id !== id);
        // Preserva também a sequência de registros preexistentes que ainda não tinham contador.
        localStorage.setItem(CODIGO_KEY, String(proximo));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizados));
        servicos = atualizados;
        excluirModal.close();
        listarServicos();
        document.querySelector("#novo-servico").focus();
      });
    } catch {
      excluirErro.textContent =
        "Não foi possível excluir. Verifique o armazenamento do navegador e tente novamente.";
      excluirErro.hidden = false;
    } finally {
      botao.disabled = false;
    }
  });
excluirModal.addEventListener("close", () => {
  excluindoId = null;
});

["#novo-servico", "#novo-servico-vazio"].forEach((seletor) => {
  document
    .querySelector(seletor)
    .addEventListener("click", () => abrirFormulario());
});
busca.addEventListener("input", listarServicos);
filtroTipo.addEventListener("change", listarServicos);
filtroStatus.addEventListener("change", listarServicos);
form.elements.preco.addEventListener("blur", () => {
  const preco = lerPreco(form.elements.preco.value);
  if (Number.isFinite(preco)) form.elements.preco.value = formatarPreco(preco);
});
campos.forEach((campo) => {
  form.elements[campo].addEventListener("input", () => {
    limparErro(campo);
    if (campo === "tipo") limparErro("nome");
    if (campo === "descricao") atualizarContadorDescricao();
    salvarErro.hidden = true;
  });
});
document.querySelectorAll("[data-close]").forEach((botao) => {
  botao.addEventListener("click", () => botao.closest("dialog").close());
});
document.querySelectorAll("dialog").forEach((dialog) => {
  // Clicar no overlay ou pressionar Esc não descarta os dados digitados.
  dialog.addEventListener("cancel", (event) => event.preventDefault());
});

function atualizarPagina() {
  try {
    carregarServicos();
  } catch {
    leituraFalhou = true;
    storageErro.textContent =
      "Não foi possível carregar os serviços ou sua sequência de códigos. Os dados foram preservados. Verifique o armazenamento do navegador e recarregue a página.";
    storageErro.hidden = false;
  }
  listarServicos();
}

window.addEventListener("storage", (event) => {
  if (
    event.key === STORAGE_KEY ||
    event.key === CODIGO_KEY ||
    event.key === null
  )
    atualizarPagina();
});
atualizarPagina();
