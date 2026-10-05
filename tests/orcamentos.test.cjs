// Ambiente isolado, seguindo os testes de Serviços. Não acessa dados do navegador.
// Execute: node --test tests/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const raiz = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "pages/novo-orcamento.html"), "utf8");
const codigo = ["js/models/item-orcamento.js", "js/models/orcamento.js", "js/novo-orcamento.js"]
  .map((arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8")).join("\n");

function elemento() {
  return {
    value: "", hidden: false, disabled: false, required: false, textContent: "", children: [], listeners: {}, attributes: {},
    addEventListener(evento, acao) { this.listeners[evento] = acao; },
    setAttribute(nome, valor) { this.attributes[nome] = valor; },
    getAttribute(nome) { return this.attributes[nome]; },
    removeAttribute(nome) { delete this.attributes[nome]; },
    append(...filhos) { this.children.push(...filhos); },
    replaceChildren(...filhos) { this.children = filhos; },
    focus() { this.focused = true; },
    scrollIntoView() {},
    contains(alvo) { return this === alvo || this.children.some((filho) => filho.contains(alvo)); },
    setSelectionRange() {},
    showModal() { this.open = true; }, close() { this.open = false; },
  };
}

function ambiente(inicial = {}) {
  const elementos = new Map([...html.matchAll(/id="([^"]+)"/g)].map((match) => [`#${match[1]}`, elemento()]));
  const obter = (seletor) => {
    assert.ok(elementos.has(seletor), `Elemento existe no HTML: ${seletor}`);
    return elementos.get(seletor);
  };
  for (const [tag, id] of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    obter(`#${id}`).hidden = /\bhidden(?:\s|>)/.test(tag);
  }
  const controles = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*id="([^"]+)"[^>]*>/g)];
  const form = obter("#orcamento-form");
  form.elements = Object.fromEntries(controles.map(([, id]) => [id, obter(`#${id}`)]));
  form.reset = () => controles.forEach(([tag, id]) => {
    if (tag.includes('type="hidden"')) return;
    form.elements[id].value = tag.match(/\bvalue="([^"]*)"/)?.[1] ?? (id === "tipo" ? "todos" : "");
  });
  form.reset();
  const dados = new Map(Object.entries(inicial));
  const storage = {
    getItem(chave) { return dados.get(chave) ?? null; },
    setItem(chave, valor) { dados.set(chave, String(valor)); },
  };
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(([, href]) => {
    const link = elemento(); link.attributes.href = href; return link;
  });
  const janela = { listeners: {}, location: { href: "" }, addEventListener(evento, acao) { this.listeners[evento] = acao; } };
  const documento = { querySelector: obter, querySelectorAll: () => links, createElement: elemento, listeners: {},
    addEventListener(evento, acao) { (this.listeners[evento] ||= []).push(acao); } };
  for (const nome of ["cliente", "servico"]) {
    obter(`#autocomplete-${nome}`).append(obter(`#busca-${nome}`), obter(`#resultados-${nome}`));
  }
  const contexto = vm.createContext({
    document: documento,
    window: janela, navigator: {}, localStorage: storage, crypto: { randomUUID },
  });
  vm.runInContext(codigo, contexto);
  return { run: (texto) => vm.runInContext(texto, contexto), obter, dados, storage, janela, links, documento };
}

const cliente = { id: "c1", codigo: "001", nome: "Cliente de teste", telefone: "27999999999", status: "Ativo", rua: "Rua A", numero: "12", cidade: "Vitória", cep: "29000000" };
const servicoA = { id: "s1", codigo: "001", nome: "Forro de teste", tipo: "Forro", unidade: "m²", preco: 95, status: "Ativo" };
const servicoB = { ...servicoA, id: "s2", codigo: "002", nome: "Parede de teste", tipo: "Parede", preco: 140 };
const catalogos = () => ({ pizzol_clientes: JSON.stringify([cliente, { ...cliente, id: "c2", codigo: "002", status: "Inativo" }]),
  pizzol_servicos: JSON.stringify([servicoA, servicoB, { ...servicoA, id: "s3", codigo: "003", status: "Inativo" }]) });
