const STORAGE_KEY = "pokeluxe-delivery-tracker-v1";
const STORAGE_MODE = "local";
const STORAGE_FALLBACK_KEY = "__pokeluxe_delivery_tracker__";
const CSV_BACKUP_STORAGE_KEY = "pokeluxe-delivery-tracker-csv-backup-v1";
const CSV_BACKUP_META_STORAGE_KEY = "pokeluxe-delivery-tracker-csv-backup-meta-v1";
let currentStorageStatus = {
    tier: "window-name",
    isDurable: false,
    message: "Persistencia temporaria ativa so nesta aba."
};
let currentBackupMeta = null;

const STATUS_CONFIG = {
    EM_SEPARACAO: { label: "📦 EM SEPARACAO", className: "status-EM_SEPARACAO" },
    ENVIADO: { label: "🚚 ENVIADO", className: "status-ENVIADO" },
    ENTREGUE: { label: "✅ ENTREGUE", className: "status-ENTREGUE" }
};

const CARRIER_CONFIG = {
    CORREIOS: { label: "Correios", baseUrl: "https://rastreamento.correios.com.br/app/index.php" },
    JADLOG: { label: "Jadlog", baseUrl: "https://www.jadlog.com.br/tracking" },
    TOTAL_EXPRESS: { label: "Total Express", baseUrl: "https://tracking.totalexpress.com.br/" },
    LOGGI: { label: "Loggi", baseUrl: "https://www.loggi.com/rastreio/" },
    OUTRA: { label: "Outra", baseUrl: "#" }
};

const state = {
    orders: loadOrders(),
    selectedOrderId: null,
    lastValidatedAddress: null,
    filters: {
        search: "",
        status: "TODOS"
    }
};

const elements = {
    orderForm: document.querySelector("#orderForm"),
    pedidoId: document.querySelector("#pedidoId"),
    cliente: document.querySelector("#cliente"),
    itens: document.querySelector("#itens"),
    cep: document.querySelector("#cep"),
    prazo: document.querySelector("#prazo"),
    status: document.querySelector("#status"),
    canal: document.querySelector("#canal"),
    codigoRastreio: document.querySelector("#codigoRastreio"),
    transportadora: document.querySelector("#transportadora"),
    observacoes: document.querySelector("#observacoes"),
    addressPreview: document.querySelector("#addressPreview"),
    ordersList: document.querySelector("#ordersList"),
    emptyState: document.querySelector("#emptyState"),
    searchInput: document.querySelector("#searchInput"),
    statusFilter: document.querySelector("#statusFilter"),
    documentOutput: document.querySelector("#documentOutput"),
    copyDocumentButton: document.querySelector("#copyDocumentButton"),
    copyTrackingButton: document.querySelector("#copyTrackingButton"),
    exportCsvButton: document.querySelector("#exportCsvButton"),
    autoBackupButton: document.querySelector("#autoBackupButton"),
    importCsvButton: document.querySelector("#importCsvButton"),
    csvFileInput: document.querySelector("#csvFileInput"),
    exportButton: document.querySelector("#exportButton"),
    refreshButton: document.querySelector("#refreshButton"),
    seedButton: document.querySelector("#seedButton"),
    storageNotice: document.querySelector("#storageNotice"),
    backupStatus: document.querySelector("#backupStatus"),
    totalPedidos: document.querySelector("#totalPedidos"),
    totalSeparacao: document.querySelector("#totalSeparacao"),
    totalEnviado: document.querySelector("#totalEnviado"),
    totalEntregue: document.querySelector("#totalEntregue"),
    orderCardTemplate: document.querySelector("#orderCardTemplate")
};

wireEvents();
syncBackupState();
render();

function wireEvents() {
    elements.orderForm.addEventListener("submit", handleCreateOrder);
    elements.orderForm.addEventListener("reset", handleResetForm);
    elements.cep.addEventListener("input", handleCepInput);
    elements.cep.addEventListener("blur", handleCepLookup);
    elements.searchInput.addEventListener("input", handleSearchInput);
    elements.statusFilter.addEventListener("change", handleStatusFilterChange);
    elements.copyDocumentButton.addEventListener("click", copyDocumentText);
    elements.copyTrackingButton.addEventListener("click", copyTrackingCode);
    elements.exportCsvButton.addEventListener("click", exportOrdersAsCsv);
    elements.autoBackupButton.addEventListener("click", downloadAutomaticBackup);
    elements.importCsvButton.addEventListener("click", () => elements.csvFileInput.click());
    elements.csvFileInput.addEventListener("change", importOrdersFromCsvFile);
    elements.exportButton.addEventListener("click", () => window.print());
    elements.refreshButton.addEventListener("click", refreshFromStorage);
    elements.seedButton.addEventListener("click", seedDemoData);
    window.addEventListener("storage", refreshFromStorage);
}

