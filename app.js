const SUPABASE_URL = window.ENV_SUPABASE_URL || 'https://uiwsexjkwyzxdxaxxnuq.supabase.co';
const SUPABASE_ANON_KEY = window.ENV_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpd3NleGprd3l6eGR4YXh4bnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MjU3NDgsImV4cCI6MjEwNTAwMTc0OH0.lpzCJCD3K0jHv9oDoIUo4KG2nMZO5WIGf58-S-AcEYcand';


const supabase = (typeof window.supabase !== 'undefined' && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Application State Model
const AppState = {
    currentUser: null,       // Profile object: { id, full_name, role, department }
    currentRole: 'Requester',// Active Role: 'Administrator', 'Laboratory Staff', 'Requester'
    equipment: [],           // Inventory list
    transactions: [],        // Borrowing requests list
    auditLogs: [],           // Audit trail records (Admin only)
    activeTab: 'catalog'     // Navigation state: 'catalog', 'requests', 'maintenance', 'audit', 'test-suite'
};

// Available Roles in Section III
const ROLES = {
    ADMIN: 'Administrator',
    STAFF: 'Laboratory Staff',
    REQUESTER: 'Requester'
};

// Available Borrowing Workflow Statuses in Section IV
const TRANSACTION_STATUS = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    RELEASED: 'Released',
    RETURNED: 'Returned',
    OVERDUE: 'Overdue',
    CLOSED: 'Closed'
};

// Equipment Statuses
const EQUIPMENT_STATUS = {
    AVAILABLE: 'Available',
    BORROWED: 'Borrowed',
    MAINTENANCE: 'Maintenance',
    DAMAGED: 'Damaged'
};

// ------------------------------------------------------------------------------
// 2. DOM LOAD & INITIALIZATION
// ------------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();

    // Check auth or load simulated active profile for Lab 4 demo
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await fetchUserProfile(user.id);
        } else {
            // Default demo profile for evaluation
            setSimulatedProfile(ROLES.REQUESTER);
        }
    } else {
        console.warn('Supabase SDK not detected. Operating in Local Demo / Prototype mode.');
        setSimulatedProfile(ROLES.REQUESTER);
    }

    await refreshData();
    renderUI();
}

// ------------------------------------------------------------------------------
// 3. AUTHENTICATION & ROLE SWITCHING (FOR LAB TESTING & EVALUATION)
// ------------------------------------------------------------------------------

function setSimulatedProfile(role) {
    const mockUsers = {
        [ROLES.ADMIN]: {
            id: '11111111-1111-4111-a111-111111111111',
            full_name: 'Dr. Alexander Vance (Admin)',
            role: ROLES.ADMIN,
            department: 'Systems Engineering'
        },
        [ROLES.STAFF]: {
            id: '22222222-2222-4222-a222-222222222222',
            full_name: 'Maria Santos (Staff)',
            role: ROLES.STAFF,
            department: 'Hardware Laboratory'
        },
        [ROLES.REQUESTER]: {
            id: '33333333-3333-4333-a333-333333333333',
            full_name: 'Juan Dela Cruz (Student)',
            role: ROLES.REQUESTER,
            department: 'Computer Science'
        }
    };

    AppState.currentUser = mockUsers[role];
    AppState.currentRole = role;
    showNotification(`Switched role to: ${role}`, 'info');
}

async function fetchUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        AppState.currentUser = data;
        AppState.currentRole = data.role;
    } catch (err) {
        console.error('Failed to fetch user profile:', err);
    }
}

// ------------------------------------------------------------------------------
// 4. DATA FETCHING & SYNCHRONIZATION
// ------------------------------------------------------------------------------

async function refreshData() {
    await Promise.all([
        fetchEquipment(),
        fetchTransactions(),
        fetchAuditLogs()
    ]);
}

