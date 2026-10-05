const STORAGE_KEY = "pizzol_clientes";
const CODIGO_KEY = "pizzol_proximo_codigo_cliente";
const form = document.querySelector("#cliente-form");
const modal = document.querySelector("#cliente-modal");
const verModal = document.querySelector("#ver-modal");
const lista = document.querySelector("#lista-clientes");
const busca = document.querySelector("#busca");
const filtro = document.querySelector("#filtro-status");
const salvarErro = document.querySelector("#salvar-erro");
const storageErro = document.querySelector("#storage-error");
const excluirModal = document.querySelector("#excluir-modal");
const excluirErro = document.querySelector("#excluir-erro");
const limites = { nome: 80, rua: 120, cidade: 60, observacoes: 300 };
const campos = ["nome", "telefone", "status", "rua", "numero", "cidade", "cep", "observacoes"];
const obrigatorios = {
  nome: "Informe o nome.",
  telefone: "Informe o telefone.",
  rua: "Informe a rua.",
  cidade: "Informe a cidade.",
};
let clientes = [];
let editandoId = null;
let leituraFalhou = false;
let excluindoId = null;

// Serializa alterações entre abas quando o navegador oferece Web Locks.
function comArmazenamento(acao) {
  return navigator.locks ? navigator.locks.request(STORAGE_KEY, acao) : Promise.resolve().then(acao);
}

function formatarCodigo(numero) {
  return String(numero).padStart(3, "0");
}

function numeroCodigo(codigo) {
  const numero = Number(codigo);
  return /^\d+$/.test(String(codigo)) && Number.isSafeInteger(numero) && numero > 0 ? numero : 0;
}

function carregarClientes() {
  const dados = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  if (!Array.isArray(dados) || dados.some((item) => !item || typeof item !== "object" || Array.isArray(item)
    || campos.some((campo) => item[campo] != null && typeof item[campo] !== "string"))) {
    throw new Error("Formato de clientes inválido.");
  }
  const contadorSalvo = localStorage.getItem(CODIGO_KEY);
  if (contadorSalvo !== null && !numeroCodigo(contadorSalvo)) throw new Error("Sequência inválida.");
  let proximo = numeroCodigo(contadorSalvo) || 1;
  dados.forEach((item) => { proximo = Math.max(proximo, numeroCodigo(item.codigo) + 1); });
  const usados = new Set();
  let migracao = false;
  const atualizados = dados.map((item) => {
    let numero = numeroCodigo(item.codigo);
    if (!numero || usados.has(numero)) numero = proximo++;
    usados.add(numero);
    const codigo = formatarCodigo(numero);
    const id = item.id || crypto.randomUUID();
    if (item.codigo !== codigo || item.id !== id) migracao = true;
    return { ...item, id, codigo };
  });
  if (!Number.isSafeInteger(proximo)) throw new Error("Limite da sequência atingido.");
  // Reserva a sequência primeiro: uma falha posterior pode deixar lacunas, nunca reutilizar códigos.
  if (String(proximo) !== contadorSalvo) localStorage.setItem(CODIGO_KEY, String(proximo));
  if (migracao) localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizados));
  clientes = atualizados.map((item) => new Cliente(item));
  leituraFalhou = false;
  storageErro.hidden = true;
  return proximo;
}

function somenteNumeros(texto) { return texto.replace(/\D/g, ""); }

function formatarTelefone(texto) {
  const numeros = somenteNumeros(texto);
  if (!numeros) return "";
  if (numeros.length <= 2) return `(${numeros}`;
  const corte = numeros.length > 10 ? 7 : 6;
  const inicio = `(${numeros.slice(0, 2)}) ${numeros.slice(2, corte)}`;
  return numeros.length > corte ? `${inicio}-${numeros.slice(corte)}` : inicio;
}

function formatarCep(texto) {
  return somenteNumeros(texto).replace(/^(\d{5})(\d+)/, "$1-$2");
}