const registros = (app) => JSON.parse(app.dados.get("pizzol_orcamentos") || "[]");
function preencher(app, valores) { Object.entries(valores).forEach(([campo, valor]) => { app.obter(`#${campo}`).value = String(valor); }); }
function pesquisar(app, nome, texto) {
  preencher(app, { [`busca-${nome}`]: texto });
  app.obter(`#busca-${nome}`).listeners.input();
  return app.obter(`#resultados-${nome}`).children;
}
function selecionar(app, nome, id) {
  const chave = nome === "cliente" ? "pizzol_clientes" : "pizzol_servicos";
  let catalogo;
  try { catalogo = JSON.parse(app.dados.get(chave) || "[]"); } catch { catalogo = []; }
  const registro = Array.isArray(catalogo) && catalogo.find((item) => item.id === id);
  const opcoes = pesquisar(app, nome, registro ? registro.codigo : id);
  const rotulo = registro && `${String(registro.codigo).padStart(3, "0")} - ${registro.nome}`;
  opcoes.find((opcao) => opcao.textContent === rotulo)?.listeners.click();
}
function adicionar(app, id = "s1", quantidade = "62") {
  selecionar(app, "servico", id);
  preencher(app, { quantidade }); app.obter("#adicionar-servico").listeners.click();
}
function preparar(app) {
  selecionar(app, "cliente", "c1");
  preencher(app, { rua: "Rua da obra", cidade: "São Paulo" }); adicionar(app);
}
async function enviar(app) { await app.obter("#orcamento-form").listeners.submit({ preventDefault() {} }); }

test("inicia sem orçamento, não grava dados fictícios e todos os links/recursos existem", () => {
  const app = ambiente();
  assert.equal(app.dados.size, 0);
  assert.equal(app.run("rascunho.itens.length"), 0);
  assert.equal(app.obter("#itens-vazio").hidden, false);
  assert.doesNotMatch(html, /clientes-vazio|servicos-vazio|Cadastrar cliente|Gerenciar serviços/);
  assert.equal(pesquisar(app, "cliente", "")[0].textContent, "Nenhum cliente encontrado.");
  assert.equal(pesquisar(app, "servico", "")[0].textContent, "Nenhum serviço encontrado.");
  for (const [, destino] of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(path.resolve(raiz, "pages", destino)), destino);
  assert.equal(app.obter("#validadeDias").value, "7");
  assert.equal(app.obter("#condicoesPagamento").value, "");
  assert.equal(app.obter("#observacoes").value, "");
});

test("somente clientes e serviços ativos; filtro de tipo, unidade e preço somente leitura", () => {
  const app = ambiente(catalogos());
  assert.deepEqual(pesquisar(app, "cliente", "").map((x) => x.textContent), ["001 - Cliente de teste"]);
  assert.deepEqual(pesquisar(app, "servico", "").map((x) => x.textContent), ["001 - Forro de teste", "002 - Parede de teste"]);
  preencher(app, { tipo: "Parede" }); app.obter("#tipo").listeners.change();
  assert.deepEqual(app.obter("#resultados-servico").children.map((x) => x.textContent), ["002 - Parede de teste"]);
  selecionar(app, "servico", "s2");
  assert.equal(app.obter("#unidade").value, "m²");
  assert.match(app.obter("#precoUnitario").value, /140,00/);
  assert.match(html, /id="precoUnitario" readonly/);
  assert.match(html, /id="unidade" readonly/);
  preencher(app, { tipo: "Outro" }); app.obter("#tipo").listeners.change();
  assert.equal(pesquisar(app, "servico", "")[0].textContent, "Nenhum serviço encontrado.");
  assert.equal(app.obter("#servicoId").value, "");
  assert.equal(app.obter("#unidade").value, "");
});

test("cliente: pesquisa código, nome parcial, acentos, caixa e espaços; exclui inativos", () => {
  const app = ambiente({ ...catalogos(), pizzol_clientes: JSON.stringify([
    { ...cliente, codigo: "005", nome: "Léonardo   Bernardes" },
    { ...cliente, id: "inativo", codigo: "006", nome: "Léonardo inativo", status: "Inativo" },
  ]) });
  for (const termo of ["005", "05", "leo", "LEONARDO", "  leonardo   bern  ", "bernard"]) {
    const opcoes = pesquisar(app, "cliente", termo);
    assert.deepEqual(opcoes.map((item) => item.textContent), ["005 - Léonardo   Bernardes"], termo);
    assert.equal(app.obter("#clienteId").value, "");
  }
  assert.equal(pesquisar(app, "cliente", "006")[0].textContent, "Nenhum cliente encontrado.");
  pesquisar(app, "cliente", "leo")[0].listeners.click();
  assert.equal(app.obter("#clienteId").value, "c1");
  assert.equal(app.obter("#busca-cliente").value, "005 - Léonardo   Bernardes");
  assert.equal(app.obter("#resultados-cliente").hidden, true);
  assert.equal(app.obter("#cliente-resumo").hidden, false);
  app.obter("#busca-cliente").listeners.click();
  assert.equal(app.obter("#resultados-cliente").children[0].attributes["aria-selected"], "true");
});