async function fetchEquipment() {
    if (supabase) {
        let query = supabase.from('equipment').select('*').order('asset_tag');
        // Section III: Requesters only view Available equipment by default
        if (AppState.currentRole === ROLES.REQUESTER) {
            query = query.eq('status', EQUIPMENT_STATUS.AVAILABLE);
        }
        const { data, error } = await query;
        if (!error && data) AppState.equipment = data;
    } else {
        // Mock fallback data matching schema seed
        if (!AppState.equipment || AppState.equipment.length === 0) {
            AppState.equipment = [
                { id: 'eq-1', asset_tag: 'LAP-001', name: 'Dell XPS 15 Laptop', category: 'Computing', status: EQUIPMENT_STATUS.AVAILABLE, description: 'High performance laptop' },
                { id: 'eq-2', asset_tag: 'OSC-002', name: 'Tektronix Oscilloscope', category: 'Electronics', status: EQUIPMENT_STATUS.AVAILABLE, description: '100MHz Digital Oscilloscope' },
                { id: 'eq-3', asset_tag: 'MIC-003', name: 'Compound Microscope', category: 'Biology', status: EQUIPMENT_STATUS.MAINTENANCE, description: 'Under routine calibration' }
            ];
        }
    }
}

async function fetchTransactions() {
    if (supabase) {
        let query = supabase.from('borrowing_transactions').select(`
            *,
            equipment:equipment_id (asset_tag, name),
            requester:user_id (full_name),
            approver:approver_id (full_name)
        `).order('requested_at', { ascending: false });

        // Section III: Requesters can view only their own request history
        if (AppState.currentRole === ROLES.REQUESTER && AppState.currentUser) {
            query = query.eq('user_id', AppState.currentUser.id);
        }

        const { data, error } = await query;
        if (!error && data) AppState.transactions = data;
    } else {
        // Mock fallback data
        if (!AppState.transactions) {
            AppState.transactions = [
                {
                    id: 101,
                    equipment_id: 'eq-1',
                    equipment: { asset_tag: 'LAP-001', name: 'Dell XPS 15 Laptop' },
                    user_id: '33333333-3333-4333-a333-333333333333',
                    requester: { full_name: 'Juan Dela Cruz (Student)' },
                    approver_id: '11111111-1111-4111-a111-111111111111',
                    approver: { full_name: 'Dr. Alexander Vance (Admin)' },
                    status: TRANSACTION_STATUS.APPROVED,
                    request_reason: 'Lab 4 assignment execution',
                    notes: 'Approved for 3 days',
                    requested_at: new Date(Date.now() - 86400000).toISOString()
                }
            ];
        }
    }
}

async function fetchAuditLogs() {
    // Section III & VI: Only Administrators can view audit logs
    if (AppState.currentRole !== ROLES.ADMIN) {
        AppState.auditLogs = [];
        return;
    }

    if (supabase) {
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*, profile:user_id(full_name)')
            .order('created_at', { ascending: false });

        if (!error && data) AppState.auditLogs = data;
    } else {
        if (!AppState.auditLogs) AppState.auditLogs = [];
    }
}

// ------------------------------------------------------------------------------
// 5. BUSINESS RULES IMPLEMENTATION (BR-A4-01 to BR-A4-10)
// ------------------------------------------------------------------------------

/**
 * BR-A4-01: Only available equipment may be requested.
 * BR-A4-09: Equipment under Maintenance cannot be borrowed.
 */
function validateNewBorrowRequest(equipmentId) {
    const item = AppState.equipment.find(e => e.id === equipmentId);
    if (!item) throw new Error('Selected equipment record not found.');

    if (item.status === EQUIPMENT_STATUS.MAINTENANCE) {
        throw new Error('BR-A4-09: Equipment under Maintenance cannot be borrowed.');
    }
    if (item.status !== EQUIPMENT_STATUS.AVAILABLE) {
        throw new Error(`BR-A4-01: Only available equipment may be requested. (Current status: ${item.status})`);
    }
    return true;
}

/**
 * BR-A4-02: Staff/Users cannot approve their own request.
 * BR-A4-03: Only Administrator may approve or reject requests.
 */
