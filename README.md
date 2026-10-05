# Sistema de Orçamentos para Serviços de Drywall e Gesso

Projeto Integrado desenvolvido no curso de Análise e Desenvolvimento de Sistemas da UNIFEOB, no módulo de Desenvolvimento de Sistemas.

## Aluno

**Nome:** Leonardo Ferreira Bernardes de Souza  
**RA:** 26000904

## Empresa Beneficiada

**Pizzol Decoração em Gesso**

## Objetivo do Projeto

Desenvolver um sistema web para auxiliar no cadastro de clientes e serviços, criação e gerenciamento de orçamentos, controle de pagamentos e acompanhamento das informações por meio de um Dashboard.

## Funcionalidades

- Cadastro de clientes
- Cadastro de serviços e preços
- Criação de orçamentos
- Cálculo automático dos valores
- Aplicação de desconto percentual
- Registro de valores adicionais
- Edição e exclusão de orçamentos
- Controle de status dos orçamentos
- Registro de pagamentos
- Cálculo de total pago e saldo em aberto
- Filtros e pesquisas
- Dashboard com informações resumidas
- Preservação dos dados históricos dos orçamentos
- Testes automatizados

## Tecnologias Utilizadas

- HTML
- CSS
- JavaScript
- LocalStorage
- Node.js para execução dos testes
- Git
- GitHub

## Programação Orientada a Objetos

O projeto utiliza conceitos de Programação Orientada a Objetos, como:

- Classes e objetos
- Atributos e métodos
- Encapsulamento
- Herança
- Polimorfismo

A classe `Entidade` é utilizada como classe base para as classes `Cliente` e `Servico`.

O polimorfismo é demonstrado por meio do método `obterIdentificacao()`, que possui implementações específicas nas classes derivadas.

## Estrutura Principal

```text
assets/
css/
js/
pages/
tests/
index.html
```
