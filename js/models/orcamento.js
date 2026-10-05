class Orcamento {
  constructor(dados = {}) {
    this.id = dados.id || crypto.randomUUID();
    this.codigo = dados.codigo || "";
    this.dataCriacao = dados.dataCriacao || Orcamento.dataAtual();
    this.validadeDias = dados.validadeDias ?? 7;
    this.dataValidade = Orcamento.calcularDataValidade(this.dataCriacao, this.validadeDias);
    this.status = "Pendente";
    this.clienteId = dados.clienteId || "";
    this.clienteCodigo = dados.clienteCodigo || "";
    this.clienteNome = dados.clienteNome || "";
    this.clienteTelefone = dados.clienteTelefone || "";
    this.clienteEndereco = { ...dados.clienteEndereco };
    this.enderecoObra = { ...dados.enderecoObra };
    this.itens = (dados.itens || []).map((item) => new ItemOrcamento(item));
    this.adicionalValor = dados.adicionalValor ?? 0;
    this.adicionalDescricao = dados.adicionalDescricao || "";
    this.descontoPercentual = dados.descontoPercentual ?? 0;
    this.condicoesPagamento = dados.condicoesPagamento || "";
    this.observacoes = dados.observacoes || "";
  }

  static dataAtual() {
    const hoje = new Date();
    return [hoje.getFullYear(), String(hoje.getMonth() + 1).padStart(2, "0"),
      String(hoje.getDate()).padStart(2, "0")].join("-");
  }

  static calcularDataValidade(data, dias) {
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) return "";
    // UTC somente para a aritmética de dias, evitando mudanças de horário de verão.
    const prazo = new Date(`${data}T00:00:00Z`);
    if (!Number.isFinite(prazo.getTime())) return "";
    prazo.setUTCDate(prazo.getUTCDate() + dias);
    return prazo.toISOString().slice(0, 10);
  }

  adicionarItem(item) { this.itens.push(new ItemOrcamento(item)); }

  removerItem(id) { this.itens = this.itens.filter((item) => item.id !== id); }

  calcularSubtotal() {
    return this.itens.reduce((centavos, item) => centavos + Math.round(item.calcularSubtotal() * 100), 0) / 100;
  }

  calcularValorDesconto() {
    const baseCentavos = Math.round(this.calcularSubtotal() * 100) + Math.round(this.adicionalValor * 100);
    const percentual = Math.min(100, Math.max(0, this.descontoPercentual));
    return Math.round(baseCentavos * percentual / 100) / 100;
  }

  calcularTotal() {
    return Math.max(0, Math.round(this.calcularSubtotal() * 100) + Math.round(this.adicionalValor * 100)
      - Math.round(this.calcularValorDesconto() * 100)) / 100;
  }

  toJSON() {
    return {
      id: this.id, codigo: this.codigo, dataCriacao: this.dataCriacao,
      validadeDias: this.validadeDias, dataValidade: this.dataValidade, status: this.status,
      clienteId: this.clienteId,
      cliente: { codigo: this.clienteCodigo, nome: this.clienteNome,
        telefone: this.clienteTelefone, endereco: { ...this.clienteEndereco } },
      enderecoObra: { ...this.enderecoObra },
      itens: this.itens.map((item) => item.toJSON()),
      subtotalServicos: this.calcularSubtotal(),
      adicional: { valor: this.adicionalValor, descricao: this.adicionalDescricao },
      descontoPercentual: this.descontoPercentual, descontoValor: this.calcularValorDesconto(),
      totalFinal: this.calcularTotal(), condicoesPagamento: this.condicoesPagamento,
      observacoes: this.observacoes,
    };
  }
}