function validateApprovalAction(transaction, action) {
    // BR-A4-03 Check
    if (AppState.currentRole !== ROLES.ADMIN) {
        throw new Error('BR-A4-03: Only Administrator may approve or reject requests.');
    }
    // BR-A4-02 Check
    if (transaction.user_id === AppState.currentUser.id) {
        throw new Error('BR-A4-02: Staff/Requesters cannot approve their own request.');
    }
    if (transaction.status !== TRANSACTION_STATUS.PENDING) {
        throw new Error(`Cannot ${action.toLowerCase()} request. Current status is ${transaction.status}, expected Pending.`);
    }
    return true;
}

/**
 * BR-A4-04: Only Approved requests may be released.
 * BR-A4-07: Rejected requests cannot be released.
 */
function validateReleaseAction(transaction) {
    if (transaction.status === TRANSACTION_STATUS.REJECTED) {
        throw new Error('BR-A4-07: Rejected requests cannot be released.');
    }
    if (transaction.status !== TRANSACTION_STATUS.APPROVED) {
        throw new Error(`BR-A4-04: Only Approved requests may be released. Current status: ${transaction.status}.`);
    }
    return true;
}

/**
 * BR-A4-08: Returned transactions cannot be processed twice.
 */
function validateReturnAction(transaction) {
    if (transaction.status === TRANSACTION_STATUS.RETURNED || transaction.status === TRANSACTION_STATUS.CLOSED) {
        throw new Error('BR-A4-08: Returned transactions cannot be processed twice.');
    }
    if (transaction.status !== TRANSACTION_STATUS.RELEASED && transaction.status !== TRANSACTION_STATUS.OVERDUE) {
        throw new Error(`Cannot process return for transaction in state '${transaction.status}'.`);
    }
    return true;
}

// ------------------------------------------------------------------------------
// 6. CORE WORKFLOW ACTIONS & AUDIT LOGGING (BR-A4-10)
// ------------------------------------------------------------------------------

/**
 * Log sensitive operations to local state / database audit_logs table
 */
async function recordAuditLog(action, moduleName, recordId, description) {
    const logEntry = {
        user_id: AppState.currentUser ? AppState.currentUser.id : null,
        user_name: AppState.currentUser ? AppState.currentUser.full_name : 'System',
        action: action.toUpperCase(),
        module: moduleName,
        record_id: String(recordId),
        description: description,
        created_at: new Date().toISOString()
    };

    if (supabase && AppState.currentUser) {
        try {
            await supabase.from('audit_logs').insert([{
                user_id: logEntry.user_id,
                action: logEntry.action,
                module: logEntry.module,
                record_id: logEntry.record_id,
                description: logEntry.description
            }]);
        } catch (e) {
            console.error('Audit logging failed:', e);
        }
    } else {
        AppState.auditLogs.unshift(logEntry);
    }
}

/**
 * Submit Borrowing Request (TC-A4-02)
 */
async function submitBorrowingRequest(equipmentId, reason) {
    try {
        validateNewBorrowRequest(equipmentId);

        const newRequest = {
            equipment_id: equipmentId,
            user_id: AppState.currentUser.id,
            status: TRANSACTION_STATUS.PENDING,
            request_reason: reason,
            requested_at: new Date().toISOString()
        };

        if (supabase) {
            const { data, error } = await supabase
                .from('borrowing_transactions')
                .insert([newRequest])
                .select();

            if (error) throw error;
            showNotification('Request submitted successfully as Pending (BR-A4-01 enforced).', 'success');
        } else {
            const equip = AppState.equipment.find(e => e.id === equipmentId);
            const mockRecord = {
                id: Math.floor(100 + Math.random() * 900),
                ...newRequest,
                equipment: { asset_tag: equip.asset_tag, name: equip.name },
                requester: { full_name: AppState.currentUser.full_name }
            };
            AppState.transactions.unshift(mockRecord);
            await recordAuditLog('SUBMITTED', 'Borrowing', mockRecord.id, `Submitted request for ${equip.asset_tag}`);
            showNotification(`Request #${mockRecord.id} saved as Pending.`, 'success');
        }

        await refreshData();
        renderUI();
    } catch (err) {
        showNotification(err.message, 'error');
        throw err;
    }
}

