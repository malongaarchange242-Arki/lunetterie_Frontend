/* ==========================================================================
   RECEPTION.JS — Confirmation de réception des transferts inter-station
   ========================================================================== */

const API_URL = 'https://api-lunetterie.universearch.com/api/v1';

let stationsList = [];
let transfersList = [];

const stationSelect = document.getElementById('stationSelect');
const transfersListEl = document.getElementById('transfersList');

function authHeaders(extra = {}) {
    const token = localStorage.getItem('token');
    return { ...extra, 'Authorization': `Bearer ${token}` };
}

function stationName(id) {
    const station = stationsList.find(s => String(s.id) === String(id));
    return station ? station.name : `Station #${id}`;
}

async function loadStations() {
    try {
        const response = await fetch(`${API_URL}/auth/stations`);
        const json = await response.json();
        if (json.success && Array.isArray(json.data?.stations)) {
            stationsList = json.data.stations;
        }
    } catch (error) {
        console.error('Erreur chargement stations', error);
    }

    stationSelect.innerHTML = stationsList.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    const savedStationId = localStorage.getItem('reception_station_id');
    if (savedStationId && stationsList.some(s => String(s.id) === savedStationId)) {
        stationSelect.value = savedStationId;
    }
}

function renderTransfers() {
    if (!transfersList.length) {
        transfersListEl.innerHTML = `<div class="reception-empty">Aucun transfert en attente de réception pour cette station.</div>`;
        return;
    }

    transfersListEl.innerHTML = transfersList.map(t => `
        <div class="transfer-card" style="margin-bottom:16px;">
            <div class="transfer-card-head">
                <div>
                    <h3>Transfert #${t.id} — depuis ${stationName(t.from_station_id)}</h3>
                    <div class="sub">Créé le ${new Date(t.created_at).toLocaleString('fr-FR')} · ${t.items.length} monture${t.items.length > 1 ? 's' : ''}</div>
                </div>
                <span class="transfer-status">${t.status === 'IN_TRANSIT' ? 'En transit' : t.status}</span>
            </div>
            <table class="send-table">
                <thead><tr><th>Code-barres</th><th>Statut</th><th></th></tr></thead>
                <tbody>
                    ${t.items.map(item => `
                        <tr>
                            <td>${item.barcode || '—'}</td>
                            <td>${item.status === 'RECEIVED'
                                ? '<span class="status-pill success"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>Reçue</span>'
                                : (item.status === 'IN_TRANSIT'
                                    ? '<span class="status-pill transit"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="7" width="13" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="5.5" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/></svg>En transit</span>'
                                    : item.status)}</td>
                            <td>
                                ${item.status !== 'RECEIVED' ? `<button class="btn btn-primary receive-item-btn" data-transfer-id="${t.id}" data-barcode="${item.barcode}">Confirmer réception</button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `).join('');

    transfersListEl.querySelectorAll('.receive-item-btn').forEach(btn => {
        btn.addEventListener('click', () => receiveItem(btn.dataset.transferId, btn.dataset.barcode, btn));
    });
}

async function receiveItem(transferId, barcode, btn) {
    btn.disabled = true;
    const originalLabel = btn.innerHTML;
    btn.innerHTML = 'Confirmation...';

    try {
        const response = await fetch(`${API_URL}/inventory/transfers/${transferId}/receive`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ barcode })
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
            throw new Error(json?.error || `Erreur serveur (${response.status})`);
        }
        await loadTransfers();
    } catch (error) {
        console.error('Erreur réception monture', error);
        alert(error.message || 'Échec de la confirmation de réception');
        btn.disabled = false;
        btn.innerHTML = originalLabel;
    }
}

async function loadTransfers() {
    const stationId = stationSelect.value;
    if (!stationId) {
        transfersListEl.innerHTML = '';
        return;
    }
    localStorage.setItem('reception_station_id', stationId);

    transfersListEl.innerHTML = `<div class="reception-empty">Chargement…</div>`;

    try {
        const response = await fetch(`${API_URL}/inventory/transfers?station_id=${stationId}&status=IN_TRANSIT`, {
            headers: authHeaders()
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
            throw new Error(json?.error || `Erreur serveur (${response.status})`);
        }
        // L'API filtre par station_id sur origine ET destination ; on ne garde que les transferts
        // qui arrivent réellement à cette station.
        transfersList = (json.data || []).filter(t => String(t.to_station_id) === String(stationId));
        renderTransfers();
    } catch (error) {
        console.error('Erreur chargement transferts', error);
        transfersListEl.innerHTML = `<div class="reception-empty">${error.message || 'Erreur de chargement des transferts'}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadStations();
    if (stationSelect.value) await loadTransfers();

    stationSelect.addEventListener('change', loadTransfers);
    document.getElementById('refreshBtn').addEventListener('click', loadTransfers);
});