test("cliente: texto digitado, alterado ou apagado invalida seleção e impede salvar", async () => {
  const app = ambiente(catalogos()); preparar(app);
  for (const texto of ["001 - Cliente de teste", "Cliente", ""]) {
    selecionar(app, "cliente", "c1");
    pesquisar(app, "cliente", texto);
    assert.equal(app.obter("#clienteId").value, "");
    assert.equal(app.obter("#cliente-resumo").hidden, true);
    await enviar(app);
    assert.equal(registros(app).length, 0);
    assert.equal(app.obter("#erro-clienteId").hidden, false);
    assert.equal(app.obter("#busca-cliente").attributes["aria-invalid"], "true");
    assert.equal(app.obter("#busca-cliente").focused, true);
    assert.equal(app.dados.has("pizzol_proximo_codigo_orcamento"), false);
    app.obter("#copiar-endereco").listeners.click();
    assert.equal(app.obter("#copiar-aviso").hidden, false);
  }
});

test("serviço: pesquisa código, nome parcial, acentos, caixa e espaços; exclui inativos", () => {
  const app = ambiente({ ...catalogos(), pizzol_servicos: JSON.stringify([
    { ...servicoA, codigo: "022", nome: "Moldúra   Decorada 1", tipo: "Moldura" },
    { ...servicoB, codigo: "023", nome: "Moldura 2", tipo: "Moldura", status: "Inativo" },
  ]) });
  for (const termo of ["022", "22", "mold", "MOLDURA", " moldura  decorada ", "decor"]) {
    assert.deepEqual(pesquisar(app, "servico", termo).map((item) => item.textContent), ["022 - Moldúra   Decorada 1"], termo);
    assert.equal(app.obter("#servicoId").value, "");
  }
  assert.equal(pesquisar(app, "servico", "023")[0].textContent, "Nenhum serviço encontrado.");
  pesquisar(app, "servico", "022")[0].listeners.click();
  assert.equal(app.obter("#busca-servico").value, "022 - Moldúra   Decorada 1");
  assert.equal(app.obter("#servicoId").value, "s1");
  assert.equal(app.obter("#unidade").value, "m²");
  assert.match(app.obter("#precoUnitario").value, /95,00/);
  assert.equal(app.obter("#resultados-servico").hidden, true);
});

test("serviço: filtro Tipo e pesquisa trabalham juntos e invalidam seleção de outro tipo", () => {
  const app = ambiente({ ...catalogos(), pizzol_servicos: JSON.stringify([
    { ...servicoA, nome: "Moldura 1", tipo: "Moldura" },
    { ...servicoB, nome: "Parede 1", tipo: "Parede" },
    { ...servicoA, id: "s3", codigo: "003", nome: "Moldura 2", tipo: "Moldura" },
    { ...servicoA, id: "s4", codigo: "004", nome: "Moldura 1 inativa", tipo: "Moldura", status: "Inativo" },
  ]) });
  preencher(app, { tipo: "Moldura" }); app.obter("#tipo").listeners.change();
  assert.deepEqual(pesquisar(app, "servico", "1").map((item) => item.textContent), ["001 - Moldura 1"]);
  preencher(app, { tipo: "todos" }); app.obter("#tipo").listeners.change();
  assert.deepEqual(app.obter("#resultados-servico").children.map((item) => item.textContent), ["001 - Moldura 1", "002 - Parede 1"]);
  assert.equal(app.obter("#busca-servico").value, "1");
  selecionar(app, "servico", "s1");
  preencher(app, { tipo: "Parede" }); app.obter("#tipo").listeners.change();
  assert.equal(app.obter("#servicoId").value, "");
  assert.equal(app.obter("#unidade").value, "");
  assert.equal(app.obter("#precoUnitario").value, "");
});

test("serviço: texto digitado, alterado ou apagado não permite adicionar item", () => {
  const app = ambiente(catalogos());
  preencher(app, { quantidade: "10" });
  for (const texto of ["001 - Forro de teste", "Forro", ""]) {
    selecionar(app, "servico", "s1"); pesquisar(app, "servico", texto);
    assert.equal(app.obter("#servicoId").value, "");
    assert.equal(app.obter("#unidade").value, "");
    assert.equal(app.obter("#precoUnitario").value, "");
    app.obter("#adicionar-servico").listeners.click();
    assert.equal(app.run("rascunho.itens.length"), 0);
    assert.equal(app.obter("#erro-servicoId").hidden, false);
    assert.equal(app.obter("#busca-servico").focused, true);
  }
});