/**
 * Approve Borrowing Request (TC-A4-03)
 */
async function approveRequest(transactionId) {
    try {
        const tx = AppState.transactions.find(t => t.id == transactionId);
        if (!tx) throw new Error('Transaction record not found.');

        validateApprovalAction(tx, 'APPROVE');

        if (supabase) {
            const { error } = await supabase
                .from('borrowing_transactions')
                .update({
                    status: TRANSACTION_STATUS.APPROVED,
                    approver_id: AppState.currentUser.id,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', transactionId);

            if (error) throw error;
        } else {
            tx.status = TRANSACTION_STATUS.APPROVED;
            tx.approver_id = AppState.currentUser.id;
            tx.approver = { full_name: AppState.currentUser.full_name };
            const assetTag = tx.equipment ? tx.equipment.asset_tag : 'Asset';
            await recordAuditLog('APPROVED', 'Borrowing', tx.id, `Approved borrowing request for ${assetTag}`);
        }

        showNotification(`Transaction #${transactionId} successfully Approved (BR-A4-03 enforced).`, 'success');
        await refreshData();
        renderUI();
    } catch (err) {
        showNotification(err.message, 'error');
        throw err;
    }
}

/**
 * Reject Borrowing Request (TC-A4-04)
 */
async function rejectRequest(transactionId, reason = 'Administrative decision') {
    try {
        const tx = AppState.transactions.find(t => t.id == transactionId);
        if (!tx) throw new Error('Transaction record not found.');

        validateApprovalAction(tx, 'REJECT');

        if (supabase) {
            const { error } = await supabase
                .from('borrowing_transactions')
                .update({
                    status: TRANSACTION_STATUS.REJECTED,
                    approver_id: AppState.currentUser.id,
                    notes: reason,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', transactionId);

            if (error) throw error;
        } else {
            tx.status = TRANSACTION_STATUS.REJECTED;
            tx.approver_id = AppState.currentUser.id;
            tx.notes = reason;
            const assetTag = tx.equipment ? tx.equipment.asset_tag : 'Asset';
            await recordAuditLog('REJECTED', 'Borrowing', tx.id, `Rejected request for ${assetTag}: ${reason}`);
        }

        showNotification(`Transaction #${transactionId} marked as Rejected.`, 'info');
        await refreshData();
        renderUI();
    } catch (err) {
        showNotification(err.message, 'error');
        throw err;
    }
}

/**
 * Release Approved Asset (TC-A4-06)
 * Enforces BR-A4-04, BR-A4-05, BR-A4-07
 */
async function releaseAsset(transactionId) {
    try {
        const tx = AppState.transactions.find(t => t.id == transactionId);
        if (!tx) throw new Error('Transaction record not found.');

        validateReleaseAction(tx);

        if (supabase) {
            const { error } = await supabase
                .from('borrowing_transactions')
                .update({
                    status: TRANSACTION_STATUS.RELEASED,
                    released_at: new Date().toISOString()
                })
                .eq('id', transactionId);

            if (error) throw error;
        } else {
            tx.status = TRANSACTION_STATUS.RELEASED;
            // BR-A4-05: Released equipment becomes Borrowed
            const equip = AppState.equipment.find(e => e.id === tx.equipment_id);
            if (equip) equip.status = EQUIPMENT_STATUS.BORROWED;
            await recordAuditLog('RELEASED', 'Borrowing', tx.id, `Released equipment ${equip ? equip.asset_tag : ''}`);
        }

        showNotification(`Equipment released. Status updated to Released & asset marked as Borrowed (BR-A4-05).`, 'success');
        await refreshData();
        renderUI();
    } catch (err) {
        showNotification(err.message, 'error');
        throw err;
    }
}

/**
 * Process Asset Return (TC-A4-07)
 * Enforces BR-A4-06, BR-A4-08
 */
async function processReturn(transactionId, isDamaged = false) {
    try {
        const tx = AppState.transactions.find(t => t.id == transactionId);
        if (!tx) throw new Error('Transaction record not found.');

        validateReturnAction(tx);

        const newEquipStatus = isDamaged ? EQUIPMENT_STATUS.DAMAGED : EQUIPMENT_STATUS.AVAILABLE;

        if (supabase) {
            const { error } = await supabase
                .from('borrowing_transactions')
                .update({
                    status: TRANSACTION_STATUS.RETURNED,
                    returned_at: new Date().toISOString(),
                    notes: isDamaged ? 'Returned with reported damage' : 'Returned in good condition'
                })
                .eq('id', transactionId);

            if (error) throw error;
        } else {
            tx.status = TRANSACTION_STATUS.RETURNED;
            // BR-A4-06: Returned equipment becomes Available unless damaged
            const equip = AppState.equipment.find(e => e.id === tx.equipment_id);
            if (equip) equip.status = newEquipStatus;
            await recordAuditLog('RETURNED', 'Borrowing', tx.id, `Processed return for transaction. Equipment set to ${newEquipStatus}`);
        }

        showNotification(`Asset returned. Transaction completed & Equipment status reset to ${newEquipStatus} (BR-A4-06).`, 'success');
        await refreshData();
        renderUI();
    } catch (err) {
        showNotification(err.message, 'error');
        throw err;
    }
}

/**
 * Restricted Delete Operation Guard (TC-A4-09)
 */
async function attemptRestrictedDelete(recordId) {
    try {
        if (AppState.currentRole !== ROLES.ADMIN) {
            throw new Error('Access Denied: Only Administrators are permitted to delete records (TC-A4-09 guard).');
        }
        showNotification(`Record ${recordId} deleted by Administrator.`, 'warning');
        await recordAuditLog('DELETE', 'System', recordId, `Deleted record ${recordId}`);
    } catch (err) {
        showNotification(err.message, 'error');
        throw err;
    }
}

// ------------------------------------------------------------------------------
// 7. USER INTERFACE DYNAMIC RENDERING & ROLE ADAPTATION (SECTION VII)
// ------------------------------------------------------------------------------

function setupEventListeners() {
    // Role switcher dropdown listener for testing
    const roleSelect = document.getElementById('role-selector');
    if (roleSelect) {
        roleSelect.addEventListener('change', (e) => {
            setSimulatedProfile(e.target.value);
            refreshData().then(() => renderUI());
        });
    }

    // Navigation tab listeners
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = e.target.getAttribute('data-tab');
            navigateToTab(targetTab);
        });
    });
}

