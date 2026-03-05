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
        const y = now.getFullYear(), m = now.getMonth();

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
            startDate = new Date(y, m, now.getDate(), 0, 0, 0, 0).toISOString();
        } else if (preset === '7d') {
            const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0);
            startDate = d.toISOString();
        } else if (preset === '30d') {
            const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0);
            startDate = d.toISOString();
        } else if (preset === 'this_month') {
            startDate = new Date(y, m, 1, 0, 0, 0, 0).toISOString();
        } else if (preset === 'last_month') {
            startDate = new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString();
            endDate = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
        } else if (preset === '6m') {
            const d = new Date(); d.setMonth(d.getMonth() - 6); d.setHours(0, 0, 0, 0);
            startDate = d.toISOString();
        } else if (preset === '1y') {
            const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setHours(0, 0, 0, 0);
            startDate = d.toISOString();
        } else if (preset === 'all') {
            startDate = new Date(2020, 0, 1).toISOString();
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
        // Registered users is always total (not range-filtered)
        $('#stat-users').textContent = formatNumber(data.totalRegisteredUsers || 0);
        // Other stats come from the selected date range (overall = range scope)
        $('#stat-requests-today').textContent = formatNumber(data.overall?.totalRequests || 0);
        $('#stat-transcriptions').textContent = formatNumber(data.overall?.totalTranscriptions || 0);
        $('#stat-ai-processing').textContent = formatNumber(data.overall?.totalAiProcessing || 0);
        $('#stat-tokens').textContent = formatTokens(data.overall?.totalTokensUsed || 0);
        $('#stat-active-today').textContent = formatNumber(data.today?.uniqueUsers || 0);

        // Update dynamic label on the requests card
        const preset = $('#global-date-preset')?.value || '';
        const labelMap = {
            today: 'Requests Today',
            '7d': 'Requests (7 Days)',
            '30d': 'Requests (30 Days)',
            this_month: 'Requests (This Month)',
            last_month: 'Requests (Last Month)',
            '6m': 'Requests (6 Months)',
            '1y': 'Requests (1 Year)',
            all: 'Total Requests',
            custom: 'Requests (Custom)'
        };
        const reqLabel = $('#stat-requests-label');
        if (reqLabel) reqLabel.textContent = labelMap[preset] || 'Total Requests';
    }

    // ===========================
    // Render Chart (Canvas) — Dual-axis Line Chart
    // ===========================
    function renderChart(daily, typeFilter = 'all') {
        const canvas = $('#activity-chart');
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = container.clientWidth * dpr;
        canvas.height = container.clientHeight * dpr;
        ctx.scale(dpr, dpr);
        const W = container.clientWidth;
        const H = container.clientHeight;

        ctx.clearRect(0, 0, W, H);

        if (!daily || daily.length === 0) {
            ctx.fillStyle = '#6b7194';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data yet', W / 2, H / 2);
            return;
        }

        // Dual-axis mode when showing "all" (AI left, Transcriptions right)
        const isDual = (typeFilter === 'all');

        // Padding: extra right space for right-axis labels when dual
        const padding = { top: 30, right: isDual ? 65 : 20, bottom: 50, left: 60 };
        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;

        // ---- Series data ----
        let series = [];

        if (typeFilter === 'all') {
            series = [
                { key: 'aiProcessing', color: '#a855f7', label: 'AI Processing', axis: 'left' },
                { key: 'transcriptions', color: '#3b82f6', label: 'Transcription', axis: 'right' }
            ];
        } else if (typeFilter === 'transcription') {
            series = [{ key: 'transcriptions', color: '#3b82f6', label: 'Transcription', axis: 'left' }];
        } else if (typeFilter === 'ai_processing') {
            series = [{ key: 'aiProcessing', color: '#a855f7', label: 'AI Processing', axis: 'left' }];
        } else if (typeFilter === 'active_users') {
            series = [{ key: 'uniqueUsers', color: '#10b981', label: 'Active Users', axis: 'left' }];
        } else if (typeFilter === 'new_users') {
            series = [{ key: 'newUsers', color: '#f59e0b', label: 'New Registered Users', axis: 'left' }];
        }

        // ---- Axis scales ----
        const leftMax = Math.max(...daily.map(d => {
            const leftSeries = series.filter(s => s.axis === 'left');
            return Math.max(...leftSeries.map(s => d[s.key] || 0));
        }), 1);
        const rightMax = isDual ? Math.max(...daily.map(d => d.transcriptions || 0), 1) : null;

        // Helper: get Y position for a value
        function getY(val, max) {
            return padding.top + chartH - (val / max) * chartH;
        }

        // Helper: get X position for data point i
        function getX(i) {
            if (daily.length === 1) return padding.left + chartW / 2;
            return padding.left + (i / (daily.length - 1)) * chartW;
        }

        // ---- Grid lines + left axis labels ----
        const gridLines = 5;
        ctx.strokeStyle = '#2d3148';
        ctx.lineWidth = 1;

        for (let i = 0; i <= gridLines; i++) {
            const y = padding.top + (chartH / gridLines) * i;

            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(W - padding.right, y);
            ctx.stroke();

            const leftVal = Math.round(leftMax - (leftMax / gridLines) * i);
            ctx.fillStyle = '#6b7194';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(leftVal, padding.left - 8, y + 4);

            if (isDual && rightMax !== null) {
                const rightVal = Math.round(rightMax - (rightMax / gridLines) * i);
                ctx.textAlign = 'left';
                ctx.fillText(rightVal, W - padding.right + 8, y + 4);
            }
        }

        // Left axis label
        ctx.save();
        ctx.translate(14, padding.top + chartH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#a855f7';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isDual ? 'AI Processing' : (series[0]?.label || ''), 0, 0);
        ctx.restore();

        // Right axis label (dual)
        if (isDual) {
            ctx.save();
            ctx.translate(W - 14, padding.top + chartH / 2);
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = '#3b82f6';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Transcription', 0, 0);
            ctx.restore();
        }

        // ---- Draw a smooth line for each series ----
        series.forEach(s => {
            const max = (s.axis === 'right' && isDual) ? rightMax : leftMax;
            const vals = daily.map(d => d[s.key] || 0);

            // Area fill (gradient under the line)
            const areaGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
            areaGrad.addColorStop(0, s.color + '33'); // ~20% opacity
            areaGrad.addColorStop(1, s.color + '00');

            ctx.beginPath();
            ctx.moveTo(getX(0), getY(vals[0], max));
            for (let i = 1; i < daily.length; i++) {
                const x0 = getX(i - 1), y0 = getY(vals[i - 1], max);
                const x1 = getX(i), y1 = getY(vals[i], max);
                const cpx = (x0 + x1) / 2;
                ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
            }
            ctx.lineTo(getX(daily.length - 1), padding.top + chartH);
            ctx.lineTo(getX(0), padding.top + chartH);
            ctx.closePath();
            ctx.fillStyle = areaGrad;
            ctx.fill();

            // Line stroke
            ctx.beginPath();
            ctx.moveTo(getX(0), getY(vals[0], max));
            for (let i = 1; i < daily.length; i++) {
                const x0 = getX(i - 1), y0 = getY(vals[i - 1], max);
                const x1 = getX(i), y1 = getY(vals[i], max);
                const cpx = (x0 + x1) / 2;
                ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
            }
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Dots at data points + tooltip labels for small datasets
            const showLabels = daily.length <= 30;
            vals.forEach((v, i) => {
                const px = getX(i), py = getY(v, max);

                // Outer glow dot
                ctx.beginPath();
                ctx.arc(px, py, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = s.color + '44';
                ctx.fill();

                // Inner dot
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fillStyle = s.color;
                ctx.fill();

                // Value label on top of dot
                if (showLabels && v > 0) {
                    ctx.fillStyle = s.color;
                    ctx.font = 'bold 10px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(v, px, py - 10);
                }
            });
        });

        // ---- X-axis labels ----
        const minGap = 30;
        const nth = daily.length > 1 ? Math.ceil(minGap / (chartW / (daily.length - 1))) : 1;
        ctx.fillStyle = '#6b7194';
        ctx.font = '11px Inter, sans-serif';
        daily.forEach((d, i) => {
            if (i % nth === 0 || i === daily.length - 1) {
                ctx.textAlign = 'center';
                ctx.fillText(d.label, getX(i), padding.top + chartH + 20);
            }
        });

        // ---- Legend ----
        const legendY = H - 10;
        ctx.font = '11px Inter, sans-serif';
        const legendItems = series;
        const totalLegendWidth = legendItems.reduce((sum, s) => sum + ctx.measureText(s.label).width + 20, 0);
        let lx = W / 2 - totalLegendWidth / 2;

        legendItems.forEach(s => {
            // Line segment
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lx, legendY - 4);
            ctx.lineTo(lx + 14, legendY - 4);
            ctx.stroke();
            // Dot on line
            ctx.beginPath();
            ctx.arc(lx + 7, legendY - 4, 3, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.fill();
            // Label
            ctx.fillStyle = '#9ba1b7';
            ctx.textAlign = 'left';
            ctx.fillText(s.label, lx + 18, legendY);
            lx += ctx.measureText(s.label).width + 38;
        });
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
