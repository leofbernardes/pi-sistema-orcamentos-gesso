class Orcamento {
  constructor(dados = {}) {
    this.id = dados.id || crypto.randomUUID();
    this.codigo = dados.codigo || "";
    this.dataCriacao = dados.dataCriacao || Orcamento.dataAtual();
    this.validadeDias = dados.validadeDias ?? 7;
    this.dataValidade = dados.dataValidade || Orcamento.calcularDataValidade(this.dataCriacao, this.validadeDias);
    this.status = dados.status || "Pendente";
    this.clienteId = dados.clienteId || "";
    this.clienteCodigo = dados.clienteCodigo ?? dados.cliente?.codigo ?? "";
    this.clienteNome = dados.clienteNome ?? dados.cliente?.nome ?? "";
    this.clienteTelefone = dados.clienteTelefone ?? dados.cliente?.telefone ?? "";
    this.clienteEndereco = { ...(dados.clienteEndereco ?? dados.cliente?.endereco) };
    this.enderecoObra = { ...dados.enderecoObra };
    this.itens = (dados.itens || []).map((item) => new ItemOrcamento(item));
    this.adicionalValor = dados.adicionalValor ?? dados.adicional?.valor ?? 0;
    this.adicionalDescricao = dados.adicionalDescricao ?? dados.adicional?.descricao ?? "";
    this.descontoPercentual = dados.descontoPercentual ?? 0;
    this.condicoesPagamento = dados.condicoesPagamento || "";
    this.observacoes = dados.observacoes || "";
    this.pagamentos = (dados.pagamentos || []).map((pagamento) => new Pagamento(pagamento));
    // Leitura financeira usa o total salvo; a edição recalcula a proposta explicitamente.
    this.totalSalvo = dados.totalFinal;
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

  obterTotalFinanceiro() { return this.totalSalvo ?? this.calcularTotal(); }

  calcularTotalPago() {
    return this.pagamentos.reduce((soma, pagamento) => soma + Math.round(pagamento.valor * 100), 0) / 100;
  }

  calcularSaldoAberto() {
    return Math.max(0, Math.round(this.obterTotalFinanceiro() * 100) - Math.round(this.calcularTotalPago() * 100)) / 100;
  }

  obterSituacaoFinanceira() {
    if (this.calcularTotalPago() === 0) return "Em aberto";
    return this.calcularSaldoAberto() > 0 ? "Parcialmente pago" : "Pago";
  }

  adicionarPagamento(dados) {
    const pagamento = new Pagamento(dados);
    if (Math.round(pagamento.valor * 100) > Math.round(this.calcularSaldoAberto() * 100)) {
      throw new Error("O pagamento não pode ultrapassar o saldo em aberto.");
    }
    if (this.pagamentos.some((item) => item.id === pagamento.id)) throw new Error("Pagamento já registrado.");
    this.pagamentos.push(pagamento);
    return pagamento;
  }

  removerPagamento(id) {
    if (!this.pagamentos.some((item) => item.id === id)) throw new Error("Pagamento não encontrado. Atualize a página.");
    this.pagamentos = this.pagamentos.filter((item) => item.id !== id);
  }

  validarTotalPago() {
    if (Math.round(this.calcularTotal() * 100) < Math.round(this.calcularTotalPago() * 100)) {
      const pago = this.calcularTotalPago().toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      throw new Error(`O total do orçamento não pode ser menor que o valor já pago de ${pago}.`);
    }
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
      pagamentos: this.pagamentos.map((pagamento) => ({ ...pagamento })),
    };
  }
}