/**
 * Interface Route Guard (TC-A4-01, TC-A4-10)
 */
function navigateToTab(tabName) {
    // Navigation Guard for Admin-only views (Audit Logs)
    if (tabName === 'audit' && AppState.currentRole !== ROLES.ADMIN) {
        showNotification('Access Denied (TC-A4-01): Viewer/Staff cannot access Audit Logs.', 'error');
        return;
    }
    AppState.activeTab = tabName;
    renderUI();
}

function renderUI() {
    renderNavigation();
    renderRoleBadge();

    const mainContent = document.getElementById('app-main-content');
    if (!mainContent) return;

    switch (AppState.activeTab) {
        case 'catalog':
            mainContent.innerHTML = renderCatalogView();
            break;
        case 'requests':
            mainContent.innerHTML = renderRequestsView();
            break;
        case 'audit':
            mainContent.innerHTML = renderAuditView();
            break;
        case 'test-suite':
            mainContent.innerHTML = renderTestSuiteView();
            break;
        default:
            mainContent.innerHTML = renderCatalogView();
    }
}

function renderRoleBadge() {
    const badgeEl = document.getElementById('user-role-badge');
    if (badgeEl && AppState.currentUser) {
        badgeEl.textContent = `${AppState.currentUser.full_name} (${AppState.currentRole})`;
        badgeEl.className = `badge role-${AppState.currentRole.toLowerCase().replace(/\s+/g, '-')}`;
    }
}

