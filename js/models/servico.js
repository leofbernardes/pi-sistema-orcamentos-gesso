class Servico {
  constructor(dados = {}) {
    this.id = dados.id || crypto.randomUUID();
    this.codigo = dados.codigo || "";
    this.nome = dados.nome || "";
    this.tipo = dados.tipo || "";
    this.unidade = dados.unidade || "";
    this.preco = dados.preco ?? 0;
    this.status = dados.status || "Ativo";
    this.descricao = dados.descricao || "";
  }

  precoFormatado() {
    return this.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
}
