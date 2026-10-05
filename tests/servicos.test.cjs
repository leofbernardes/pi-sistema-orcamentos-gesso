// Testes das regras e da persistência em memória; não acessam dados do navegador.
// Execute: node --test tests/servicos.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const raiz = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "pages/servicos.html"), "utf8");
const codigo = ["js/models/servico.js", "js/servicos.js"]
  .map((arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8")).join("\n");

function elemento() {
  return {
    value: "", hidden: false, textContent: "", children: [], listeners: {}, attributes: {},
    addEventListener(evento, acao) { this.listeners[evento] = acao; },
    setAttribute(nome, valor) { this.attributes[nome] = valor; },
    removeAttribute(nome) { delete this.attributes[nome]; },
    append(...filhos) { this.children.push(...filhos); },
    replaceChildren(...filhos) { this.children = filhos; },
    replaceWith(novo) { Object.assign(this, novo); },
    focus() {}, showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close?.(); },
  };
}

function ambiente(inicial = {}) {
  const elementos = new Map([...html.matchAll(/id="([^"]+)"/g)].map((match) => [`#${match[1]}`, elemento()]));
  const obter = (seletor) => {
    assert.ok(elementos.has(seletor), `Elemento existe no HTML: ${seletor}`);
    return elementos.get(seletor);
  };
  const campos = ["tipo", "nome", "unidade", "preco", "status", "descricao"];
  const form = obter("#servico-form");
  form.elements = Object.fromEntries(campos.map((campo) => [campo, obter(`#${campo}`)]));
  form.reset = () => campos.forEach((campo) => { form.elements[campo].value = campo === "status" ? "Ativo" : ""; });
  obter("#filtro-tipo").value = obter("#filtro-status").value = "todos";
  const dados = new Map(Object.entries(inicial));
  const storage = {
    getItem(chave) { return dados.get(chave) ?? null; },
    setItem(chave, valor) { dados.set(chave, String(valor)); },
  };
  const contexto = vm.createContext({
    document: {
      querySelector: obter,
      querySelectorAll: (seletor) => seletor === "dialog" ? [obter("#servico-modal"), obter("#ver-modal"), obter("#excluir-modal")] : [],
      createElement: elemento,
    },
    window: { addEventListener() {} }, navigator: {}, localStorage: storage,
    crypto: { randomUUID },
    FormData: class { constructor() { return campos.map((campo) => [campo, form.elements[campo].value]); } },
  });
  vm.runInContext(codigo, contexto);
  return { run: (texto) => vm.runInContext(texto, contexto), obter, dados, storage };
}

const novo = (alteracoes = {}) => ({ tipo: "Forro", nome: "Forro de gesso", unidade: "m²", preco: 95, status: "Ativo", descricao: "", ...alteracoes });
const registros = (app) => JSON.parse(app.dados.get("pizzol_servicos") || "[]");
const salvar = (app, dados, id = null) => app.run(`salvarServico(${JSON.stringify(dados)}, ${JSON.stringify(id)})`);

test("inicia vazio, sem escrever serviços nem contador; links locais existem", () => {
  const app = ambiente();
  assert.equal(app.dados.size, 0);
  assert.equal(app.obter("#contador").textContent, "0 serviços cadastrados");
  assert.equal(app.obter("#estado-vazio").hidden, false);
  for (const [, destino] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.resolve(raiz, "pages", destino)), destino);
  }
});

test("cria, edita sem trocar código/id, persiste e não reutiliza código excluído", async () => {
  const app = ambiente();
  salvar(app, novo());
  const primeiro = registros(app)[0];
  assert.equal(primeiro.codigo, "001");
  assert.equal(typeof primeiro.preco, "number");
  salvar(app, novo({ nome: "Forro atualizado", preco: 1250.50, status: "Inativo" }), primeiro.id);
  assert.equal(registros(app).length, 1);
  assert.equal(registros(app)[0].codigo, primeiro.codigo);
  assert.equal(registros(app)[0].id, primeiro.id);
  const recarregado = ambiente(Object.fromEntries(app.dados));
  assert.equal(recarregado.obter("#lista-servicos").children.length, 1);
  assert.equal(registros(recarregado)[0].preco, 1250.50);
  app.run("abrirExclusao(servicos[0])");
  await app.obter("#confirmar-exclusao").listeners.click();
  assert.equal(registros(app).length, 0);
  assert.equal(app.obter("#excluir-modal").open, false);
  salvar(app, novo());
  assert.equal(registros(app)[0].codigo, "002");
  assert.equal(app.dados.get("pizzol_proximo_codigo_servico"), "3");
});

test("duplicidade ignora acentos, caixa e espaços, mas considera tipo e ignora o próprio id", () => {
  const app = ambiente();
  salvar(app, novo({ nome: "Decoração   de Gesso" }));
  salvar(app, novo({ nome: "  DECORACAO de gesso  " }));
  assert.equal(registros(app).length, 1);
  assert.equal(app.obter("#erro-nome").textContent, "Já existe um serviço com este nome neste tipo.");
  salvar(app, novo({ nome: "decoracao de gesso", tipo: "Parede" }));
  assert.equal(registros(app).length, 2);
  salvar(app, novo({ nome: "Decoração   de Gesso", preco: 100 }), registros(app)[0].id);
  assert.equal(registros(app).length, 2);
  assert.equal(registros(app)[0].nome, "Decoração   de Gesso");
  salvar(app, novo({ nome: "decoração de gesso", tipo: "Parede" }), registros(app)[0].id);
  assert.equal(registros(app)[0].tipo, "Forro");
});