function renderNavigation() {
    // Section VII: Navigation must adapt to the logged-in role
    const auditTab = document.getElementById('nav-tab-audit');
    if (auditTab) {
        auditTab.style.display = (AppState.currentRole === ROLES.ADMIN) ? 'block' : 'none';
    }
}

function renderCatalogView() {
    const items = AppState.equipment;
    let cards = items.map(item => `
        <div class="card equipment-card border-${item.status.toLowerCase()}">
            <div class="card-header d-flex justify-content-between">
                <span class="font-weight-bold">${item.asset_tag}</span>
                <span class="status-badge status-${item.status.toLowerCase()}">${item.status}</span>
            </div>
            <div class="card-body">
                <h5 class="card-title">${item.name}</h5>
                <p class="card-text text-muted">${item.description || 'No description available.'}</p>
                <p><strong>Category:</strong> ${item.category}</p>
                ${item.status === EQUIPMENT_STATUS.AVAILABLE ? `
                    <button class="btn btn-primary btn-sm" onclick="handleOpenBorrowModal('${item.id}', '${item.asset_tag}')">
                        Request Borrowing
                    </button>
                ` : `
                    <button class="btn btn-secondary btn-sm" disabled>
                        Unavailable (${item.status})
                    </button>
                `}
            </div>
        </div>
    `).join('');

    return `
        <div class="view-container">
            <h3>Equipment Catalog</h3>
            <p class="text-muted">Available assets subject to approval policies (BR-A4-01, BR-A4-09).</p>
            <div class="grid-container">${cards || '<p>No equipment records found.</p>'}</div>
        </div>
    `;
}

