class Servico extends Entidade {
  constructor(dados = {}) {
    super(dados);
    this.tipo = dados.tipo || "";
    this.unidade = dados.unidade || "";
    this.preco = dados.preco ?? 0;
    this.status = dados.status || "Ativo";
    this.descricao = dados.descricao || "";
  }

  obterIdentificacao() {
    // Mantém o formato atual; a unidade continua no campo próprio da interface.
    return `${String(this.codigo).padStart(3, "0")} - ${this.nome}`;
  }

  precoFormatado() {
    return this.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
}