function handleSearchInput(event) {
    state.filters.search = event.target.value.trim().toLowerCase();
    syncSelectedOrderToVisibleList();
    render();
}

function handleStatusFilterChange(event) {
    state.filters.status = event.target.value;
    syncSelectedOrderToVisibleList();
    render();
}

function handleCepInput(event) {
    const digits = normalizeCep(event.target.value);
    event.target.value = formatCep(digits);
}

async function handleCepLookup() {
    const cep = normalizeCep(elements.cep.value);

    if (cep.length !== 8) {
        state.lastValidatedAddress = null;
        renderAddressPreview("Informe um CEP valido com 8 digitos.");
        return;
    }

    renderAddressPreview("Consultando CEP...");

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            throw new Error("CEP nao encontrado.");
        }

        state.lastValidatedAddress = {
            cep: formatCep(cep),
            city: data.localidade,
            state: data.uf,
            neighborhood: data.bairro || "Bairro nao informado",
            street: data.logradouro || "Rua nao informada"
        };

        renderAddressPreview(
            `${state.lastValidatedAddress.street}, ${state.lastValidatedAddress.neighborhood} - ` +
            `${state.lastValidatedAddress.city}/${state.lastValidatedAddress.state}`
        );
    } catch (error) {
        state.lastValidatedAddress = null;
        renderAddressPreview(error.message || "Nao foi possivel validar o CEP.");
    }
}

async function handleCreateOrder(event) {
    event.preventDefault();

    if (!state.lastValidatedAddress || normalizeCep(elements.cep.value) !== normalizeCep(state.lastValidatedAddress.cep)) {
        await handleCepLookup();
    }

    if (!state.lastValidatedAddress) {
        window.alert("Valide o CEP antes de salvar o pedido.");
        return;
    }

    const now = new Date();
    const shippingDeadline = addDays(now, Number(elements.prazo.value || 0));
    const initialStatus = elements.status.value;
    const order = {
        id: crypto.randomUUID(),
        pedidoId: elements.pedidoId.value.trim(),
        customerName: elements.cliente.value.trim(),
        publicCustomerName: maskCustomerName(elements.cliente.value),
        items: normalizeItems(elements.itens.value),
        postalCode: state.lastValidatedAddress.cep,
        address: state.lastValidatedAddress,
        deadlineDays: Number(elements.prazo.value || 0),
        estimatedShippingDate: shippingDeadline.toISOString(),
        status: initialStatus,
        channel: elements.canal.value,
        trackingCode: normalizeTrackingCode(elements.codigoRastreio.value),
        carrier: normalizeCarrier(elements.transportadora.value),
        notes: elements.observacoes.value.trim(),
        history: [
            createHistoryEntry(`Pedido criado com status ${STATUS_CONFIG[initialStatus].label}`, now),
            ...(elements.codigoRastreio.value.trim()
                ? [createHistoryEntry(`Codigo de rastreio informado: ${normalizeTrackingCode(elements.codigoRastreio.value)}`, now)]
                : [])
        ],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
    };

    state.orders.unshift(order);
    state.selectedOrderId = order.id;
    persistOrders();
    elements.orderForm.reset();
    elements.prazo.value = 2;
    state.lastValidatedAddress = null;
    renderAddressPreview("Aguardando consulta do CEP.");
    render();
}

function renderBackupStatus() {
    if (!elements.backupStatus || !elements.autoBackupButton) {
        return;
    }

    if (!currentBackupMeta?.createdAt) {
        elements.backupStatus.textContent = "Backup automatico CSV ainda nao gerado.";
        elements.autoBackupButton.disabled = true;
        return;
    }

    elements.backupStatus.textContent = `Backup automatico CSV pronto: ${formatDateTime(currentBackupMeta.createdAt)}`;
    elements.autoBackupButton.disabled = false;
}

function persistAutomaticCsvBackup(orders) {
    const csvContent = toCsv(orders);
    const timestamp = new Date().toISOString();
    const backupMeta = {
        createdAt: timestamp,
        fileName: `pokeluxe-backup-auto-${timestamp.slice(0, 19).replace(/[T:]/g, "-")}.csv`
    };

    writeStructuredStorageValue(CSV_BACKUP_STORAGE_KEY, csvContent);
    writeStructuredStorageValue(CSV_BACKUP_META_STORAGE_KEY, JSON.stringify(backupMeta));
    currentBackupMeta = backupMeta;
}

