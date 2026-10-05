const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

const raiz = path.resolve(__dirname, "..");
const contexto = vm.createContext({ crypto: { randomUUID } });
for (const arquivo of ["entidade", "cliente", "servico"]) {
  vm.runInContext(fs.readFileSync(path.join(raiz, `js/models/${arquivo}.js`), "utf8"), contexto);
}
const { Entidade, Cliente, Servico } = vm.runInContext("({ Entidade, Cliente, Servico })", contexto);
const dadosCliente = { id: "c1", codigo: "005", nome: "Leonardo Bernardes", telefone: "27999999999",
  status: "Ativo", rua: "Rua A", numero: "12", cidade: "Vitória", cep: "29000000", observacoes: "Cliente antigo" };
const dadosServico = { id: "s1", codigo: "022", nome: "Moldura 1", tipo: "Moldura", unidade: "m",
  preco: 95.5, status: "Ativo", descricao: "Serviço existente" };

test("Cliente e Servico são instâncias das classes específicas e de Entidade", () => {
  const cliente = new Cliente(dadosCliente);
  const servico = new Servico(dadosServico);
  assert.ok(cliente instanceof Cliente);
  assert.ok(cliente instanceof Entidade);
  assert.ok(servico instanceof Servico);
  assert.ok(servico instanceof Entidade);
});

test("propriedades comuns são inicializadas pela base e preservam os valores fornecidos", () => {
  for (const Classe of [Entidade, Cliente, Servico]) {
    const entidade = new Classe({ id: "existente", codigo: "0005", nome: "Nome original" });
    assert.equal(entidade.id, "existente");
    assert.equal(entidade.codigo, "0005");
    assert.equal(entidade.nome, "Nome original");
    const vazia = new Classe();
    assert.match(vazia.id, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
    assert.notEqual(vazia.id, new Classe().id);
    assert.equal(vazia.codigo, "");
    assert.equal(vazia.nome, "");
  }
});

test("polimorfismo: classes diferentes respondem ao mesmo método com sobrescritas próprias", () => {
  const cliente = new Cliente(dadosCliente);
  const servico = new Servico(dadosServico);
  for (const Classe of [Cliente, Servico]) {
    assert.ok(Object.hasOwn(Classe.prototype, "obterIdentificacao"));
    assert.notEqual(Classe.prototype.obterIdentificacao, Entidade.prototype.obterIdentificacao);
  }
  assert.notEqual(Cliente.prototype.obterIdentificacao, Servico.prototype.obterIdentificacao);
  const entidades = [cliente, servico];
  const identificacoes = entidades.map((entidade) => entidade.obterIdentificacao());
  assert.deepEqual(identificacoes, ["005 - Leonardo Bernardes", "022 - Moldura 1"]);
  assert.equal(new Entidade({ codigo: "5", nome: "Base" }).obterIdentificacao(), "5 - Base");
});

test("identificação preserva zeros à esquerda da interface sem modificar códigos armazenados", () => {
  for (const Classe of [Cliente, Servico]) {
    for (const codigo of [5, "5", "005", "0005", "1234"]) {
      const entidade = new Classe({ codigo, nome: "Nome" });
      assert.equal(entidade.obterIdentificacao(), `${String(codigo).padStart(3, "0")} - Nome`);
      assert.equal(entidade.codigo, codigo);
    }
  }
});

test("enderecoCompleto e precoFormatado mantêm o comportamento existente", () => {
  assert.equal(new Cliente(dadosCliente).enderecoCompleto(), "Rua A, 12");
  assert.equal(new Cliente({ rua: "Rua A" }).enderecoCompleto(), "Rua A");
  assert.equal(new Cliente().enderecoCompleto(), "");
  for (const preco of [0, 95.5, 1250.5]) {
    assert.equal(new Servico({ preco }).precoFormatado(), preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  }
});

test("JSON conserva exatamente os campos, valores e formato anteriores, sem métodos", () => {
  for (const [Classe, dados] of [[Cliente, dadosCliente], [Servico, dadosServico]]) {
    const jsonAnterior = JSON.stringify(dados);
    const instancia = new Classe(JSON.parse(jsonAnterior));
    assert.equal(JSON.stringify(instancia), jsonAnterior);
    assert.deepEqual(JSON.parse(JSON.stringify(instancia)), dados);
    assert.equal(Object.hasOwn(instancia, "obterIdentificacao"), false);
    const recarregada = new Classe(JSON.parse(JSON.stringify(instancia)));
    assert.ok(recarregada instanceof Entidade);
    assert.equal(recarregada.obterIdentificacao(), instancia.obterIdentificacao());
  }
});

test("valores padrão e campos específicos continuam compatíveis com os modelos anteriores", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(new Cliente({ id: "c" }))), {
    id: "c", codigo: "", nome: "", telefone: "", status: "Ativo", rua: "", numero: "", cidade: "", cep: "", observacoes: "",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(new Servico({ id: "s" }))), {
    id: "s", codigo: "", nome: "", tipo: "", unidade: "", preco: 0, status: "Ativo", descricao: "",
  });
});

test("páginas carregam Entidade antes das subclasses e usam caminhos com a capitalização correta", () => {
  for (const pagina of ["clientes", "servicos", "novo-orcamento"]) {
    const html = fs.readFileSync(path.join(raiz, `pages/${pagina}.html`), "utf8");
    const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]);
    const base = scripts.indexOf("../js/models/entidade.js");
    assert.ok(base >= 0);
    for (const modelo of pagina === "novo-orcamento" ? ["cliente", "servico"] : [pagina.slice(0, -1)]) {
      assert.ok(scripts.indexOf(`../js/models/${modelo}.js`) > base);
    }
  }
});
