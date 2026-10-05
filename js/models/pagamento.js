class Pagamento {
  static formas = ["Pix", "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Cheque"];

  constructor(dados = {}) {
    this.id = dados.id || crypto.randomUUID();
    this.data = dados.data || "";
    this.valor = dados.valor;
    this.formaPagamento = dados.formaPagamento || "";
    this.observacao = (dados.observacao || "").trim();
    if (!Number.isFinite(this.valor) || this.valor <= 0
      || !Number.isSafeInteger(Math.round(this.valor * 100))
      || Math.abs(this.valor * 100 - Math.round(this.valor * 100)) > 0.000001) {
      throw new Error("Informe um valor maior que zero, com até duas casas decimais.");
    }
    if (!Pagamento.formas.includes(this.formaPagamento)) throw new Error("Selecione uma forma de pagamento válida.");
    const data = new Date(`${this.data}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.data) || !Number.isFinite(data.getTime())
      || data.toISOString().slice(0, 10) !== this.data || this.data.startsWith("0000")) {
      throw new Error("Informe uma data de pagamento válida.");
    }
    if (this.observacao.length > 200) throw new Error("Use no máximo 200 caracteres na observação.");
  }
}
