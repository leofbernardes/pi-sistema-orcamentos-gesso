class Cliente {
  constructor(dados = {}) {
    this.id = dados.id || crypto.randomUUID();
    this.codigo = dados.codigo || "";
    this.nome = dados.nome || "";
    this.telefone = dados.telefone || "";
    this.status = dados.status || "Ativo";
    this.rua = dados.rua || "";
    this.numero = dados.numero || "";
    this.cidade = dados.cidade || "";
    this.cep = dados.cep || "";
    this.observacoes = dados.observacoes || "";
  }

  enderecoCompleto() {
    return this.numero ? `${this.rua}, ${this.numero}` : this.rua;
  }
}