function nomeParaComparar(nome) {
  return nome.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function validarDados(dados) {
  const erros = {};
  Object.entries(obrigatorios).forEach(([campo, mensagem]) => {
    if (!dados[campo]) erros[campo] = mensagem;
  });
  Object.entries(limites).forEach(([campo, limite]) => {
    if (dados[campo].length > limite) erros[campo] = `Use no máximo ${limite} caracteres.`;
  });
  ["nome", "cidade"].forEach((campo) => {
    if (dados[campo] && !erros[campo] && (!/^[\p{L}\p{M} '\u2019-]+$/u.test(dados[campo]) || !/\p{L}/u.test(dados[campo]))) {
      erros[campo] = "Use somente letras, espaços, hífen ou apóstrofo.";
    }
  });
  if (dados.telefone && (!/^[\d\s()-]+$/.test(dados.telefone) || !/^\d{1,11}$/.test(somenteNumeros(dados.telefone)))) {
    erros.telefone = "Informe somente números, com no máximo 11 dígitos.";
  }
  if (dados.numero && !/^\d{1,8}$/.test(dados.numero)) erros.numero = "Use somente números, com no máximo 8 dígitos.";
  if (dados.cep && (!/^[\d-]+$/.test(dados.cep) || !/^\d{1,8}$/.test(somenteNumeros(dados.cep)))) {
    erros.cep = "Use somente números, com no máximo 8 dígitos.";
  }
  if (!["Ativo", "Inativo"].includes(dados.status)) erros.status = "Selecione Ativo ou Inativo.";
  return erros;
}

function normalizar(texto) {
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function criarStatus(status) {
  const etiqueta = document.createElement("span");
  etiqueta.className = `status ${status === "Ativo" ? "status-finalizado" : "status-inativo"}`;
  etiqueta.textContent = status;
  return etiqueta;
}

function listarClientes() {
  const termo = normalizar(busca.value);
  const filtrados = clientes.filter((cliente) => {
    const correspondeBusca = normalizar(cliente.nome).includes(termo)
      || normalizar(cliente.codigo).includes(termo);
    return correspondeBusca && (filtro.value === "todos" || cliente.status === filtro.value);
  });

  lista.replaceChildren();
  filtrados.forEach((cliente) => {
    const linha = document.createElement("tr");
    [cliente.codigo, cliente.nome, formatarTelefone(cliente.telefone), cliente.cidade, cliente.status, "—"].forEach((valor, index) => {
      const celula = document.createElement("td");
      if (index === 4) celula.append(criarStatus(valor));
      else celula.textContent = valor;
      if (index === 1) celula.className = "client-name";
      linha.append(celula);
    });
    const acoes = document.createElement("td");
    const botoes = document.createElement("div");
    botoes.className = "client-actions";
    ["Ver", "Editar", "Excluir"].forEach((acao) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = acao === "Excluir" ? "details-button danger-button" : "details-button";
      botao.textContent = acao;
      botao.setAttribute("aria-label", `${acao} cliente ${cliente.nome}`);
      botao.addEventListener("click", () => {
        if (acao === "Ver") visualizarCliente(cliente);
        else if (acao === "Editar") abrirFormulario(cliente);
        else abrirExclusao(cliente);
      });
      botoes.append(botao);
    });
    acoes.append(botoes);
    linha.append(acoes);
    lista.append(linha);
  });

  const total = clientes.length;
  document.querySelector("#contador").textContent = total === 1 ? "1 cliente cadastrado" : `${total} clientes cadastrados`;
  document.querySelector("#estado-vazio").hidden = filtrados.length > 0 || leituraFalhou;
  document.querySelector("#vazio-titulo").textContent = total ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado.";
  document.querySelector("#vazio-descricao").textContent = total ? "Tente outro código, nome ou status." : "Cadastre seu primeiro cliente para começar.";
}

function limparErro(campo) {
  form.elements[campo].removeAttribute("aria-invalid");
  document.querySelector(`#erro-${campo}`).hidden = true;
}

function abrirFormulario(cliente = null) {
  form.reset();
  campos.forEach(limparErro);
  salvarErro.hidden = true;
  editandoId = cliente ? cliente.id : null;
  document.querySelector("#form-titulo").textContent = cliente ? "Editar Cliente" : "Novo Cliente";
  document.querySelector("#salvar-cliente").textContent = cliente ? "Salvar Alterações" : "Salvar Cliente";
  if (cliente) {
    Array.from(form.elements).forEach((campo) => {
      if (campo.name) campo.value = cliente[campo.name];
    });
    form.elements.telefone.value = formatarTelefone(cliente.telefone);
    form.elements.cep.value = formatarCep(cliente.cep);
  }
  atualizarContadorObservacoes();
  modal.showModal();
  form.elements.nome.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  salvarErro.hidden = true;
  campos.forEach(limparErro);
  const dados = Object.fromEntries(new FormData(form));
  Object.keys(dados).forEach((campo) => { dados[campo] = dados[campo].trim(); });
  const erros = validarDados(dados);
  Object.entries(erros).forEach(([campo, mensagem]) => {
    form.elements[campo].setAttribute("aria-invalid", "true");
    const erro = document.querySelector(`#erro-${campo}`);
    erro.textContent = mensagem;
    erro.hidden = false;
  });
  if (Object.keys(erros).length) {
    form.elements[Object.keys(erros)[0]].focus();
    return;
  }
  dados.telefone = somenteNumeros(dados.telefone);
  dados.cep = somenteNumeros(dados.cep);
  const botaoSalvar = document.querySelector("#salvar-cliente");
  if (botaoSalvar.disabled) return;
  botaoSalvar.disabled = true;
  const id = editandoId;
  try {
    await comArmazenamento(() => {
      const proximo = carregarClientes();
      const existente = clientes.find((cliente) => cliente.id === id);
      if (id && !existente) {
        salvarErro.textContent = "Este cliente não está mais cadastrado. Feche o formulário e atualize a página.";
        salvarErro.hidden = false;
        return;
      }
      const outrosClientes = clientes.filter((cliente) => cliente.id !== id);
      const errosDuplicidade = {};
      if (outrosClientes.some((cliente) => nomeParaComparar(cliente.nome) === nomeParaComparar(dados.nome))) {
        errosDuplicidade.nome = "Já existe um cliente cadastrado com este nome.";
      }
      if (outrosClientes.some((cliente) => somenteNumeros(cliente.telefone) === dados.telefone)) {
        errosDuplicidade.telefone = "Já existe um cliente cadastrado com este telefone.";
      }
      Object.entries(errosDuplicidade).forEach(([campo, mensagem]) => {
        form.elements[campo].setAttribute("aria-invalid", "true");
        const erro = document.querySelector(`#erro-${campo}`);
        erro.textContent = mensagem;
        erro.hidden = false;
      });
      if (Object.keys(errosDuplicidade).length) {
        form.elements[Object.keys(errosDuplicidade)[0]].focus();
        return;
      }
      const codigo = existente ? existente.codigo : formatarCodigo(proximo);
      if (!existente) {
        if (!Number.isSafeInteger(proximo + 1)) throw new Error("Limite da sequência atingido.");
        localStorage.setItem(CODIGO_KEY, String(proximo + 1));
      }
      const cliente = new Cliente({ ...dados, id, codigo });
      const atualizados = id ? clientes.map((atual) => atual.id === id ? cliente : atual) : [...clientes, cliente];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizados));
      clientes = atualizados;
      modal.close();
      listarClientes();
      document.querySelector("#novo-cliente").focus();
    });
  } catch {
    salvarErro.textContent = "Não foi possível salvar. Verifique o armazenamento do navegador e tente novamente.";
    salvarErro.hidden = false;
  } finally {
    botaoSalvar.disabled = false;
  }
});