test("buscas: clique externo e Esc só fecham sugestões; reabrir preserva seleção", () => {
  const app = ambiente(catalogos());
  for (const [nome, id, campoId] of [["cliente", "c1", "clienteId"], ["servico", "s1", "servicoId"]]) {
    selecionar(app, nome, id);
    const input = app.obter(`#busca-${nome}`);
    const texto = input.value;
    input.listeners.click();
    assert.equal(app.obter(`#resultados-${nome}`).hidden, false);
    app.documento.listeners.pointerdown.forEach((acao) => acao({ target: app.obter("#rua") }));
    assert.equal(app.obter(`#resultados-${nome}`).hidden, true);
    assert.equal(app.obter(`#${campoId}`).value, id);
    assert.equal(input.value, texto);
    input.listeners.click();
    let preveniu = false;
    input.listeners.keydown({ key: "Escape", preventDefault() { preveniu = true; }, stopPropagation() {} });
    assert.equal(preveniu, true);
    assert.equal(input.attributes["aria-expanded"], "false");
    assert.equal(input.value, texto);
    assert.equal(app.obter(`#${campoId}`).value, id);
    input.listeners.click(); input.listeners.blur();
    assert.equal(app.obter(`#resultados-${nome}`).hidden, true);
  }
});

test("buscas: setas destacam, Enter confirma e Tab fecha sem selecionar texto", () => {
  const app = ambiente(catalogos());
  const input = app.obter("#busca-servico");
  const tecla = (key) => input.listeners.keydown({ key, preventDefault() {} });
  pesquisar(app, "servico", "teste");
  tecla("Enter"); assert.equal(app.obter("#servicoId").value, "");
  tecla("ArrowDown");
  assert.equal(input.attributes["aria-activedescendant"], "opcao-servico-0");
  tecla("ArrowDown");
  assert.equal(input.attributes["aria-activedescendant"], "opcao-servico-1");
  tecla("ArrowUp"); tecla("Enter");
  assert.equal(app.obter("#servicoId").value, "s1");
  assert.equal(app.obter("#resultados-servico").hidden, true);
  input.listeners.click();
  assert.equal(app.obter("#resultados-servico").children[0].attributes["aria-selected"], "true");
  pesquisar(app, "servico", "parede"); tecla("Tab");
  assert.equal(app.obter("#resultados-servico").hidden, true);
  assert.equal(app.obter("#servicoId").value, "");
});

test("resumo do cliente, cópia independente do endereço e aviso sem cliente", () => {
  const app = ambiente(catalogos());
  app.obter("#copiar-endereco").listeners.click();
  assert.equal(app.obter("#copiar-aviso").hidden, false);
  selecionar(app, "cliente", "c1");
  assert.equal(app.obter("#cliente-nome").textContent, cliente.nome);
  assert.equal(app.obter("#cliente-codigo").textContent, "001");
  app.obter("#copiar-endereco").listeners.click();
  assert.equal(app.obter("#rua").value, cliente.rua);
  assert.equal(app.obter("#numero").value, "12");
  assert.equal(app.obter("#cidade").value, "Vitória");
  assert.equal(app.obter("#cep").value, "29000-000");
  preencher(app, { rua: "Outra rua" });
  assert.equal(app.run("clientes[0].rua"), cliente.rua);
});

test("quantidades decimais, limites e arredondamento de item", () => {
  const app = ambiente(catalogos());
  for (const [texto, esperado] of [["1", 1], ["10,5", 10.5], ["62,25", 62.25], ["99.999,99", 99999.99]]) {
    adicionar(app, "s1", texto);
    assert.equal(app.run("rascunho.itens.at(-1).quantidade"), esperado);
  }
  assert.equal(app.run("new ItemOrcamento({ precoUnitario: 95, quantidade: 62.25 }).calcularSubtotal()"), 5913.75);
  assert.equal(app.run("new ItemOrcamento({ precoUnitario: 0.1, quantidade: 0.25 }).calcularSubtotal()"), 0.03);
  const total = app.run("rascunho.itens.length");
  for (const valor of ["", "0", "-1", "100000", "1,234", "abc", "1e3", "Infinity"]) {
    adicionar(app, "s1", valor);
    assert.equal(app.run("rascunho.itens.length"), total, valor);
    assert.equal(app.obter("#erro-quantidade").hidden, false);
  }
  adicionar(app, "s3", "1");
  assert.equal(app.obter("#erro-servicoId").hidden, false);
});

