const STORAGE_KEY = "pizzol_orcamentos";
const CODIGO_KEY = "pizzol_proximo_codigo_orcamento";
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

// Chamadas dentro de comArmazenamento releem a lista antes de gravar.
function alterarOrcamento(id, transformar) {
  const { orcamentos } = carregarOrcamentos();
  const indice = orcamentos.findIndex((item) => item.id === id);
  if (indice < 0) throw new Error("Orçamento não encontrado. Atualize a página.");
  const atualizado = transformar(orcamentos[indice]);
  orcamentos[indice] = atualizado;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orcamentos));
  return atualizado;
}

function excluirOrcamento(id) {
  const { orcamentos, proximo } = carregarOrcamentos();
  if (!orcamentos.some((item) => item.id === id)) throw new Error("Orçamento não encontrado. Atualize a página.");
  // Reserva inclusive sequências antigas que ainda não tinham contador persistido.
  localStorage.setItem(CODIGO_KEY, String(proximo));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orcamentos.filter((item) => item.id !== id)));
}