function abrirExclusao(cliente) {
  excluindoId = cliente.id;
  excluirErro.hidden = true;
  document.querySelector("#excluir-mensagem").textContent = `O cliente ${cliente.nome} será removido do sistema. Essa ação não poderá ser desfeita.`;
  excluirModal.showModal();
  document.querySelector("#cancelar-exclusao").focus();
}

document.querySelector("#confirmar-exclusao").addEventListener("click", async () => {
  const botao = document.querySelector("#confirmar-exclusao");
  if (botao.disabled || !excluindoId) return;
  botao.disabled = true;
  const id = excluindoId;
  try {
    await comArmazenamento(() => {
      carregarClientes();
      const atualizados = clientes.filter((cliente) => cliente.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizados));
      clientes = atualizados;
      excluirModal.close();
      listarClientes();
      document.querySelector("#novo-cliente").focus();
    });
  } catch {
    excluirErro.textContent = "Não foi possível excluir. Verifique o armazenamento do navegador e tente novamente.";
    excluirErro.hidden = false;
  } finally {
    botao.disabled = false;
  }
});
excluirModal.addEventListener("close", () => { excluindoId = null; });

function visualizarCliente(cliente) {
  document.querySelector("#ver-nome").textContent = cliente.nome;
  document.querySelector("#ver-status").replaceWith(Object.assign(criarStatus(cliente.status), { id: "ver-status" }));
  document.querySelector("#ver-telefone").textContent = formatarTelefone(cliente.telefone);
  document.querySelector("#ver-endereco").textContent = cliente.enderecoCompleto();
  document.querySelector("#ver-cidade").textContent = cliente.cidade;
  document.querySelector("#ver-cep").textContent = `CEP: ${formatarCep(cliente.cep)}`;
  document.querySelector("#ver-cep").hidden = !cliente.cep;
  document.querySelector("#observacoes-secao").hidden = !cliente.observacoes;
  document.querySelector("#ver-observacoes").textContent = cliente.observacoes;
  verModal.showModal();
}