function syncBackupState() {
    const storedMeta = readStructuredStorageValue(CSV_BACKUP_META_STORAGE_KEY);

    if (!storedMeta) {
        currentBackupMeta = null;
        return;
    }

    try {
        currentBackupMeta = JSON.parse(storedMeta);
    } catch {
        currentBackupMeta = null;
    }
}

function downloadAutomaticBackup() {
    const csvContent = readStructuredStorageValue(CSV_BACKUP_STORAGE_KEY);

    if (!csvContent) {
        window.alert("Ainda nao existe backup automatico CSV para baixar.");
        return;
    }

    const fileName = currentBackupMeta?.fileName || `pokeluxe-backup-auto-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
    downloadCsvContent(csvContent, fileName);
}

function handleResetForm() {
    state.lastValidatedAddress = null;
    renderAddressPreview("Aguardando consulta do CEP.");
}

function refreshFromStorage() {
    state.orders = loadOrders();
    syncBackupState();
    syncSelectedOrderToVisibleList();
    render();
}

function render() {
    renderStorageNotice();
    renderBackupStatus();
    renderStats();
    renderOrders();
    renderSelectedDocument();
}

function renderStorageNotice() {
    if (!elements.storageNotice) {
        return;
    }

    elements.storageNotice.hidden = currentStorageStatus.isDurable;
    elements.storageNotice.textContent = currentStorageStatus.message;
}

function renderStats() {
    elements.totalPedidos.textContent = String(state.orders.length);
    elements.totalSeparacao.textContent = String(countOrdersByStatus("EM_SEPARACAO"));
    elements.totalEnviado.textContent = String(countOrdersByStatus("ENVIADO"));
    elements.totalEntregue.textContent = String(countOrdersByStatus("ENTREGUE"));
}

function renderOrders() {
    const visibleOrders = getVisibleOrders();

    elements.ordersList.innerHTML = "";
    elements.emptyState.hidden = visibleOrders.length > 0;

    for (const order of visibleOrders) {
        const fragment = elements.orderCardTemplate.content.cloneNode(true);
        const card = fragment.querySelector(".order-card");
        const statusInfo = STATUS_CONFIG[order.status];
        const statusPill = fragment.querySelector(".status-pill");
        const statusSelect = fragment.querySelector(".status-select");
        const trackingInput = fragment.querySelector(".tracking-input");
        const historyList = fragment.querySelector(".history-list");
        const trackingLink = fragment.querySelector(".order-tracking-link");

        fragment.querySelector(".order-id").textContent = order.pedidoId;
        fragment.querySelector(".order-customer").textContent = order.publicCustomerName;
        statusPill.textContent = statusInfo.label;
        statusPill.className = `status-pill ${statusInfo.className}`;
        fragment.querySelector(".order-items").textContent = order.items.join(", ");
        fragment.querySelector(".order-address").textContent = `${order.postalCode} · ${order.address.city}/${order.address.state}`;
        fragment.querySelector(".order-deadline").textContent = formatDate(order.estimatedShippingDate);
        fragment.querySelector(".order-channel").textContent = order.channel;
        fragment.querySelector(".order-tracking").textContent = order.trackingCode || "Aguardando codigo";
        fragment.querySelector(".order-carrier").textContent = getCarrierLabel(order.carrier);
        fragment.querySelector(".order-notes").textContent = order.notes || "Sem observacoes internas.";
        trackingInput.value = order.trackingCode || "";
        configureTrackingLink(trackingLink, order.trackingCode, order.carrier);

        for (const entry of ensureOrderHistory(order)) {
            const item = document.createElement("li");
            item.textContent = `${formatDateTime(entry.at)} - ${entry.message}`;
            historyList.append(item);
        }

        for (const [statusKey, config] of Object.entries(STATUS_CONFIG)) {
            const option = document.createElement("option");
            option.value = statusKey;
            option.textContent = config.label;
            option.selected = order.status === statusKey;
            statusSelect.append(option);
        }

        statusSelect.addEventListener("change", (event) => updateOrderStatus(order.id, event.target.value));
        fragment.querySelector(".save-tracking-button").addEventListener("click", () => {
            updateOrderTracking(order.id, trackingInput.value);
        });
        fragment.querySelector(".select-order-button").addEventListener("click", () => {
            state.selectedOrderId = order.id;
            renderSelectedDocument();
        });
        fragment.querySelector(".delete-order-button").addEventListener("click", () => deleteOrder(order.id));

        if (order.id === state.selectedOrderId) {
            card.style.outline = "3px solid rgba(183, 73, 30, 0.22)";
        }

        elements.ordersList.append(fragment);
    }
}

function renderSelectedDocument() {
    const visibleOrders = getVisibleOrders();
    const order = visibleOrders.find((entry) => entry.id === state.selectedOrderId) ?? visibleOrders[0];

    if (!order) {
        elements.documentOutput.textContent = "Selecione um pedido para gerar o texto formatado.";
        return;
    }

    state.selectedOrderId = order.id;
    elements.documentOutput.textContent = generateDeliveryDocument(order);
}

function updateOrderStatus(orderId, nextStatus) {
    state.orders = state.orders.map((order) => {
        if (order.id !== orderId) {
            return order;
        }

        if (order.status === nextStatus) {
            return order;
        }

        const updatedAt = new Date();

        return {
            ...order,
            status: nextStatus,
            updatedAt: updatedAt.toISOString(),
            history: [
                ...ensureOrderHistory(order),
                createHistoryEntry(`Status alterado para ${STATUS_CONFIG[nextStatus].label}`, updatedAt)
            ]
        };
    });

    persistOrders();
    render();
}

function updateOrderTracking(orderId, nextTrackingCode) {
    const normalizedTrackingCode = normalizeTrackingCode(nextTrackingCode);

    state.orders = state.orders.map((order) => {
        if (order.id !== orderId) {
            return order;
        }

        if ((order.trackingCode || "") === normalizedTrackingCode) {
            return order;
        }

        const updatedAt = new Date();
        const historyMessage = normalizedTrackingCode
            ? `Codigo de rastreio atualizado para ${normalizedTrackingCode}`
            : "Codigo de rastreio removido";

        return {
            ...order,
            trackingCode: normalizedTrackingCode,
            updatedAt: updatedAt.toISOString(),
            history: [
                ...ensureOrderHistory(order),
                createHistoryEntry(historyMessage, updatedAt)
            ]
        };
    });

    persistOrders();
    render();
}

function deleteOrder(orderId) {
    state.orders = state.orders.filter((order) => order.id !== orderId);

    if (state.selectedOrderId === orderId) {
        state.selectedOrderId = state.orders[0]?.id ?? null;
    }

    persistOrders();
    render();
}

async function copyDocumentText() {
    const content = elements.documentOutput.textContent;

    if (!content || content.includes("Selecione um pedido")) {
        window.alert("Selecione um pedido antes de copiar o documento.");
        return;
    }

    try {
        await navigator.clipboard.writeText(content);
        window.alert("Documento copiado para a area de transferencia.");
    } catch {
        window.alert("Nao foi possivel copiar automaticamente. Tente novamente.");
    }
}

async function copyTrackingCode() {
    const order = getSelectedVisibleOrder();

    if (!order) {
        window.alert("Selecione um pedido visivel antes de copiar o rastreio.");
        return;
    }

    if (!order.trackingCode) {
        window.alert("O pedido selecionado ainda nao possui codigo de rastreio.");
        return;
    }

    try {
        await navigator.clipboard.writeText(order.trackingCode);
        window.alert("Codigo de rastreio copiado para a area de transferencia.");
    } catch {
        window.alert("Nao foi possivel copiar o codigo de rastreio automaticamente.");
    }
}

function exportOrdersAsCsv() {
    if (state.orders.length === 0) {
        window.alert("Nao ha pedidos para exportar.");
        return;
    }

    const csvContent = toCsv(state.orders);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");

    downloadCsvContent(csvContent, `pokeluxe-pedidos-${timestamp}.csv`);
}

function downloadCsvContent(csvContent, fileName) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function importOrdersFromCsvFile(event) {
    const file = event.target.files?.[0];

    if (!file) {
        return;
    }

    try {
        const csvText = await file.text();
        const importedOrders = parseOrdersCsv(csvText);

        if (importedOrders.length === 0) {
            window.alert("O CSV nao possui pedidos validos para importar.");
            return;
        }

        state.orders = mergeImportedOrders(importedOrders, state.orders);
        syncSelectedOrderToVisibleList();
        persistOrders();
        render();
        window.alert(`${importedOrders.length} pedido(s) importado(s) com sucesso.`);
    } catch (error) {
        window.alert(error.message || "Nao foi possivel importar o CSV.");
    } finally {
        event.target.value = "";
    }
}

function seedDemoData() {
    if (state.orders.length > 0 && !window.confirm("Isso vai adicionar pedidos de exemplo ao painel atual. Continuar?")) {
        return;
    }

    const demoOrders = [
        createDemoOrder({
            pedidoId: "PX-2026-01",
            customerName: "Alexandre Silva",
            items: ["Booster Pack", "Deck Selado"],
            postalCode: "01001-000",
            city: "Sao Paulo",
            stateCode: "SP",
            status: "EM_SEPARACAO",
            channel: "Live",
            notes: "Separar sleeves e cupom de fidelidade.",
            deadlineDays: 2
        }),
        createDemoOrder({
            pedidoId: "PX-2026-02",
            customerName: "Marina Costa",
            items: ["Pelucia Pikachu", "Mini Box Colecionador"],
            postalCode: "30130-110",
            city: "Belo Horizonte",
            stateCode: "MG",
            status: "ENVIADO",
            channel: "Site",
            notes: "Enviar codigo de rastreio no grupo VIP.",
            deadlineDays: 1
        })
    ];

    state.orders = [...demoOrders, ...state.orders];
    state.selectedOrderId = demoOrders[0].id;
    persistOrders();
    render();
}

function createDemoOrder({ pedidoId, customerName, items, postalCode, city, stateCode, status, channel, notes, deadlineDays }) {
    const createdAt = new Date();
    const trackingCode = status === "ENVIADO" ? "BR123456789" : "";

    return {
        id: crypto.randomUUID(),
        pedidoId,
        customerName,
        publicCustomerName: maskCustomerName(customerName),
        items,
        postalCode,
        address: {
            cep: postalCode,
            city,
            state: stateCode,
            neighborhood: "Centro",
            street: "Rua modelo"
        },
        deadlineDays,
        estimatedShippingDate: addDays(createdAt, deadlineDays).toISOString(),
        status,
        channel,
        carrier: trackingCode ? "CORREIOS" : "OUTRA",
        trackingCode,
        notes,
        history: [
            createHistoryEntry(`Pedido criado com status ${STATUS_CONFIG[status].label}`, createdAt),
            ...(trackingCode ? [createHistoryEntry(`Codigo de rastreio informado: ${trackingCode}`, createdAt)] : [])
        ],
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString()
    };
}

function normalizeItems(rawValue) {
    return rawValue
        .split(/[,\n;]/)
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((item) => item.replace(/\b(box|booster|deck|pelucia)\b/gi, (match) => capitalize(match)));
}

function generateDeliveryDocument(order) {
    const statusInfo = STATUS_CONFIG[order.status];
    const history = ensureOrderHistory(order);
    const latestHistoryEntry = history[history.length - 1];

    return [
        "--- ENTREGA POKELUXE ---",
        `ID: ${order.pedidoId}`,
        `Destinatario: ${order.publicCustomerName}`,
        `Itens: ${order.items.join(", ")}`,
        `Status Atual: ${statusInfo.label}`,
        `Canal: ${order.channel}`,
        `Codigo de rastreio: ${order.trackingCode || "Aguardando codigo"}`,
        `Transportadora: ${getCarrierLabel(order.carrier)}`,
        `CEP: ${order.postalCode}`,
        `Prazo estimado de postagem: ${formatDate(order.estimatedShippingDate)}`,
        `Ultima atualizacao: ${formatDateTime(order.updatedAt)}`,
        latestHistoryEntry ? `Ultimo evento: ${latestHistoryEntry.message}` : "Ultimo evento: Nenhum.",
        order.notes ? `Obs. interna: ${order.notes}` : "Obs. interna: Nenhuma.",
        "-------------------------"
    ].join("\n");
}

function renderAddressPreview(message) {
    elements.addressPreview.innerHTML = `<strong>Endereco validado:</strong> <span>${message}</span>`;
}

function loadOrders() {
    try {
        return storageAdapter.readOrders();
    } catch {
        return [];
    }
}

function persistOrders() {
    storageAdapter.writeOrders(state.orders);
    persistAutomaticCsvBackup(state.orders);
    syncBackupState();
}

function getVisibleOrders() {
    const searchTerm = state.filters.search;
    const statusFilter = state.filters.status;

    return state.orders.filter((order) => {
        const matchesStatus = statusFilter === "TODOS" || order.status === statusFilter;
        const searchableText = [
            order.pedidoId,
            order.customerName,
            order.publicCustomerName,
            order.channel,
            getCarrierLabel(order.carrier),
            order.trackingCode,
            ...(order.items || [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        const matchesSearch = !searchTerm || searchableText.includes(searchTerm);

        return matchesStatus && matchesSearch;
    });
}

function getSelectedVisibleOrder() {
    const visibleOrders = getVisibleOrders();
    return visibleOrders.find((order) => order.id === state.selectedOrderId) ?? visibleOrders[0] ?? null;
}

function syncSelectedOrderToVisibleList() {
    const visibleOrders = getVisibleOrders();

    if (!visibleOrders.some((order) => order.id === state.selectedOrderId)) {
        state.selectedOrderId = visibleOrders[0]?.id ?? null;
    }
}

function countOrdersByStatus(status) {
    return state.orders.filter((order) => order.status === status).length;
}

function normalizeCep(value) {
    return value.replace(/\D/g, "").slice(0, 8);
}

function formatCep(value) {
    const digits = normalizeCep(value);

    if (digits.length <= 5) {
        return digits;
    }

    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizeTrackingCode(value) {
    return value.replace(/\s+/g, "").toUpperCase();
}

function normalizeCarrier(value) {
    return CARRIER_CONFIG[value] ? value : "OUTRA";
}

function getCarrierLabel(carrier) {
    return CARRIER_CONFIG[normalizeCarrier(carrier)].label;
}

function ensureOrderHistory(order) {
    if (Array.isArray(order.history) && order.history.length > 0) {
        return order.history;
    }

    return [createHistoryEntry(`Pedido importado com status ${STATUS_CONFIG[order.status].label}`, order.updatedAt || order.createdAt || new Date())];
}

function createHistoryEntry(message, timestamp = new Date()) {
    return {
        at: new Date(timestamp).toISOString(),
        message
    };
}

function maskCustomerName(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length <= 1) {
        return parts[0] || "Cliente";
    }

    const firstName = capitalize(parts[0]);
    const initials = parts
        .slice(1)
        .map((part) => `${part[0].toUpperCase()}.`)
        .join(" ");

    return `${firstName} ${initials}`;
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function addDays(date, days) {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function formatDate(dateLike) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(dateLike));
}

function formatDateTime(dateLike) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(dateLike));
}

const storageAdapter = createStorageAdapter(STORAGE_MODE);

function createStorageAdapter(mode) {
    if (mode === "google-sheets") {
        return createGoogleSheetsAdapter();
    }

    return createLocalStorageAdapter();
}

function createLocalStorageAdapter() {
    return {
        readOrders() {
            const localResult = readOrdersFromLocalStorage();

            if (localResult.available && localResult.hasStoredValue) {
                currentStorageStatus = createStorageStatus("localStorage");
                return localResult.orders;
            }

            const sessionResult = readOrdersFromSessionStorage();

            if (sessionResult.available && sessionResult.hasStoredValue) {
                currentStorageStatus = createStorageStatus("sessionStorage");

                if (localResult.available) {
                    writeOrdersToWebStorage(window.localStorage, JSON.stringify(sessionResult.orders));
                }

                return sessionResult.orders;
            }

            currentStorageStatus = createStorageStatus("window-name");

            return readOrdersFromWindowName();
        },
        writeOrders(orders) {
            const serializedOrders = JSON.stringify(orders);
            let bestTier = "window-name";

            writeOrdersToWindowName(serializedOrders);

            if (writeOrdersToWebStorage(window.sessionStorage, serializedOrders)) {
                bestTier = "sessionStorage";
            }

            if (writeOrdersToWebStorage(window.localStorage, serializedOrders)) {
                bestTier = "localStorage";
            }

            currentStorageStatus = createStorageStatus(bestTier);

            if (bestTier !== "localStorage") {
                console.warn("Nao foi possivel persistir os pedidos no localStorage. Mantendo backup local para evitar perda ao atualizar.");
            }
        }
    };
}

function readOrdersFromLocalStorage() {
    return readOrdersFromWebStorage(window.localStorage);
}

function readOrdersFromSessionStorage() {
    return readOrdersFromWebStorage(window.sessionStorage);
}

function readOrdersFromWebStorage(storage) {
    try {
        const storedValue = storage.getItem(STORAGE_KEY);

        return {
            available: true,
            hasStoredValue: storedValue !== null,
            orders: parseStoredOrders(storedValue)
        };
    } catch {
        return {
            available: false,
            hasStoredValue: false,
            orders: []
        };
    }
}

function writeOrdersToWebStorage(storage, serializedOrders) {
    try {
        storage.setItem(STORAGE_KEY, serializedOrders);
        return true;
    } catch {
        return false;
    }
}

function readOrdersFromWindowName() {
    try {
        const snapshot = JSON.parse(window.name || "{}");
        return parseStoredOrders(snapshot[STORAGE_FALLBACK_KEY] || null);
    } catch {
        return [];
    }
}

function writeOrdersToWindowName(serializedOrders) {
    try {
        const snapshot = JSON.parse(window.name || "{}");
        snapshot[STORAGE_FALLBACK_KEY] = serializedOrders;
        window.name = JSON.stringify(snapshot);
    } catch {
        window.name = JSON.stringify({
            [STORAGE_FALLBACK_KEY]: serializedOrders
        });
    }
}

function readStructuredStorageValue(key) {
    const localResult = readValueFromWebStorage(window.localStorage, key);

    if (localResult.available && localResult.hasStoredValue) {
        return localResult.value;
    }

    const sessionResult = readValueFromWebStorage(window.sessionStorage, key);

    if (sessionResult.available && sessionResult.hasStoredValue) {
        return sessionResult.value;
    }

    return readValueFromWindowName(key);
}

function writeStructuredStorageValue(key, value) {
    writeValueToWindowName(key, value);
    writeValueToWebStorage(window.sessionStorage, key, value);
    writeValueToWebStorage(window.localStorage, key, value);
}

function readValueFromWebStorage(storage, key) {
    try {
        const storedValue = storage.getItem(key);

        return {
            available: true,
            hasStoredValue: storedValue !== null,
            value: storedValue
        };
    } catch {
        return {
            available: false,
            hasStoredValue: false,
            value: null
        };
    }
}

function writeValueToWebStorage(storage, key, value) {
    try {
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function readValueFromWindowName(key) {
    try {
        const snapshot = JSON.parse(window.name || "{}");
        return snapshot[key] || null;
    } catch {
        return null;
    }
}

function writeValueToWindowName(key, value) {
    try {
        const snapshot = JSON.parse(window.name || "{}");
        snapshot[key] = value;
        window.name = JSON.stringify(snapshot);
    } catch {
        window.name = JSON.stringify({
            [key]: value
        });
    }
}

function parseStoredOrders(storedValue) {
    if (!storedValue) {
        return [];
    }

    try {
        const parsedValue = JSON.parse(storedValue);
        return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
        return [];
    }
}

function createStorageStatus(tier) {
    if (tier === "localStorage") {
        return {
            tier,
            isDurable: true,
            message: ""
        };
    }

    if (tier === "sessionStorage") {
        return {
            tier,
            isDurable: false,
            message: "Persistencia temporaria ativa neste navegador. Os pedidos sobrevivem ao F5, mas podem ser perdidos ao fechar a sessao."
        };
    }

    return {
        tier,
        isDurable: false,
        message: "Persistencia temporaria ativa so nesta aba. Evite fechar a aba sem exportar um CSV de backup."
    };
}

function createGoogleSheetsAdapter() {
    return {
        readOrders() {
            console.info("Google Sheets adapter ainda nao configurado. Usando painel local como referencia de estrutura.");
            return [];
        },
        writeOrders() {
            console.info("Google Sheets adapter ainda nao configurado. Implemente a chamada da planilha neste ponto.");
        }
    };
}

function mergeImportedOrders(importedOrders, existingOrders) {
    const importedMap = new Map(importedOrders.map((order) => [order.pedidoId, order]));
    const mergedOrders = existingOrders.map((order) => importedMap.get(order.pedidoId) || order);
    const newOrders = importedOrders.filter((order) => !existingOrders.some((current) => current.pedidoId === order.pedidoId));

    return [...newOrders, ...mergedOrders].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

function parseOrdersCsv(csvText) {
    const rows = parseCsvRows(csvText);

    if (rows.length <= 1) {
        return [];
    }

    const headers = rows[0].map((header) => header.trim());

    return rows.slice(1)
        .filter((row) => row.some((cell) => cell.trim()))
        .map((row) => buildOrderFromCsvRow(row, headers))
        .filter(Boolean);
}

function buildOrderFromCsvRow(row, headers) {
    const data = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
    const pedidoId = data.pedidoId.trim();
    const customerName = data.customerName.trim();

    if (!pedidoId || !customerName) {
        return null;
    }

    const status = STATUS_CONFIG[data.status] ? data.status : "EM_SEPARACAO";
    const carrier = normalizeCarrier(data.carrier);
    const createdAt = data.createdAt || new Date().toISOString();
    const updatedAt = data.updatedAt || createdAt;
    const items = normalizeItems(data.items || "");
    const postalCode = formatCep(data.postalCode || "");
    const deadlineDays = Number(data.deadlineDays || 0);
    const trackingCode = normalizeTrackingCode(data.trackingCode || "");
    const history = parseHistoryField(data.history, updatedAt, status, trackingCode);

    return {
        id: data.id || crypto.randomUUID(),
        pedidoId,
        customerName,
        publicCustomerName: maskCustomerName(customerName),
        items,
        postalCode,
        address: {
            cep: postalCode,
            city: data.city || "Cidade nao informada",
            state: data.state || "UF",
            neighborhood: data.neighborhood || "Bairro nao informado",
            street: data.street || "Rua nao informada"
        },
        deadlineDays,
        estimatedShippingDate: data.estimatedShippingDate || addDays(new Date(createdAt), deadlineDays).toISOString(),
        status,
        channel: data.channel || "Live",
        carrier,
        trackingCode,
        notes: data.notes || "",
        history,
        createdAt,
        updatedAt
    };
}

function parseHistoryField(rawHistory, fallbackTimestamp, status, trackingCode) {
    if (!rawHistory.trim()) {
        const history = [createHistoryEntry(`Pedido importado com status ${STATUS_CONFIG[status].label}`, fallbackTimestamp)];

        if (trackingCode) {
            history.push(createHistoryEntry(`Codigo de rastreio informado: ${trackingCode}`, fallbackTimestamp));
        }

        return history;
    }

    return rawHistory
        .split(" || ")
        .map((entry) => {
            const separatorIndex = entry.indexOf("::");

            if (separatorIndex === -1) {
                return createHistoryEntry(entry.trim(), fallbackTimestamp);
            }

            return {
                at: entry.slice(0, separatorIndex).trim(),
                message: entry.slice(separatorIndex + 2).trim()
            };
        })
        .filter((entry) => entry.message);
}

function parseCsvRows(csvText) {
    const rows = [];
    let currentCell = "";
    let currentRow = [];
    let inQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
        const char = csvText[index];
        const nextChar = csvText[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }

            continue;
        }

        if (char === "," && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && nextChar === "\n") {
                index += 1;
            }

            currentRow.push(currentCell);
            rows.push(currentRow);
            currentCell = "";
            currentRow = [];
            continue;
        }

        currentCell += char;
    }

    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    return rows;
}

function toCsv(orders) {
    const headers = [
        "id",
        "pedidoId",
        "customerName",
        "items",
        "postalCode",
        "city",
        "state",
        "neighborhood",
        "street",
        "deadlineDays",
        "estimatedShippingDate",
        "status",
        "channel",
        "carrier",
        "trackingCode",
        "notes",
        "history",
        "createdAt",
        "updatedAt"
    ];

    const lines = [headers.join(",")];

    for (const order of orders) {
        const row = [
            order.id,
            order.pedidoId,
            order.customerName,
            (order.items || []).join(" | "),
            order.postalCode,
            order.address?.city || "",
            order.address?.state || "",
            order.address?.neighborhood || "",
            order.address?.street || "",
            String(order.deadlineDays ?? 0),
            order.estimatedShippingDate,
            order.status,
            order.channel,
            order.carrier || "OUTRA",
            order.trackingCode || "",
            order.notes || "",
            serializeHistory(order.history),
            order.createdAt,
            order.updatedAt
        ].map(escapeCsvValue);

        lines.push(row.join(","));
    }

    return lines.join("\n");
}

function serializeHistory(history) {
    return ensureOrderHistory({ history, status: "EM_SEPARACAO" })
        .map((entry) => `${entry.at}::${entry.message}`)
        .join(" || ");
}

function escapeCsvValue(value) {
    const stringValue = String(value ?? "");

    if (!/[",\n]/.test(stringValue)) {
        return stringValue;
    }

    return `"${stringValue.replace(/"/g, '""')}"`;
}

function configureTrackingLink(anchor, trackingCode, carrier) {
    if (!trackingCode) {
        anchor.textContent = "Aguardando codigo";
        anchor.href = "#";
        anchor.classList.add("is-disabled");
        return;
    }

    anchor.textContent = `Abrir em ${getCarrierLabel(carrier)}`;
    anchor.href = buildTrackingUrl(trackingCode, carrier);
    anchor.classList.remove("is-disabled");
}

function buildTrackingUrl(trackingCode, carrier) {
    const normalizedCarrier = normalizeCarrier(carrier);

    if (normalizedCarrier === "CORREIOS") {
        return `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(trackingCode)}`;
    }

    return CARRIER_CONFIG[normalizedCarrier].baseUrl;
}