test("soma vários itens, adicional e desconto: exemplo completo solicitado", async () => {
  const app = ambiente(catalogos()); preparar(app); adicionar(app, "s2", "32");
  preencher(app, { adicionalValor: "500", adicionalDescricao: "Deslocamento", descontoPercentual: "5" });
  app.obter("#adicionalValor").listeners.input();
  assert.equal(app.obter("#adicionalDescricao").disabled, false);
  assert.equal(app.obter("#adicionalDescricao").required, false);
  assert.match(app.obter("#resumo-total").textContent, /10\.326,50/);
  await enviar(app);
  const salvo = registros(app)[0];
  assert.equal(salvo.itens[0].subtotal, 5890);
  assert.equal(salvo.itens[1].subtotal, 4480);
  assert.equal(salvo.subtotalServicos, 10370);
  assert.equal(salvo.adicional.valor, 500);
  assert.equal(salvo.adicional.descricao, "Deslocamento");
  assert.equal(salvo.descontoValor, 543.5);
  assert.equal(salvo.totalFinal, 10326.5);
});

test("desconto decimal, máximo de 100% e total nunca negativo", () => {
  const app = ambiente(catalogos()); preparar(app);
  preencher(app, { descontoPercentual: "12,75" }); app.obter("#descontoPercentual").listeners.input();
  assert.equal(app.run("rascunho.calcularValorDesconto()"), 750.98);
  assert.equal(app.run("rascunho.calcularTotal()"), 5139.02);
  preencher(app, { descontoPercentual: "100" }); app.obter("#descontoPercentual").listeners.input();
  assert.equal(app.run("rascunho.calcularTotal()"), 0);
  assert.equal(app.run("new Orcamento({ descontoPercentual: 150, adicionalValor: 100 }).calcularTotal()"), 0);
});

test("remoção atualiza tabela e todos os totais", () => {
  const app = ambiente(catalogos()); preparar(app); adicionar(app, "s2", "32");
  preencher(app, { adicionalValor: "500", descontoPercentual: "5" }); app.run("atualizarTotais()");
  app.obter("#lista-itens").children[0].children[6].children[0].listeners.click();
  assert.equal(app.run("rascunho.itens.length"), 1);
  assert.match(app.obter("#resumo-subtotal").textContent, /4\.480,00/);
  assert.match(app.obter("#resumo-desconto").textContent, /249,00/);
  assert.match(app.obter("#resumo-total").textContent, /4\.731,00/);
});

test("validade padrão e cálculo em mudança de mês, ano e ano bissexto", async () => {
  const app = ambiente(catalogos());
  assert.equal(app.run("new Orcamento().validadeDias"), 7);
  for (const [data, dias, esperado] of [["2026-10-04", 7, "2026-10-11"], ["2026-12-30", 7, "2027-01-06"], ["2028-02-28", 1, "2028-02-29"], ["2026-10-04", 365, "2027-10-04"]]) {
    assert.equal(app.run(`Orcamento.calcularDataValidade('${data}', ${dias})`), esperado);
  }
  app.run("rascunho.dataCriacao = '2026-10-04'; atualizarValidade()");
  assert.equal(app.obter("#data-criacao").textContent, "04/10/2026");
  assert.equal(app.obter("#data-validade").textContent, "Válido até: 11/10/2026");
  preparar(app); await enviar(app);
  assert.equal(registros(app)[0].dataValidade, "2026-10-11");
  assert.equal(registros(app)[0].status, "Pendente");
});

test("código ORC-001, sequência, persistência e não reutilização após exclusão", async () => {
  const app = ambiente(catalogos()); preparar(app); await enviar(app);
  assert.equal(registros(app)[0].codigo, "ORC-001");
  preparar(app); await enviar(app);
  assert.equal(registros(app)[1].codigo, "ORC-002");
  const primeiro = registros(app)[0];
  app.storage.setItem("pizzol_orcamentos", JSON.stringify([primeiro]));
  const reaberto = ambiente(Object.fromEntries(app.dados));
  preparar(reaberto); await enviar(reaberto);
  assert.equal(registros(reaberto)[1].codigo, "ORC-003");
  assert.deepEqual(registros(reaberto)[0], primeiro);
  assert.equal(reaberto.dados.get("pizzol_proximo_codigo_orcamento"), "4");
});

test("recupera sequência de registros preexistentes e suporta ORC-1000", async () => {
  const app = ambiente(catalogos()); preparar(app); await enviar(app);
  const existente = registros(app)[0]; existente.codigo = "ORC-999";
  app.storage.setItem("pizzol_orcamentos", JSON.stringify([existente]));
  app.dados.delete("pizzol_proximo_codigo_orcamento");
  preparar(app); await enviar(app);
  assert.equal(registros(app)[1].codigo, "ORC-1000");
});