document.querySelector("#novo-cliente").addEventListener("click", () => abrirFormulario());
busca.addEventListener("input", listarClientes);
filtro.addEventListener("change", listarClientes);
function atualizarContadorObservacoes() {
  document.querySelector("#contador-observacoes").textContent = `${form.elements.observacoes.value.length} / 300`;
}

function aplicarMascara(campo, limite, formatar) {
  const input = form.elements[campo];
  const posicao = input.selectionStart ?? input.value.length;
  const antesDoCursor = somenteNumeros(input.value.slice(0, posicao)).length;
  input.value = formatar(somenteNumeros(input.value).slice(0, limite));
  // Mantém o cursor perto do dígito editado, inclusive ao colar no meio do texto.
  let cursor = 0;
  let encontrados = 0;
  while (cursor < input.value.length && encontrados < antesDoCursor) {
    if (/\d/.test(input.value[cursor])) encontrados++;
    cursor++;
  }
  input.setSelectionRange(cursor, cursor);
}

campos.forEach((campo) => {
  form.elements[campo].addEventListener("input", () => {
    if (campo === "telefone") aplicarMascara(campo, 11, formatarTelefone);
    if (campo === "cep") aplicarMascara(campo, 8, formatarCep);
    if (campo === "numero") aplicarMascara(campo, 8, (numeros) => numeros);
    if (limites[campo]) form.elements[campo].value = form.elements[campo].value.slice(0, limites[campo]);
    if (campo === "observacoes") atualizarContadorObservacoes();
    limparErro(campo);
    salvarErro.hidden = true;
  });
});
document.querySelectorAll("[data-close]").forEach((botao) => {
  botao.addEventListener("click", () => botao.closest("dialog").close());
});
document.querySelectorAll("dialog").forEach((dialog) => {
  // O fechamento fica restrito aos botões e às ações concluídas com sucesso.
  dialog.addEventListener("cancel", (event) => event.preventDefault());
});

comArmazenamento(() => {
  try {
    carregarClientes();
  } catch {
    leituraFalhou = true;
    storageErro.textContent = "Não foi possível carregar os clientes ou sua sequência de códigos. Os dados foram preservados. Verifique o armazenamento do navegador e recarregue a página.";
    storageErro.hidden = false;
  }
  listarClientes();
});
