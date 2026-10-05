class ItemOrcamento {
  constructor(dados = {}) {
    this.id = dados.id || crypto.randomUUID();
    this.servicoId = dados.servicoId || "";
    this.codigoServico = dados.codigoServico || "";
    this.nomeServico = dados.nomeServico || "";
    this.tipo = dados.tipo || "";
    this.unidade = dados.unidade || "";
    this.precoUnitario = dados.precoUnitario ?? 0;
    this.quantidade = dados.quantidade ?? 0;
  }

  calcularSubtotal() {
    // Preço em centavos; arredonda cada item antes de somar o orçamento.
    return Math.round(Math.round(this.precoUnitario * 100) * this.quantidade) / 100;
  }

  toJSON() {
    return { ...this, subtotal: this.calcularSubtotal() };
  }
}
