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
    let serverUrl = '';
    let adminSecret = '';
    let statsData = null;
    let usersData = [];
    let logsData = [];

    // ===========================
    // DOM Elements
    // ===========================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ===========================
    // Login
    // ===========================
    $('#login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('#login-btn');
        const errorEl = $('#login-error');
        errorEl.style.display = 'none';

        serverUrl = $('#server-url').value.replace(/\/+$/, '');
        adminSecret = $('#admin-secret').value;

        btn.querySelector('.btn-text').textContent = 'Connecting...';
        btn.disabled = true;

        try {
            const res = await apiFetch('/api/admin/stats');
            if (!res.success) throw new Error(res.error || 'Failed to connect');

            // Save to localStorage for convenience
            localStorage.setItem('drfiller_admin_url', serverUrl);
            localStorage.setItem('drfiller_admin_secret', adminSecret);

            // Show dashboard
            $('#login-screen').style.display = 'none';
            $('#dashboard-screen').style.display = 'block';

            // Load all data
            await loadAllData();
        } catch (err) {
            errorEl.textContent = err.message || 'Connection failed';
            errorEl.style.display = 'block';
        } finally {
            btn.querySelector('.btn-text').textContent = 'Connect';
            btn.disabled = false;
        }
    });

    // Auto-fill from localStorage and auto-connect if both are saved
    const savedUrl = localStorage.getItem('drfiller_admin_url');
    const savedSecret = localStorage.getItem('drfiller_admin_secret');
    if (savedUrl) $('#server-url').value = savedUrl;
    if (savedSecret) $('#admin-secret').value = savedSecret;

    // Auto-login if credentials are saved
    if (savedUrl && savedSecret) {
        serverUrl = savedUrl;
        adminSecret = savedSecret;
        (async () => {
            try {
                const res = await apiFetch('/api/admin/stats');
                if (res.success) {
                    $('#login-screen').style.display = 'none';
                    $('#dashboard-screen').style.display = 'block';
                    await loadAllData();
                }
            } catch (err) {
                console.log('Auto-login failed, showing login form:', err.message);
            }
        })();
    }

    // ===========================
    // Logout
    // ===========================
    $('#logout-btn').addEventListener('click', () => {
        localStorage.removeItem('drfiller_admin_secret');
        $('#dashboard-screen').style.display = 'none';
        $('#login-screen').style.display = 'flex';
        $('#admin-secret').value = '';
    });

    // ===========================
    // Refresh
    // ===========================
    $('#refresh-btn').addEventListener('click', () => loadAllData());

    // ===========================
    // Tabs
    // ===========================
    $$('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            $$('.tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            $('#tab-users').style.display = target === 'users' ? 'block' : 'none';
            $('#tab-logs').style.display = target === 'logs' ? 'block' : 'none';
        });
    });

    // ===========================
    // User search
    // ===========================
    $('#user-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        renderUsersTable(usersData.filter((u) =>
            (u.email || '').toLowerCase().includes(query) ||
            (u.uid || '').toLowerCase().includes(query)
        ));
    });

    // ===========================
    // Log filters
    // ===========================
    $('#apply-log-filters').addEventListener('click', () => loadLogs());

    // ===========================
    // API Helper
    // ===========================
    async function apiFetch(path, params = {}) {
        const url = new URL(serverUrl + path);
        url.searchParams.set('secret', adminSecret);
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
    async function loadAllData() {
        try {
            await Promise.all([loadStats(), loadUsers(), loadLogs()]);
            $('#last-updated').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        } catch (err) {
            console.error('Failed to load data:', err);
        }
    }

    async function loadStats() {
        try {
            const res = await apiFetch('/api/admin/stats');
            statsData = res.data;
            renderStats(statsData);
            renderChart(statsData.dailyBreakdown || []);
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
            const res = await apiFetch('/api/admin/logs', { action, limit });
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
    function renderChart(daily) {
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

        const maxVal = Math.max(...daily.map((d) => d.totalRequests), 1);
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

            // Transcription bar (blue)
            const transcH = (d.transcriptions / maxVal) * chartH;
            const aiH = (d.aiProcessing / maxVal) * chartH;

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

            // Day label
            const dayLabel = d.date.slice(5); // MM-DD
            ctx.fillStyle = '#6b7194';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(dayLabel, x + barWidth / 2, padding.top + chartH + 20);

            // Count on top of bar
            const totalH = transcH + aiH;
            if (d.totalRequests > 0) {
                ctx.fillStyle = '#9ba1b7';
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(d.totalRequests.toString(), x + barWidth / 2, padding.top + chartH - totalH - 6);
            }
        });

        // Legend
        const legendY = H - 12;
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'left';

        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(W / 2 - 100, legendY - 8, 10, 10);
        ctx.fillStyle = '#9ba1b7';
        ctx.fillText('Transcription', W / 2 - 86, legendY);

        ctx.fillStyle = '#a855f7';
        ctx.fillRect(W / 2 + 10, legendY - 8, 10, 10);
        ctx.fillStyle = '#9ba1b7';
        ctx.fillText('AI Processing', W / 2 + 24, legendY);
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

        tbody.innerHTML = users.map((u) => `
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

        tbody.innerHTML = logs.map((l) => {
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
