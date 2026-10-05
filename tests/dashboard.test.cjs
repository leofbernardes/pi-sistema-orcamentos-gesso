// Somente dados em memória: estes testes nunca acessam o localStorage do navegador.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const raiz = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");
const codigo = ["js/utils/orcamentos.js", "js/app.js"]
  .map((arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8")).join("\n");

function elemento(tag = "") {
  return { tag, textContent: "", hidden: false, children: [], attributes: {},
    append(...filhos) { this.children.push(...filhos); },
    replaceChildren(...filhos) { this.children = filhos; },
    setAttribute(nome, valor) { this.attributes[nome] = valor; },
  };
}

function ambiente(inicial = {}, falhaLeitura = false) {
  const elementos = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, elemento()]));
  const obter = (id) => {
    const resultado = elementos.get(id.replace(/^#/, ""));
    assert.ok(resultado, `Elemento existe no Dashboard: ${id}`); return resultado;
  };
  const dados = new Map(Object.entries(inicial));
  const acessos = [];
  const storage = {
    getItem(chave) { acessos.push(chave); if (falhaLeitura) throw new Error("Acesso negado"); return dados.get(chave) ?? null; },
    setItem() { assert.fail("O Dashboard não deve escrever no armazenamento."); },
    removeItem() { assert.fail("O Dashboard não deve excluir dados."); },
    clear() { assert.fail("O Dashboard não deve apagar cadastros."); },
  };
  const janela = { listeners: {}, addEventListener(evento, acao) { this.listeners[evento] = acao; } };
  const contexto = vm.createContext({ document: { querySelector: obter, createElement: elemento }, window: janela, localStorage: storage });
  vm.runInContext(codigo, contexto);
  return { obter, dados, acessos, janela, run: (texto) => vm.runInContext(texto, contexto) };
}

const orcamento = (numero, alteracoes = {}) => ({
  id: `orcamento-${numero}`, codigo: `ORC-${String(numero).padStart(3, "0")}`, dataCriacao: "2026-10-04",
  dataValidade: "2026-10-11", status: "Pendente", clienteId: "cliente-1",
  cliente: { codigo: "001", nome: "Nome histórico", telefone: "", endereco: {} },
  itens: [{ nomeServico: "Forro Chapa ST", precoUnitario: 50, quantidade: 2, subtotal: 100 }],
  totalFinal: 100, ...alteracoes,
});
const comDados = (orcamentos = [], clientes = []) => ({ pizzol_orcamentos: JSON.stringify(orcamentos), pizzol_clientes: JSON.stringify(clientes) });
const linhas = (app) => app.obter("orcamentos-recentes").children;
const moeda = (texto) => texto.replace(/\s/g, " ");

test("Dashboard vazio exibe zero nos três cards e mensagem compacta, sem criar dados", () => {
  const app = ambiente();
  assert.equal(moeda(app.obter("valor-total").textContent), "R$ 0,00");
  assert.equal(app.obter("orcamentos-pendentes").textContent, "0");
  assert.equal(app.obter("clientes-cadastrados").textContent, "0");
  assert.equal(linhas(app).length, 1);
  assert.equal(linhas(app)[0].children[0].textContent, "Nenhum orçamento cadastrado.");
  assert.equal(linhas(app)[0].children[0].attributes.colspan, "6");
  assert.equal(app.obter("recentes-nota").textContent, "Os novos orçamentos aparecerão aqui.");
  assert.equal(app.obter("dashboard-error").hidden, true);
  assert.equal(app.dados.size, 0);
  assert.doesNotMatch(html, /Mariana Costa|Roberto Almeida|Fernanda Souza|Dados demonstrativos|Registros fictícios|details-dialog/);
});

test("valor total soma todos os status, incluindo Recusado, sem deduzir pagamentos", () => {
  const app = ambiente(comDados([
    orcamento(1, { totalFinal: 10000 }), orcamento(2, { totalFinal: 5500, status: "Em andamento" }),
    orcamento(3, { totalFinal: 1500, status: "Finalizado" }),
    orcamento(4, { totalFinal: 500, status: "Recusado", pagamentos: [{ valor: 200 }] }),
  ]));
  assert.equal(moeda(app.obter("valor-total").textContent), "R$ 17.500,00");
  assert.equal(app.run("calcularValorTotalOrcado(carregarOrcamentosDashboard())"), 17500);
});

test("somente Pendente entra no contador, inclusive orçamento vencido", () => {
  const app = ambiente(comDados([
    orcamento(1, { dataValidade: "2000-01-01" }), orcamento(2),
    orcamento(3, { status: "Finalizado" }), orcamento(4, { status: "Recusado" }), orcamento(5, { status: "Em andamento" }),
  ]));
  assert.equal(app.obter("orcamentos-pendentes").textContent, "2");
});

test("clientes ativos e inativos são contados, sem migrar cadastros legados nem sequências", () => {
  const inicial = { ...comDados([], [{ nome: "Ativo", status: "Ativo" }, { nome: "Inativo", status: "Inativo" }]),
    pizzol_proximo_codigo_cliente: "inválido", pizzol_proximo_codigo_orcamento: "inválido" };
  const app = ambiente(inicial);
  assert.equal(app.obter("clientes-cadastrados").textContent, "2");
  assert.deepEqual(Object.fromEntries(app.dados), inicial);
  assert.deepEqual([...new Set(app.acessos)].sort(), ["pizzol_clientes", "pizzol_orcamentos"]);
});

test("recentes: data decrescente, desempate numérico por código e máximo de cinco", () => {
  const registros = [orcamento(9), orcamento(2, { dataCriacao: "2026-10-05" }), orcamento(1000),
    orcamento(3, { dataCriacao: "2026-10-01" }), orcamento(12), orcamento(10), orcamento(1)];
  const inicial = comDados(registros); const app = ambiente(inicial);
  const esperados = ["ORC-002", "ORC-1000", "ORC-012", "ORC-010", "ORC-009"];
  assert.equal(linhas(app).length, 5);
  assert.deepEqual(linhas(app).map((linha) => linha.children[5].children[0].attributes.href.split("=")[1]), esperados);
  assert.deepEqual(Object.fromEntries(app.dados), inicial);
  assert.equal(app.obter("recentes-nota").textContent, "Exibindo 5 de 7 orçamento(s) cadastrado(s).");
  assert.equal(moeda(app.obter("valor-total").textContent), "R$ 700,00");
});

test("serviços: um item mostra nome, vários mostram quantidade e legado sem itens não quebra", () => {
  for (const [itens, esperado] of [[[{ nomeServico: "Forro Chapa ST" }], "Forro Chapa ST"],
    [[{}, {}, {}, {}], "4 serviços"], [[], "Sem serviços"], [undefined, "Sem serviços"], [null, "Sem serviços"]]) {
    const app = ambiente(comDados([orcamento(1, { itens })]));
    assert.equal(linhas(app)[0].children[1].textContent, esperado);
    assert.equal(app.obter("dashboard-error").hidden, true);
  }
});

test("moeda brasileira, soma em centavos e data sem conversão de fuso horário", () => {
  const app = ambiente(comDados([orcamento(1, { totalFinal: 0.1 }), orcamento(2, { totalFinal: 0.2 })]));
  assert.equal(app.run("calcularValorTotalOrcado(carregarOrcamentosDashboard())"), 0.3);
  assert.equal(moeda(app.run("formatarPreco(10260.5)")), "R$ 10.260,50");
  assert.equal(app.run("formatarData('2026-10-04')"), "04/10/2026");
  const tempo = linhas(app)[0].children[4].children[0];
  assert.equal(tempo.textContent, "04/10/2026"); assert.equal(tempo.attributes.datetime, "2026-10-04");
});

test("nome vem do snapshot e Ver detalhes aponta ao código correto com estilo existente", () => {
  const app = ambiente(comDados([orcamento(2)], [{ id: "cliente-1", nome: "Nome atualizado", status: "Ativo" }]));
  const celulas = linhas(app)[0].children;
  assert.equal(celulas[0].textContent, "Nome histórico");
  const link = celulas[5].children[0];
  assert.equal(link.tag, "a"); assert.equal(link.className, "details-button");
  assert.equal(link.textContent, "Ver detalhes");
  assert.equal(link.attributes.href, "./pages/orcamentos.html?orcamento=ORC-002");
  assert.match(link.attributes["aria-label"], /ORC-002/);
  assert.equal(celulas[3].children[0].className, "status status-pendente");
});

test("os quatro badges reutilizam as classes existentes", () => {
  for (const [status, classe] of [["Pendente", "status-pendente"], ["Em andamento", "status-em-andamento"],
    ["Finalizado", "status-finalizado"], ["Recusado", "status-recusado"]]) {
    const app = ambiente(comDados([orcamento(1, { status })]));
    const badge = linhas(app)[0].children[3].children[0];
    assert.equal(badge.textContent, status); assert.equal(badge.className, `status ${classe}`);
  }
});

test("campos opcionais vazios e pagamentos ausentes são aceitos; textos são renderizados literalmente", () => {
  const app = ambiente(comDados([orcamento(1, { cliente: {}, dataCriacao: "", itens: [{}], observacoes: "", condicoesPagamento: "" })]));
  assert.equal(app.obter("dashboard-error").hidden, true);
  assert.equal(linhas(app)[0].children[0].textContent, "—");
  assert.equal(linhas(app)[0].children[4].children[0].textContent, "—");
  const texto = '<img src=x onerror="alert(1)">';
  app.dados.set("pizzol_orcamentos", JSON.stringify([orcamento(1, { cliente: { nome: texto }, itens: [{ nomeServico: texto }] })]));
  app.run("atualizarDashboard()");
  assert.equal(linhas(app)[0].children[0].textContent, texto);
  assert.equal(linhas(app)[0].children[0].children.length, 0);
  assert.equal(linhas(app)[0].children[1].textContent, texto);
});

test("pageshow atualiza os dados ao retornar pelo histórico, sem duplicar linhas", () => {
  const app = ambiente();
  const inicial = comDados([orcamento(1)], [{ status: "Inativo" }]);
  Object.entries(inicial).forEach(([key, valor]) => app.dados.set(key, valor));
  app.janela.listeners.pageshow({ persisted: true });
  assert.equal(moeda(app.obter("valor-total").textContent), "R$ 100,00");
  assert.equal(app.obter("clientes-cadastrados").textContent, "1");
  assert.equal(app.obter("orcamentos-pendentes").textContent, "1");
  app.janela.listeners.pageshow({ persisted: false });
  assert.equal(linhas(app).length, 1);
  assert.deepEqual(Object.fromEntries(app.dados), inicial);
});

test("alterações em outra aba atualizam cards e tabela sem polling", () => {
  const app = ambiente(comDados([orcamento(1)]));
  app.dados.set("pizzol_orcamentos", JSON.stringify([orcamento(1, { status: "Finalizado", totalFinal: 200 })]));
  app.janela.listeners.storage({ key: "pizzol_orcamentos" });
  assert.equal(app.obter("orcamentos-pendentes").textContent, "0");
  assert.equal(moeda(app.obter("valor-total").textContent), "R$ 200,00");
  app.dados.set("pizzol_clientes", JSON.stringify([{}, {}]));
  app.janela.listeners.storage({ key: "pizzol_clientes" });
  assert.equal(app.obter("clientes-cadastrados").textContent, "2");
  const leituras = app.acessos.length;
  app.janela.listeners.storage({ key: "pizzol_servicos" });
  assert.equal(app.acessos.length, leituras);
  app.dados.clear(); app.janela.listeners.storage({ key: null });
  assert.equal(app.obter("clientes-cadastrados").textContent, "0");
  assert.equal(moeda(app.obter("valor-total").textContent), "R$ 0,00");
});

test("dados corrompidos são preservados e não apresentados como zeros ou lista vazia", () => {
  for (const valor of ["inválido", "{}", "null", "[null]", "[1]", "[[]]",
    JSON.stringify([orcamento(1, { totalFinal: "100" })]), JSON.stringify([orcamento(1, { itens: {} })])]) {
    const inicial = { ...comDados([], [{ status: "Ativo" }]), pizzol_orcamentos: valor };
    const app = ambiente(inicial);
    assert.equal(app.obter("dashboard-error").hidden, false);
    assert.equal(app.obter("valor-total").textContent, "—");
    assert.equal(app.obter("orcamentos-pendentes").textContent, "—");
    assert.equal(app.obter("clientes-cadastrados").textContent, "1");
    assert.equal(linhas(app)[0].children[0].textContent, "Não foi possível carregar os orçamentos.");
    assert.deepEqual(Object.fromEntries(app.dados), inicial);
  }
});

test("falha somente em clientes preserva indicadores de orçamento; recuperação limpa o erro", () => {
  const app = ambiente({ ...comDados([orcamento(1)]), pizzol_clientes: "inválido" });
  assert.equal(app.obter("clientes-cadastrados").textContent, "—");
  assert.equal(moeda(app.obter("valor-total").textContent), "R$ 100,00");
  assert.equal(linhas(app)[0].children.length, 6);
  app.dados.set("pizzol_clientes", "[]"); app.janela.listeners.pageshow({ persisted: true });
  assert.equal(app.obter("dashboard-error").hidden, true);
  assert.equal(app.obter("clientes-cadastrados").textContent, "0");
});

test("falha de acesso ao localStorage não quebra a página nem grava dados", () => {
  const app = ambiente({}, true);
  assert.equal(app.obter("dashboard-error").hidden, false);
  assert.match(app.obter("dashboard-error").textContent, /dados existentes foram preservados/);
  assert.equal(app.obter("valor-total").textContent, "—");
  assert.equal(app.obter("clientes-cadastrados").textContent, "—");
});

test("recursos e links estáticos do Dashboard existem e os cards mantêm as classes originais", () => {
  for (const [, destino] of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(path.resolve(raiz, destino)), destino);
  assert.equal([...html.matchAll(/class="summary-card"/g)].length, 3);
  assert.match(html, /<body class="dashboard">/);
  const css = fs.readFileSync(path.join(raiz, "css/style.css"), "utf8");
  assert.match(css, /\.dashboard:not\(\.clientes-page\) \.summary-card:hover\s*\{[^}]*transform: translateY\(-2px\);[^}]*box-shadow:/);
});
