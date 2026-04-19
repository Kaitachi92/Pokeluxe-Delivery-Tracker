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
- Backup automatico em CSV atualizado a cada alteracao, com botao para baixar o ultimo snapshot salvo no navegador.
- Link direto para abrir o rastreio do pedido em Correios, Jadlog, Total Express ou Loggi.
- Arquivo modelo CSV pronto para baixar e usar como base.
- Metadados de pagina e favicon prontos para publicacao no GitHub Pages.
- Persistencia local via `localStorage`, com fallback na aba atual quando o navegador bloquear esse armazenamento.
- Integracao opcional e gratuita com Google Sheets via Apps Script para salvar os pedidos fora do navegador.
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

- Os dados ficam salvos apenas no navegador atual; se o `localStorage` estiver indisponivel, o app preserva os pedidos ao atualizar a aba atual.
- O backup automatico em CSV fica salvo no navegador atual e pode ser baixado depois pelo botao dedicado.
- A camada de armazenamento agora suporta um fluxo opcional de Google Sheets via Apps Script, mantendo `localStorage` como cache e backup do navegador.
- O campo de itens normaliza entradas separadas por virgula, quebra de linha ou ponto e virgula.

## Persistencia gratuita com Google Sheets

Se voce precisa salvar os pedidos fora do navegador sem custo, use um Google Sheets com Apps Script.

1. Crie uma planilha vazia no Google Sheets.
2. Abra `Extensoes > Apps Script`.
3. Cole este script, trocando `NOME_DA_ABA` se quiser:

```javascript
const SHEET_NAME = "Pedidos";

function getSheet() {
	const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
	let sheet = spreadsheet.getSheetByName(SHEET_NAME);

	if (!sheet) {
		sheet = spreadsheet.insertSheet(SHEET_NAME);
	}

	return sheet;
}

function doGet() {
	const sheet = getSheet();
	const rawValue = sheet.getRange("A1").getValue();
	const orders = rawValue ? JSON.parse(rawValue) : [];

	return ContentService
		.createTextOutput(JSON.stringify({ orders }))
		.setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
	const payload = JSON.parse(e.postData.contents || "{}");
	const orders = Array.isArray(payload.orders) ? payload.orders : [];
	const sheet = getSheet();

	sheet.getRange("A1").setValue(JSON.stringify(orders));

	return ContentService
		.createTextOutput(JSON.stringify({ ok: true, count: orders.length }))
		.setMimeType(ContentService.MimeType.JSON);
}
```

4. Publique em `Implantar > Nova implantacao > App da Web`.
5. Em `Quem tem acesso`, escolha `Qualquer pessoa com o link`.
6. Copie a URL do App da Web.
7. Abra o arquivo `config.js` do projeto e preencha a URL:

```javascript
window.POKELUXE_GOOGLE_SHEETS_WEB_APP_URL = "COLE_AQUI_A_URL_DO_APPS_SCRIPT";
```

Sem essa URL, o app continua funcionando so com salvamento local no navegador.