test("snapshot do cliente atual ao salvar e independência de alterações posteriores", async () => {
  const app = ambiente(catalogos()); preparar(app);
  const atualizado = { ...cliente, nome: "Nome atualizado", rua: "Rua atualizada" };
  app.storage.setItem("pizzol_clientes", JSON.stringify([atualizado]));
  await enviar(app);
  const salvo = registros(app)[0];
  assert.equal(salvo.clienteId, "c1");
  assert.equal(salvo.cliente.codigo, "001");
  assert.equal(salvo.cliente.nome, atualizado.nome);
  assert.equal(salvo.cliente.telefone, cliente.telefone);
  assert.equal(salvo.cliente.endereco.rua, atualizado.rua);
  assert.equal(salvo.enderecoObra.rua, "Rua da obra");
  app.storage.setItem("pizzol_clientes", JSON.stringify([{ ...cliente, nome: "Outro nome" }]));
  assert.deepEqual(registros(app)[0], salvo);
});

test("snapshot de nome, tipo, unidade e preço do serviço não depende do cadastro", async () => {
  const app = ambiente(catalogos()); preparar(app); await enviar(app);
  const salvo = registros(app)[0];
  assert.equal(salvo.itens[0].servicoId, "s1");
  assert.equal(salvo.itens[0].codigoServico, "001");
  assert.equal(salvo.itens[0].nomeServico, servicoA.nome);
  assert.equal(salvo.itens[0].tipo, "Forro");
  assert.equal(salvo.itens[0].unidade, "m²");
  app.storage.setItem("pizzol_servicos", JSON.stringify([{ ...servicoA, preco: 110, nome: "Novo nome", unidade: "unidade" }]));
  app.janela.listeners.storage({ key: "pizzol_servicos" });
  preparar(app); await enviar(app);
  assert.deepEqual(registros(app)[0], salvo);
  assert.equal(registros(app)[0].itens[0].precoUnitario, 95);
  assert.equal(registros(app)[1].itens[0].precoUnitario, 110);
  assert.equal(registros(app)[1].itens[0].nomeServico, "Novo nome");
});

test("campos obrigatórios, erros locais e validação não consome código nem limpa formulário", async () => {
  const app = ambiente(catalogos());
  preencher(app, { observacoes: "Preservar este texto" }); await enviar(app);
  for (const campo of ["clienteId", "rua", "cidade", "itens"]) assert.equal(app.obter(`#erro-${campo}`).hidden, false, campo);
  assert.equal(app.obter("#observacoes").value, "Preservar este texto");
  assert.equal(app.dados.has("pizzol_proximo_codigo_orcamento"), false);
  assert.equal(app.dados.has("pizzol_orcamentos"), false);
  preparar(app); await enviar(app);
  assert.equal(registros(app)[0].codigo, "ORC-001");
});

test("valida todos os limites, números e desconto", async () => {
  for (const [campo, valor] of [["clienteId", "c2"], ["validadeDias", "0"], ["validadeDias", "366"], ["validadeDias", "1.5"],
    ["rua", "a".repeat(121)], ["cidade", "a".repeat(61)], ["cidade", "Cidade 2"], ["cidade", "---"],
    ["numero", "123456789"], ["numero", "12A"], ["cep", "1234"], ["cep", "abcdefgh"],
    ["adicionalValor", "-1"], ["adicionalValor", "1.000.000,00"], ["adicionalValor", "abc"],
    ["adicionalDescricao", "a".repeat(121)], ["descontoPercentual", "-1"], ["descontoPercentual", "100,01"],
    ["descontoPercentual", "1,234"], ["descontoPercentual", ""], ["condicoesPagamento", "a".repeat(201)], ["observacoes", "a".repeat(501)]]) {
    const app = ambiente(catalogos()); preparar(app); preencher(app, { [campo]: valor }); await enviar(app);
    assert.equal(registros(app).length, 0, `${campo}: ${valor}`);
    assert.equal(app.obter(`#erro-${campo}`).hidden, false, campo);
    assert.equal(app.dados.has("pizzol_proximo_codigo_orcamento"), false);
  }
});

test("adicional maior que zero sem descrição é válido; descrição permanece opcional e disponível", async () => {
  const app = ambiente(catalogos()); preparar(app);
  assert.doesNotMatch(html, /adicional-obrigatorio/);
  assert.doesNotMatch(html.match(/<input id="adicionalDescricao"[^>]*>/)[0], /\b(required|disabled)\b/);
  preencher(app, { adicionalValor: "500" }); app.obter("#adicionalValor").listeners.input();
  assert.equal(app.obter("#adicionalDescricao").required, false);
  assert.equal(app.obter("#adicionalDescricao").disabled, false);
  await enviar(app);
  assert.equal(registros(app).length, 1);
  assert.deepEqual(registros(app)[0].adicional, { valor: 500, descricao: "" });
  assert.equal(registros(app)[0].totalFinal, 6390);
});