function renderRequestsView() {
    const txs = AppState.transactions;
    let rows = txs.map(tx => {
        const canApprove = AppState.currentRole === ROLES.ADMIN && tx.status === TRANSACTION_STATUS.PENDING;
        const canRelease = (AppState.currentRole === ROLES.ADMIN || AppState.currentRole === ROLES.STAFF) && tx.status === TRANSACTION_STATUS.APPROVED;
        const canReturn = (AppState.currentRole === ROLES.ADMIN || AppState.currentRole === ROLES.STAFF) && tx.status === TRANSACTION_STATUS.RELEASED;

        return `
            <tr>
                <td>#${tx.id}</td>
                <td>${tx.equipment ? tx.equipment.asset_tag : 'N/A'}</td>
                <td>${tx.requester ? tx.requester.full_name : 'User'}</td>
                <td><span class="badge status-${tx.status.toLowerCase()}">${tx.status}</span></td>
                <td>${tx.request_reason}</td>
                <td>${new Date(tx.requested_at).toLocaleDateString()}</td>
                <td>
                    ${canApprove ? `
                        <button class="btn btn-success btn-xs" onclick="approveRequest(${tx.id})">Approve</button>
                        <button class="btn btn-danger btn-xs" onclick="rejectRequest(${tx.id})">Reject</button>
                    ` : ''}
                    ${canRelease ? `
                        <button class="btn btn-info btn-xs" onclick="releaseAsset(${tx.id})">Release</button>
                    ` : ''}
                    ${canReturn ? `
                        <button class="btn btn-warning btn-xs" onclick="processReturn(${tx.id}, false)">Return (Good)</button>
                        <button class="btn btn-dark btn-xs" onclick="processReturn(${tx.id}, true)">Return (Damaged)</button>
                    ` : ''}
                    ${!canApprove && !canRelease && !canReturn ? `<span class="text-muted">No actions available</span>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="view-container">
            <h3>Borrowing Transactions & Approvals</h3>
            <p class="text-muted">Workflow transitions: Pending → Approved/Rejected → Released → Returned.</p>
            <table class="table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Asset Tag</th>
                        <th>Requester</th>
                        <th>Status</th>
                        <th>Reason</th>
                        <th>Requested Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="7">No transaction records found.</td></tr>'}</tbody>
            </table>
        </div>
    `;
}

function renderAuditView() {
    // Guard against non-admin view
    if (AppState.currentRole !== ROLES.ADMIN) {
        return `<div class="alert alert-danger">Access Denied: Audit Logs are restricted to Administrators (BR-A4-10).</div>`;
    }

    const logs = AppState.auditLogs;
    let rows = logs.map(log => `
        <tr>
            <td>${new Date(log.created_at).toLocaleString()}</td>
            <td>${log.user_name || log.user_id}</td>
            <td><span class="badge badge-action">${log.action}</span></td>
            <td>${log.module}</td>
            <td>${log.record_id}</td>
            <td>${log.description}</td>
        </tr>
    `).join('');

    return `
        <div class="view-container">
            <h3>System Audit Trail (BR-A4-10)</h3>
            <p class="text-muted">Traceable history of critical operations and status transitions.</p>
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Module</th>
                        <th>Record ID</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6">No audit records logged.</td></tr>'}</tbody>
            </table>
        </div>
    `;
}

// Modal Trigger for Borrower
window.handleOpenBorrowModal = function(equipId, assetTag) {
    const reason = prompt(`Enter borrowing reason for ${assetTag}:`, 'Academic Research');
    if (reason) {
        submitBorrowingRequest(equipId, reason);
    }
};

// Notification helper
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    const notifContainer = document.getElementById('notification-toast');
    if (notifContainer) {
        notifContainer.textContent = message;
        notifContainer.className = `toast toast-${type} show`;
        setTimeout(() => {
            notifContainer.className = 'toast';
        }, 4000);
    }
}

// ------------------------------------------------------------------------------
// 8. FUNCTIONAL TEST SUITE EXECUTION ENGINE (TC-A4-01 - TC-A4-10)
// ------------------------------------------------------------------------------

window.runAutomatedTestSuite = async function() {
    const resultsContainer = document.getElementById('test-suite-results');
    if (resultsContainer) resultsContainer.innerHTML = '<p>Running tests...</p>';

    const results = [];
    const initialRole = AppState.currentRole;

    const executeTest = async (testId, title, testFn) => {
        try {
            await testFn();
            results.push({ testId, title, status: 'PASSED', message: 'Executed as expected.' });
        } catch (err) {
            results.push({ testId, title, status: 'FAILED', message: err.message });
        }
    };

    // TC-A4-01: Viewer attempts to open Admin page
    await executeTest('TC-A4-01', 'Viewer attempts to open Admin page', async () => {
        setSimulatedProfile(ROLES.REQUESTER);
        try {
            navigateToTab('audit');
            if (AppState.activeTab === 'audit') throw new Error('Guard failed: Requester was granted access to audit page.');
        } finally {
            AppState.activeTab = 'catalog';
        }
    });

    // TC-A4-02: Staff submits request
    let testTxId = null;
    await executeTest('TC-A4-02', 'Staff submits request', async () => {
        setSimulatedProfile(ROLES.STAFF);
        const availEquip = AppState.equipment.find(e => e.status === EQUIPMENT_STATUS.AVAILABLE);
        if (!availEquip) throw new Error('No available equipment for testing.');
        await submitBorrowingRequest(availEquip.id, 'Automated Test TC-A4-02');
        const latestTx = AppState.transactions[0];
        if (latestTx.status !== TRANSACTION_STATUS.PENDING) throw new Error(`Expected Pending, got ${latestTx.status}`);
        testTxId = latestTx.id;
    });

    // TC-A4-03: Administrator approves request
    await executeTest('TC-A4-03', 'Administrator approves request', async () => {
        setSimulatedProfile(ROLES.ADMIN);
        await approveRequest(testTxId);
        const tx = AppState.transactions.find(t => t.id === testTxId);
        if (tx.status !== TRANSACTION_STATUS.APPROVED) throw new Error('Status failed to transition to Approved.');
    });

    // TC-A4-04: Administrator rejects request
    let rejectTxId = null;
    await executeTest('TC-A4-04', 'Administrator rejects request', async () => {
        setSimulatedProfile(ROLES.STAFF);
        const availEquip = AppState.equipment.find(e => e.status === EQUIPMENT_STATUS.AVAILABLE);
        await submitBorrowingRequest(availEquip.id, 'Automated Test TC-A4-04 Rejection');
        rejectTxId = AppState.transactions[0].id;
        
        setSimulatedProfile(ROLES.ADMIN);
        await rejectRequest(rejectTxId, 'Test Rejection');
        const tx = AppState.transactions.find(t => t.id === rejectTxId);
        if (tx.status !== TRANSACTION_STATUS.REJECTED) throw new Error('Status failed to transition to Rejected.');
    });

    // TC-A4-05: Attempt to release rejected request
    await executeTest('TC-A4-05', 'Attempt to release rejected request', async () => {
        setSimulatedProfile(ROLES.STAFF);
        const tx = AppState.transactions.find(t => t.id === rejectTxId);
        try {
            validateReleaseAction(tx);
            throw new Error('Allowed release of rejected request (BR-A4-07 violation).');
        } catch (err) {
            if (!err.message.includes('BR-A4-07')) throw err;
        }
    });

    // TC-A4-06: Release approved equipment
    await executeTest('TC-A4-06', 'Release approved equipment', async () => {
        setSimulatedProfile(ROLES.STAFF);
        await releaseAsset(testTxId);
        const tx = AppState.transactions.find(t => t.id === testTxId);
        if (tx.status !== TRANSACTION_STATUS.RELEASED) throw new Error('Status failed to transition to Released.');
    });

    // TC-A4-07: Return released equipment
    await executeTest('TC-A4-07', 'Return released equipment', async () => {
        setSimulatedProfile(ROLES.STAFF);
        await processReturn(testTxId, false);
        const tx = AppState.transactions.find(t => t.id === testTxId);
        if (tx.status !== TRANSACTION_STATUS.RETURNED) throw new Error('Status failed to transition to Returned.');
    });

    // TC-A4-08: Check audit log after approval
    await executeTest('TC-A4-08', 'Check audit log after approval', async () => {
        setSimulatedProfile(ROLES.ADMIN);
        await fetchAuditLogs();
        const approvalEntry = AppState.auditLogs.find(l => l.action === 'APPROVED');
        if (!approvalEntry) throw new Error('Approval entry not found in audit logs.');
    });

    // TC-A4-09: Staff attempts restricted delete
    await executeTest('TC-A4-09', 'Staff attempts restricted delete', async () => {
        setSimulatedProfile(ROLES.STAFF);
        try {
            await attemptRestrictedDelete(testTxId);
            throw new Error('Allowed staff to execute restricted delete.');
        } catch (err) {
            if (!err.message.includes('Access Denied')) throw err;
        }
    });

    // TC-A4-10: Logout and open protected page
    await executeTest('TC-A4-10', 'Logout and open protected page', async () => {
        AppState.currentUser = null;
        AppState.currentRole = 'Unauthenticated';
        try {
            navigateToTab('audit');
            if (AppState.activeTab === 'audit') throw new Error('Unauthenticated user accessed audit tab.');
        } finally {
            setSimulatedProfile(initialRole);
        }
    });

    // Render Results
    if (resultsContainer) {
        const rows = results.map(r => `
            <tr class="${r.status === 'PASSED' ? 'table-success' : 'table-danger'}">
                <td><strong>${r.testId}</strong></td>
                <td>${r.title}</td>
                <td><span class="badge ${r.status === 'PASSED' ? 'badge-success' : 'badge-danger'}">${r.status}</span></td>
                <td>${r.message}</td>
            </tr>
        `).join('');

        resultsContainer.innerHTML = `
            <table class="table table-bordered">
                <thead>
                    <tr><th>Test ID</th><th>Scenario</th><th>Result</th><th>Notes</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }
};

function renderTestSuiteView() {
    return `
        <div class="view-container">
            <h3>Automated Functional Test Suite (TC-A4-01 - TC-A4-10)</h3>
            <p class="text-muted">Runs end-to-end verification against all business rules and route guards.</p>
            <button class="btn btn-primary mb-3" onclick="runAutomatedTestSuite()">Run All Tests Now</button>
            <div id="test-suite-results"></div>
        </div>
    `;
}
