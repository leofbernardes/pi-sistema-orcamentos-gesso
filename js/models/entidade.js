class Entidade {
  constructor(dados = {}) {
    this.id = dados.id || crypto.randomUUID();
    this.codigo = dados.codigo || "";
    this.nome = dados.nome || "";
  }

  obterIdentificacao() {
    return `${this.codigo} - ${this.nome}`;
  }
}