test("descrição preenchida é preservada inclusive quando o valor adicional é zero", async () => {
  const app = ambiente(catalogos()); preparar(app);
  preencher(app, { adicionalDescricao: "Deslocamento incluído" }); await enviar(app);
  assert.deepEqual(registros(app)[0].adicional, { valor: 0, descricao: "Deslocamento incluído" });
});

test("aceita limites máximos, campos opcionais vazios e desconto 100%", async () => {
  const app = ambiente(catalogos()); preparar(app);
  preencher(app, { validadeDias: "365", rua: "a".repeat(120), cidade: "a".repeat(60), numero: "12345678", cep: "12345-678",
    adicionalValor: "999.999,99", adicionalDescricao: "a".repeat(120), descontoPercentual: "100",
    condicoesPagamento: "a".repeat(200), observacoes: "a".repeat(500) });
  await enviar(app);
  assert.equal(registros(app).length, 1);
  assert.equal(registros(app)[0].totalFinal, 0);
  assert.equal(registros(app)[0].enderecoObra.cep, "12345678");
});

test("itens inválidos e cadastros desativados ou excluídos durante edição não são salvos", async () => {
  for (const alteracao of ["rascunho.itens[0].quantidade = 0", "rascunho.itens[0].quantidade = NaN",
    "rascunho.itens[0].quantidade = 100000", "rascunho.itens[0].precoUnitario = -1"]) {
    const app = ambiente(catalogos()); preparar(app); app.run(alteracao); await enviar(app);
    assert.equal(registros(app).length, 0);
    assert.equal(app.obter("#erro-itens").hidden, false);
  }
  for (const [chave, lista, erro] of [["pizzol_clientes", [{ ...cliente, status: "Inativo" }], "clienteId"],
    ["pizzol_servicos", [{ ...servicoA, status: "Inativo" }], "itens"], ["pizzol_servicos", [], "itens"]]) {
    const app = ambiente(catalogos()); preparar(app); app.storage.setItem(chave, JSON.stringify(lista)); await enviar(app);
    assert.equal(app.obter(`#erro-${erro}`).hidden, false);
    assert.equal(app.dados.has("pizzol_proximo_codigo_orcamento"), false);
  }
});

test("sucesso limpa formulário, itens, valores, contadores e mantém a página", async () => {
  const app = ambiente(catalogos()); preparar(app);
  preencher(app, { validadeDias: "30", adicionalValor: "10", adicionalDescricao: "Frete", descontoPercentual: "5", condicoesPagamento: "À vista", observacoes: "Detalhes" });
  await enviar(app);
  assert.equal(app.obter("#sucesso").textContent, "Orçamento ORC-001 salvo com sucesso.");
  assert.equal(app.obter("#sucesso").hidden, false);
  assert.equal(app.obter("#validadeDias").value, "7");
  assert.equal(app.obter("#adicionalValor").value, "R$ 0,00");
  assert.equal(app.obter("#descontoPercentual").value, "0");
  assert.equal(app.run("rascunho.itens.length"), 0);
  assert.equal(app.obter("#contador-observacoes").textContent, "0 / 500");
  assert.equal(app.obter("#contador-condicoesPagamento").textContent, "0 / 200");
  assert.equal(app.run("estadoFormulario() === estadoInicial"), true);
  assert.equal(app.janela.location.href, "");
});

test("máscaras e contadores funcionam durante edição", () => {
  const app = ambiente(catalogos());
  preencher(app, { numero: "12a34567890", cep: "29000000", adicionalValor: "1.250,50", observacoes: "abc", condicoesPagamento: "À vista" });
  for (const campo of ["numero", "cep", "observacoes", "condicoesPagamento"]) app.obter(`#${campo}`).listeners.input();
  app.obter("#adicionalValor").listeners.blur();
  assert.equal(app.obter("#numero").value, "12345678");
  assert.equal(app.obter("#cep").value, "29000-000");
  assert.match(app.obter("#adicionalValor").value, /R\$\s1\.250,50/);
  assert.equal(app.obter("#contador-observacoes").textContent, "3 / 500");
  assert.equal(app.obter("#contador-condicoesPagamento").textContent, "7 / 200");
});

