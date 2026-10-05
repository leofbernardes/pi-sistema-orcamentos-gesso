class Cliente extends Entidade {
  constructor(dados = {}) {
    super(dados);
    this.telefone = dados.telefone || "";
    this.status = dados.status || "Ativo";
    this.rua = dados.rua || "";
    this.numero = dados.numero || "";
    this.cidade = dados.cidade || "";
    this.cep = dados.cep || "";
    this.observacoes = dados.observacoes || "";
  }

  obterIdentificacao() {
    // Preserva a apresentação dos códigos no autocomplete, sem alterar o dado.
    return `${String(this.codigo).padStart(3, "0")} - ${this.nome}`;
  }

  enderecoCompleto() {
    return this.numero ? `${this.rua}, ${this.numero}` : this.rua;
  }
}