test("valida todos os campos em JavaScript e interpreta moeda brasileira", () => {
  const app = ambiente();
  for (const [texto, esperado] of [["95", 95], ["R$ 95,00", 95], ["R$ 1.250,50", 1250.5], ["999.999,99", 999999.99]]) {
    assert.equal(app.run(`lerPreco(${JSON.stringify(texto)})`), esperado);
  }
  for (const texto of ["", "-1", "abc", "1,234", "95.50", "1e3"]) {
    assert.ok(Number.isNaN(app.run(`lerPreco(${JSON.stringify(texto)})`)));
  }
  for (const [campo, valor] of [["tipo", ""], ["tipo", "Novo tipo"], ["nome", "  "], ["nome", "a".repeat(81)], ["unidade", "kg"], ["preco", 0], ["preco", -1], ["preco", 1000000], ["status", "Outro"], ["descricao", "a".repeat(301)]]) {
    assert.ok(app.run(`validarDados(${JSON.stringify(novo({ [campo]: valor }))})`)[campo], campo);
  }
  assert.ok(app.run(`validarDados({ ...${JSON.stringify(novo())}, preco: NaN }).preco`));
  assert.equal(Object.keys(app.run(`validarDados(${JSON.stringify(novo({ preco: 999999.99, nome: "a".repeat(80), descricao: "a".repeat(300) }))})`)).length, 0);
});

test("submit remove espaços externos, formata preço e mostra erros sem salvar", async () => {
  const app = ambiente();
  app.run("abrirFormulario()");
  const dados = novo({ nome: "  Gesso   liso  ", preco: "1.250,50" });
  for (const [campo, valor] of Object.entries(dados)) app.obter(`#${campo}`).value = valor;
  app.obter("#preco").listeners.blur();
  assert.match(app.obter("#preco").value, /1\.250,50/);
  await app.obter("#servico-form").listeners.submit({ preventDefault() {} });
  assert.equal(registros(app)[0].nome, "Gesso   liso");
  assert.equal(registros(app)[0].preco, 1250.5);
  app.run("abrirFormulario()");
  await app.obter("#servico-form").listeners.submit({ preventDefault() {} });
  assert.equal(app.obter("#erro-tipo").hidden, false);
  assert.equal(app.obter("#servico-modal").open, true);
  assert.equal(registros(app).length, 1);
});

test("busca e filtros combinados, detalhes e contador de descrição", () => {
  const app = ambiente();
  salvar(app, novo({ nome: "Decoração", descricao: "Acabamento liso" }));
  salvar(app, novo({ nome: "Parede", tipo: "Parede", status: "Inativo" }));
  app.obter("#busca").value = "decoracao";
  app.run("listarServicos()");
  assert.equal(app.obter("#lista-servicos").children.length, 1);
  app.obter("#busca").value = "002";
  app.obter("#filtro-status").value = "Inativo";
  app.obter("#filtro-tipo").value = "Parede";
  app.run("listarServicos()");
  assert.equal(app.obter("#lista-servicos").children.length, 1);
  app.obter("#filtro-status").value = "Ativo";
  app.run("listarServicos()");
  assert.equal(app.obter("#lista-servicos").children.length, 0);
  assert.equal(app.obter("#vazio-titulo").textContent, "Nenhum serviço encontrado.");
  assert.equal(app.obter("#contador").textContent, "2 serviços cadastrados");
  app.run("visualizarServico(servicos[0])");
  assert.equal(app.obter("#ver-descricao").textContent, "Acabamento liso");
  assert.equal(app.obter("#descricao-secao").hidden, false);
  app.run("visualizarServico(servicos[1])");
  assert.equal(app.obter("#descricao-secao").hidden, true);
  app.obter("#descricao").value = "abc";
  app.obter("#descricao").listeners.input();
  assert.equal(app.obter("#contador-descricao").textContent, "3 / 300");
});

test("preserva dados inválidos e não reinicia sequência; falhas não reutilizam código", () => {
  for (const inicial of [{ pizzol_servicos: "inválido" }, { pizzol_servicos: "{}" }, { pizzol_proximo_codigo_servico: "inválido" }]) {
    const app = ambiente(inicial);
    assert.equal(app.obter("#storage-error").hidden, false);
    assert.throws(() => salvar(app, novo()));
    assert.deepEqual(Object.fromEntries(app.dados), inicial);
  }
  const app = ambiente();
  const gravar = app.storage.setItem;
  app.storage.setItem = (chave, valor) => {
    if (chave === "pizzol_servicos") throw new Error("Armazenamento cheio");
    gravar(chave, valor);
  };
  assert.throws(() => salvar(app, novo()));
  assert.equal(app.dados.get("pizzol_proximo_codigo_servico"), "2");
  app.storage.setItem = gravar;
  salvar(app, novo());
  assert.equal(registros(app)[0].codigo, "002");
});

test("preserva sequência antiga ao excluir e formata códigos a partir de 1000", async () => {
  const app = ambiente({ pizzol_servicos: JSON.stringify([{ ...novo(), id: "existente", codigo: "999" }]) });
  app.run("abrirExclusao(servicos[0])");
  await app.obter("#confirmar-exclusao").listeners.click();
  salvar(app, novo());
  assert.equal(registros(app)[0].codigo, "1000");
});

test("modais impedem fechamento por Esc", () => {
  const app = ambiente();
  for (const seletor of ["#servico-modal", "#ver-modal", "#excluir-modal"]) {
    let impediu = false;
    app.obter(seletor).listeners.cancel({ preventDefault() { impediu = true; } });
    assert.equal(impediu, true);
  }
});