test("cancelamento sem dados vai ao Dashboard; com dados exige ação explícita", () => {
  const app = ambiente(catalogos()); app.obter("#cancelar").listeners.click();
  assert.equal(app.janela.location.href, "../index.html");
  app.janela.location.href = ""; preencher(app, { rua: "Rua em edição" }); app.obter("#cancelar").listeners.click();
  assert.equal(app.obter("#cancelar-modal").open, true);
  assert.equal(app.janela.location.href, "");
  assert.equal(app.obter("#cancelar-modal").listeners.click, undefined);
  let impediu = false; app.obter("#cancelar-modal").listeners.cancel({ preventDefault() { impediu = true; } });
  assert.equal(impediu, true);
  app.obter("#continuar-editando").listeners.click();
  assert.equal(app.obter("#cancelar-modal").open, false);
  assert.equal(app.obter("#rua").value, "Rua em edição");
  app.obter("#cancelar").listeners.click(); app.obter("#descartar").listeners.click();
  assert.equal(app.janela.location.href, "../index.html");
});

test("links da página também protegem alterações não salvas", () => {
  const app = ambiente(catalogos()); preencher(app, { quantidade: "1" });
  const link = app.links.find((item) => item.attributes.href === "./clientes.html");
  let impediu = false; link.listeners.click({ preventDefault() { impediu = true; } });
  assert.equal(impediu, true);
  assert.equal(app.obter("#cancelar-modal").open, true);
  app.obter("#descartar").listeners.click();
  assert.equal(app.janela.location.href, "./clientes.html");
});

test("formatação monetária sem mudança de valor não aciona confirmação de descarte", () => {
  const app = ambiente(catalogos());
  app.obter("#adicionalValor").listeners.blur();
  preencher(app, { descontoPercentual: "0,00" });
  app.obter("#cancelar").listeners.click();
  assert.equal(app.janela.location.href, "../index.html");
  assert.notEqual(app.obter("#cancelar-modal").open, true);
});

test("item mantém o preço apresentado ao adicionar mesmo com atualização antes de salvar", async () => {
  const app = ambiente(catalogos()); preparar(app);
  app.storage.setItem("pizzol_servicos", JSON.stringify([{ ...servicoA, preco: 110 }]));
  await enviar(app);
  assert.equal(registros(app)[0].itens[0].precoUnitario, 95);
  assert.equal(registros(app)[0].totalFinal, 5890);
});

test("dados corrompidos são preservados sem reiniciar contador", async () => {
  for (const alteracoes of [{ pizzol_orcamentos: "inválido" }, { pizzol_orcamentos: "{}" },
    { pizzol_orcamentos: '[{"id":"x","codigo":"errado"}]' }, { pizzol_proximo_codigo_orcamento: "inválido" },
    { pizzol_clientes: "inválido" }, { pizzol_servicos: "{}" }]) {
    const inicial = { ...catalogos(), ...alteracoes };
    const app = ambiente(inicial);
    assert.equal(app.obter("#storage-error").hidden, false);
    preparar(app); await enviar(app);
    assert.deepEqual(Object.fromEntries(app.dados), inicial);
  }
});

test("falha ao gravar preserva formulário; reserva impede reuso e permite nova tentativa", async () => {
  const app = ambiente(catalogos()); preparar(app);
  const gravar = app.storage.setItem;
  app.storage.setItem = (chave, valor) => { if (chave === "pizzol_orcamentos") throw new Error("Cheio"); gravar(chave, valor); };
  await enviar(app);
  assert.equal(app.obter("#salvar-erro").hidden, false);
  assert.equal(app.obter("#rua").value, "Rua da obra");
  assert.equal(app.run("rascunho.itens.length"), 1);
  assert.equal(app.dados.get("pizzol_proximo_codigo_orcamento"), "2");
  assert.equal(app.obter("#salvar-orcamento").disabled, false);
  app.storage.setItem = gravar; await enviar(app);
  assert.equal(registros(app)[0].codigo, "ORC-002");
});

test("duplo envio não duplica orçamento; gravação relê a lista mais recente", async () => {
  const app = ambiente(catalogos()); preparar(app);
  await Promise.all([enviar(app), enviar(app)]);
  assert.equal(registros(app).length, 1);
  const outraAba = ambiente(Object.fromEntries(app.dados)); preparar(outraAba); await enviar(outraAba);
  app.storage.setItem("pizzol_orcamentos", outraAba.dados.get("pizzol_orcamentos"));
  app.storage.setItem("pizzol_proximo_codigo_orcamento", outraAba.dados.get("pizzol_proximo_codigo_orcamento"));
  preparar(app); await enviar(app);
  assert.deepEqual(registros(app).map((item) => item.codigo), ["ORC-001", "ORC-002", "ORC-003"]);
});
