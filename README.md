# Pokeluxe Delivery Tracker

Aplicacao web estatica para organizar pedidos da Pokeluxe, acompanhar status de envio e gerar um documento de entrega pronto para compartilhar com a equipe.

## O que esta pronto

- Cadastro de pedidos com ID, cliente, itens, canal, observacoes e prazo estimado.
- Validacao de CEP via ViaCEP para exibir cidade e UF antes do salvamento.
- Mascara LGPD no nome do destinatario exibido no painel e no documento.
- Painel visual com contadores por status: em separacao, enviado e entregue.
- Campo de codigo de rastreio com atualizacao manual por pedido.
- Historico local de eventos com registro automatico de mudancas de status.
- Busca por ID, cliente, item ou rastreio, com filtro por status.
- Botao para copiar o codigo de rastreio do pedido selecionado.
- Importacao e exportacao de pedidos em CSV.
- Link direto para abrir o rastreio do pedido em Correios, Jadlog, Total Express ou Loggi.
- Arquivo modelo CSV pronto para baixar e usar como base.
- Metadados de pagina e favicon prontos para publicacao no GitHub Pages.
- Persistencia local via `localStorage`.
- Documento de entrega em texto pronto para copiar e opcao de impressao/PDF.
- Botao de atualizacao para recarregar os dados mais recentes do navegador.

## Como usar

1. Abra o arquivo `index.html` no navegador.
2. Preencha o formulario e saia do campo CEP para validar o endereco.
3. Salve o pedido para inserir no painel.
4. Use `Gerar documento` para montar o texto de compartilhamento.
5. Use `Imprimir / PDF` para gerar uma versao imprimivel.
6. Use `Exportar CSV` para baixar um backup editavel dos pedidos.
7. Use `Importar CSV` para restaurar ou atualizar pedidos em lote.
8. Escolha a transportadora para que o link de rastreio abra no portal correto.
9. Use `Modelo CSV` para baixar um arquivo base com cabecalhos e um exemplo preenchido.

## Observacoes tecnicas

- Os dados ficam salvos apenas no navegador atual.
- A camada de armazenamento foi separada em adaptadores para facilitar uma futura integracao com Google Sheets sem alterar a interface.
- O campo de itens normaliza entradas separadas por virgula, quebra de linha ou ponto e virgula.