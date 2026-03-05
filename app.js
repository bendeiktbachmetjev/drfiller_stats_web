/**
 * Dr.Filler Admin Dashboard — App Logic
 * Vanilla JS, no dependencies.
 * Fetches data from /api/admin/* endpoints and renders stats, charts, and tables.
 */

(function () {
    'use strict';

    // ===========================
    // State
    // ===========================
    let serverUrl = 'https://web-production-d4666.up.railway.app';
    let statsData = null;
    let usersData = [];
    let logsData = [];
    let usersSort = { col: 'lastSignIn', dir: 'desc', type: 'date' };
    let logsSort = { col: 'timestamp', dir: 'desc', type: 'date' };

    // ===========================
    // DOM Elements
    // ===========================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ===========================
    // Initialize
    // ===========================
    // Immediately show the dashboard and fetch data
    $('#dashboard-screen').style.display = 'block';
    loadAllData();

    // ===========================
    // Logout (Hidden/Removed)
    // ===========================
    if ($('#logout-btn')) {
        $('#logout-btn').style.display = 'none';
    }

    // ===========================
    // UI Event Listeners
    // ===========================
    $('#refresh-btn').addEventListener('click', () => loadAllData());

    // Tabs
    $$('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            $$('.tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            $('#tab-users').style.display = target === 'users' ? 'block' : 'none';
            $('#tab-logs').style.display = target === 'logs' ? 'block' : 'none';
        });
    });

    // User search
    $('#user-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        renderUsersTable(usersData.filter((u) =>
            (u.email || '').toLowerCase().includes(query) ||
            (u.uid || '').toLowerCase().includes(query)
        ));
    });

    // Global Date Filters
    $('#global-date-preset').addEventListener('change', (e) => {
        const isCustom = e.target.value === 'custom';
        $('#custom-date-inputs').style.display = isCustom ? 'flex' : 'none';
        if (!isCustom) loadAllData();
    });
    $('#apply-global-dates').addEventListener('click', () => loadAllData());

    // Log filters
    $('#apply-log-filters').addEventListener('click', () => loadLogs());

    // Chart filters
    $('#chart-type-filter').addEventListener('change', (e) => {
        if (statsData?.chartBreakdown) {
            renderChart(statsData.chartBreakdown, e.target.value);
        }
    });

    // Table Sorting
    $$('th.sortable').forEach((th) => {
        th.addEventListener('click', () => {
            const table = th.closest('table');
            const isUsers = table.id === 'users-table';
            const sortState = isUsers ? usersSort : logsSort;
            const col = th.dataset.sort;
            const type = th.dataset.type;

            if (sortState.col === col) {
                sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.col = col;
                sortState.dir = 'desc';
                sortState.type = type;
            }

            // Update headers UI
            const tr = th.closest('tr');
            tr.querySelectorAll('th.sortable').forEach(t => {
                t.innerHTML = t.innerHTML.replace(' ↓', ' ↕').replace(' ↑', ' ↕');
                t.classList.remove('sorted-asc', 'sorted-desc');
            });
            th.classList.add(`sorted-${sortState.dir}`);
            th.innerHTML = th.innerHTML.replace(' ↕', sortState.dir === 'asc' ? ' ↑' : ' ↓');

            // Re-render table with sorted data
            if (isUsers) renderUsersTable(usersData);
            else renderLogsTable(logsData);
        });
    });

    function sortData(data, sortState) {
        if (!data || data.length === 0) return data;
        const { col, dir, type } = sortState;

        return [...data].sort((a, b) => {
            let valA = a[col];
            let valB = b[col];

            if (valA === valB) return 0;
            if (valA === undefined || valA === null) return dir === 'asc' ? 1 : -1;
            if (valB === undefined || valB === null) return dir === 'asc' ? -1 : 1;

            if (type === 'string') {
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            } else if (type === 'date') {
                valA = new Date(valA).getTime() || 0;
                valB = new Date(valB).getTime() || 0;
            }

            if (valA < valB) return dir === 'asc' ? -1 : 1;
            if (valA > valB) return dir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // ===========================
    // Initialize
    // ===========================
    // Immediately show the dashboard and fetch data
    $('#dashboard-screen').style.display = 'block';
    loadAllData();

    // ===========================
    // API Helper
    // ===========================
    async function apiFetch(path, params = {}) {
        const url = new URL(serverUrl + path);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') {
                url.searchParams.set(k, v);
            }
        });

        const res = await fetch(url.toString());
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    // ===========================
    // Data Loading
    // ===========================
    function getGlobalDateRange() {
        const preset = $('#global-date-preset').value;
        let startDate = null;
        let endDate = null;

        const now = new Date();

        if (preset === 'custom') {
            const startVal = $('#global-start-date').value;
            const endVal = $('#global-end-date').value;
            startDate = startVal ? new Date(startVal).toISOString() : null;
            if (endVal) {
                const endD = new Date(endVal);
                endD.setHours(23, 59, 59, 999);
                endDate = endD.toISOString();
            }
        } else if (preset === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (preset === '7d') {
            const d = new Date();
            d.setDate(d.getDate() - 6);
            d.setHours(0, 0, 0, 0);
            startDate = d.toISOString();
        } else if (preset === '30d') {
            const d = new Date();
            d.setDate(d.getDate() - 29);
            d.setHours(0, 0, 0, 0);
            startDate = d.toISOString();
        } else if (preset === '6m') {
            const d = new Date();
            d.setMonth(d.getMonth() - 6);
            d.setHours(0, 0, 0, 0);
            startDate = d.toISOString();
        } else if (preset === '1y') {
            const d = new Date();
            d.setFullYear(d.getFullYear() - 1);
            d.setHours(0, 0, 0, 0);
            startDate = d.toISOString();
        } else if (preset === 'all') {
            startDate = new Date(2020, 0, 1).toISOString(); // Arbitrary old date
        }

        return { startDate, endDate };
    }

    async function loadAllData() {
        $('#last-updated').textContent = 'Loading...';
        try {
            await Promise.all([loadUsers(), loadLogs()]); // load users first so stats can use it
            await loadStats();
            $('#last-updated').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        } catch (err) {
            console.error('Failed to load data:', err);
        }
    }

    async function loadStats() {
        try {
            const { startDate, endDate } = getGlobalDateRange();
            const res = await apiFetch('/api/admin/stats', { startDate, endDate });
            statsData = res.data;
            renderStats(statsData);

            // If usersData is already loaded, calculate new users
            if (usersData && usersData.length > 0 && statsData.chartBreakdown) {
                statsData.chartBreakdown.forEach((bucket, i) => {
                    const bStart = new Date(bucket.date).getTime();
                    const bEnd = i < statsData.chartBreakdown.length - 1
                        ? new Date(statsData.chartBreakdown[i + 1].date).getTime()
                        : Date.now();

                    bucket.newUsers = usersData.filter(u => {
                        if (!u.createdAt) return false;
                        const t = new Date(u.createdAt).getTime();
                        return t >= bStart && t < bEnd;
                    }).length;
                });
            }

            renderChart(statsData.chartBreakdown || [], $('#chart-type-filter').value);
        } catch (err) {
            console.error('Stats error:', err);
        }
    }

    async function loadUsers() {
        try {
            const res = await apiFetch('/api/admin/users');
            usersData = res.data || [];
            renderUsersTable(usersData);
        } catch (err) {
            console.error('Users error:', err);
        }
    }

    async function loadLogs() {
        try {
            const action = $('#log-action-filter').value;
            const limit = $('#log-limit').value;
            const { startDate, endDate } = getGlobalDateRange();

            const res = await apiFetch('/api/admin/logs', { action, limit, startDate, endDate });
            logsData = res.data || [];
            renderLogsTable(logsData);
        } catch (err) {
            console.error('Logs error:', err);
        }
    }

    // ===========================
    // Render Stats
    // ===========================
    function renderStats(data) {
        if (!data) return;
        $('#stat-users').textContent = formatNumber(data.totalRegisteredUsers || 0);
        $('#stat-requests-today').textContent = formatNumber(data.today?.totalRequests || 0);
        $('#stat-transcriptions').textContent = formatNumber(data.overall?.totalTranscriptions || 0);
        $('#stat-ai-processing').textContent = formatNumber(data.overall?.totalAiProcessing || 0);
        $('#stat-tokens').textContent = formatTokens(data.overall?.totalTokensUsed || 0);
        $('#stat-active-today').textContent = formatNumber(data.today?.uniqueUsers || 0);
    }

    // ===========================
    // Render Chart (Canvas)
    // ===========================
    function renderChart(daily, typeFilter = 'all') {
        const canvas = $('#activity-chart');
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;

        // Set canvas size
        const dpr = window.devicePixelRatio || 1;
        canvas.width = container.clientWidth * dpr;
        canvas.height = container.clientHeight * dpr;
        ctx.scale(dpr, dpr);
        const W = container.clientWidth;
        const H = container.clientHeight;

        // Clear
        ctx.clearRect(0, 0, W, H);

        if (!daily || daily.length === 0) {
            ctx.fillStyle = '#6b7194';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data yet', W / 2, H / 2);
            return;
        }

        const padding = { top: 20, right: 20, bottom: 50, left: 50 };
        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;

        // Determine max value taking filter into account
        const maxVal = Math.max(...daily.map((d) => {
            if (typeFilter === 'transcription') return d.transcriptions;
            if (typeFilter === 'ai_processing') return d.aiProcessing;
            if (typeFilter === 'active_users') return d.uniqueUsers || 0;
            if (typeFilter === 'new_users') return d.newUsers || 0;
            return d.totalRequests;
        }), 1);

        const barWidth = Math.min(chartW / daily.length * 0.6, 50);
        const gap = chartW / daily.length;

        // Grid lines
        ctx.strokeStyle = '#2d3148';
        ctx.lineWidth = 1;
        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = padding.top + (chartH / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(W - padding.right, y);
            ctx.stroke();

            // Grid labels
            const val = Math.round(maxVal - (maxVal / gridLines) * i);
            ctx.fillStyle = '#6b7194';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(val.toString(), padding.left - 8, y + 4);
        }

        // Bars
        daily.forEach((d, i) => {
            const x = padding.left + gap * i + (gap - barWidth) / 2;
            let totalH = 0;

            if (typeFilter === 'active_users' || typeFilter === 'new_users') {
                const val = (typeFilter === 'active_users') ? (d.uniqueUsers || 0) : (d.newUsers || 0);
                const barColor = (typeFilter === 'active_users') ? ['#10b981', '#059669'] : ['#f59e0b', '#d97706'];
                totalH = (val / maxVal) * chartH;

                if (totalH > 0) {
                    const gradient = ctx.createLinearGradient(x, padding.top + chartH - totalH, x, padding.top + chartH);
                    gradient.addColorStop(0, barColor[0]);
                    gradient.addColorStop(1, barColor[1]);
                    ctx.fillStyle = gradient;
                    roundedRect(ctx, x, padding.top + chartH - totalH, barWidth, totalH, 4);
                    ctx.fill();
                }
            } else {
                const transcH = (typeFilter === 'all' || typeFilter === 'transcription')
                    ? (d.transcriptions / maxVal) * chartH : 0;
                const aiH = (typeFilter === 'all' || typeFilter === 'ai_processing')
                    ? (d.aiProcessing / maxVal) * chartH : 0;
                totalH = transcH + aiH;

                // AI Processing (purple, stacked on top)
                if (aiH > 0) {
                    const gradient = ctx.createLinearGradient(x, padding.top + chartH - transcH - aiH, x, padding.top + chartH - transcH);
                    gradient.addColorStop(0, '#a855f7');
                    gradient.addColorStop(1, '#7c3aed');
                    ctx.fillStyle = gradient;
                    roundedRect(ctx, x, padding.top + chartH - transcH - aiH, barWidth, aiH, 4);
                    ctx.fill();
                }

                // Transcription (blue, bottom)
                if (transcH > 0) {
                    const gradient = ctx.createLinearGradient(x, padding.top + chartH - transcH, x, padding.top + chartH);
                    gradient.addColorStop(0, '#3b82f6');
                    gradient.addColorStop(1, '#2563eb');
                    ctx.fillStyle = gradient;
                    roundedRect(ctx, x, padding.top + chartH - transcH, barWidth, transcH, 4);
                    ctx.fill();
                }
            }

            // Label (MM-DD or HH:mm)
            ctx.fillStyle = '#6b7194';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'center';
            if (gap >= 30 || i % Math.ceil(30 / gap) === 0) {
                ctx.fillText(d.label, x + barWidth / 2, padding.top + chartH + 20);
            }

            // Count on top of bar
            const displayTotal = (typeFilter === 'transcription') ? d.transcriptions :
                (typeFilter === 'ai_processing') ? d.aiProcessing :
                    (typeFilter === 'active_users') ? d.uniqueUsers :
                        (typeFilter === 'new_users') ? d.newUsers :
                            d.totalRequests;

            if (displayTotal > 0 && barWidth > 15) {
                ctx.fillStyle = '#9ba1b7';
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(displayTotal.toString(), x + barWidth / 2, padding.top + chartH - totalH - 6);
            }
        });

        // Legend
        const legendY = H - 12;
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'left';

        if (typeFilter === 'active_users') {
            ctx.fillStyle = '#10b981';
            ctx.fillRect(W / 2 - 45, legendY - 8, 10, 10);
            ctx.fillStyle = '#9ba1b7';
            ctx.fillText('Active Users', W / 2 - 31, legendY);
        } else if (typeFilter === 'new_users') {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(W / 2 - 65, legendY - 8, 10, 10);
            ctx.fillStyle = '#9ba1b7';
            ctx.fillText('New Registered Users', W / 2 - 51, legendY);
        } else {
            if (typeFilter === 'all' || typeFilter === 'transcription') {
                ctx.fillStyle = '#3b82f6';
                ctx.fillRect(W / 2 - 100, legendY - 8, 10, 10);
                ctx.fillStyle = '#9ba1b7';
                ctx.fillText('Transcription', W / 2 - 86, legendY);
            }

            if (typeFilter === 'all' || typeFilter === 'ai_processing') {
                const xOffset = (typeFilter === 'all') ? 10 : -100;
                ctx.fillStyle = '#a855f7';
                ctx.fillRect(W / 2 + xOffset, legendY - 8, 10, 10);
                ctx.fillStyle = '#9ba1b7';
                ctx.fillText('AI Processing', W / 2 + xOffset + 14, legendY);
            }
        }
    }

    function roundedRect(ctx, x, y, w, h, r) {
        if (h < r * 2) r = h / 2;
        if (w < r * 2) r = w / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, 0);
        ctx.arcTo(x, y + h, x, y, 0);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // Redraw chart on resize
    window.addEventListener('resize', () => {
        if (statsData && statsData.dailyBreakdown) {
            renderChart(statsData.dailyBreakdown);
        }
    });

    // ===========================
    // Render Users Table
    // ===========================
    function renderUsersTable(users) {
        const tbody = $('#users-tbody');
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No users found</td></tr>';
            return;
        }

        const sortedUsers = sortData(users, usersSort);

        tbody.innerHTML = sortedUsers.map((u) => `
      <tr>
        <td class="email-cell">${escapeHtml(u.email)}</td>
        <td><span class="badge badge-green">${u.availableCredits}</span></td>
        <td>${u.usedCredits}</td>
        <td>${u.totalCredits}</td>
        <td>${formatDate(u.createdAt)}</td>
        <td>${formatDate(u.lastSignIn)}</td>
      </tr>
    `).join('');
    }

    // ===========================
    // Render Logs Table
    // ===========================
    function renderLogsTable(logs) {
        const tbody = $('#logs-tbody');
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No logs found</td></tr>';
            return;
        }

        const sortedLogs = sortData(logs, logsSort);

        tbody.innerHTML = sortedLogs.map((l) => {
            const actionBadge = l.action === 'transcription'
                ? '<span class="badge badge-blue">Transcription</span>'
                : '<span class="badge badge-purple">AI Processing</span>';

            const tokens = l.action === 'ai_processing'
                ? `${formatNumber(l.totalTokens || 0)}`
                : '—';

            const details = l.action === 'transcription'
                ? `${formatBytes(l.audioSizeBytes)} → ${formatNumber(l.transcriptLength)} chars`
                : `${formatNumber(l.promptTokens)}in / ${formatNumber(l.completionTokens)}out`;

            return `
        <tr>
          <td class="mono">${formatDateTime(l.timestamp)}</td>
          <td class="mono">${(l.userId || 'anonymous').slice(0, 12)}…</td>
          <td>${actionBadge}</td>
          <td class="mono">${escapeHtml(l.model || '—')}</td>
          <td>${tokens}</td>
          <td>${l.durationMs ? (l.durationMs / 1000).toFixed(1) + 's' : '—'}</td>
          <td>${details}</td>
        </tr>
      `;
        }).join('');
    }

    // ===========================
    // Formatting Helpers
    // ===========================
    function formatNumber(n) {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return n.toString();
    }

    function formatTokens(n) {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return n.toString();
    }

    function formatBytes(bytes) {
        if (!bytes) return '—';
        if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + 'MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(0) + 'KB';
        return bytes + 'B';
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return '—';
        }
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
                ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '—';
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();
