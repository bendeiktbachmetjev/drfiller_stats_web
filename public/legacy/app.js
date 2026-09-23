/**
 * Dr.Filler Admin Dashboard — App Logic
 * Vanilla JS, no dependencies.
 * Fetches data from /api/admin/* endpoints and renders KPIs, charts,
 * insights, and tables. All numbers respect the global date range;
 * "Last used" in the users table is always all-time.
 */

(function () {
    'use strict';

    // ===========================
    // State
    // ===========================
    // Dev override: ?server=http://localhost:8323 or
    // localStorage.drfiller_admin_server. Defaults to production.
    const serverUrl =
        new URLSearchParams(location.search).get('server') ||
        localStorage.getItem('drfiller_admin_server') ||
        'https://web-production-d4666.up.railway.app';

    let statsData = null;
    let usersData = [];       // /users merged with /user-activity
    let activityData = [];    // raw /user-activity
    let logsData = [];
    let usersSort = { col: 'lastActivity', dir: 'desc', type: 'date' };
    let logsSort = { col: 'timestamp', dir: 'desc', type: 'date' };
    let lastApiError = null;

    const SERIES = {
        transcriptions: { key: 'transcriptions', color: '#3987e5', label: 'Transcriptions' },
        aiProcessing: { key: 'aiProcessing', color: '#d95926', label: 'AI processing' },
        activeUsers: { key: 'uniqueUsers', color: '#199e70', label: 'Active users' },
        newUsers: { key: 'newUsers', color: '#c98500', label: 'New users' }
    };

    const CARD_BG = '#1e2130';

    // ===========================
    // DOM helpers
    // ===========================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ===========================
    // Admin Access Key
    // Sent as the "x-admin-secret" header on every /api/admin/* request.
    // Asked once, kept in localStorage, wiped and re-asked on HTTP 401.
    // ===========================
    const ADMIN_SECRET_STORAGE_KEY = 'drfiller_admin_secret';
    let adminSecret = localStorage.getItem(ADMIN_SECRET_STORAGE_KEY) || '';
    let unauthorizedPending = false;

    function askForAdminSecret(message) {
        const entered = window.prompt(message, '');
        if (entered && entered.trim()) {
            adminSecret = entered.trim();
            localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, adminSecret);
            return true;
        }
        clearAdminSecret();
        return false;
    }

    function clearAdminSecret() {
        adminSecret = '';
        localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
    }

    function ensureAdminSecret() {
        if (adminSecret) return true;
        if (unauthorizedPending) return false;
        return askForAdminSecret('Enter admin access key:');
    }

    function handleUnauthorized() {
        clearAdminSecret();
        if (unauthorizedPending) return;
        unauthorizedPending = true;

        setTimeout(() => {
            unauthorizedPending = false;
            if (askForAdminSecret('Wrong admin access key. Please enter it again:')) {
                loadAllData();
            } else {
                $('#last-updated').textContent = 'Access denied — reload the page to enter the key again.';
            }
        }, 0);
    }

    // ===========================
    // API Helper
    // ===========================
    async function apiFetch(path, params = {}) {
        if (!ensureAdminSecret()) {
            lastApiError = 'Admin access key is required';
            throw new Error(lastApiError);
        }

        const url = new URL(serverUrl + path);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') {
                url.searchParams.set(k, v);
            }
        });

        const res = await fetch(url.toString(), {
            headers: { 'x-admin-secret': adminSecret }
        });

        if (res.status === 401) {
            lastApiError = 'Wrong admin access key';
            handleUnauthorized();
            throw new Error(lastApiError);
        }

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            lastApiError = body.error || `HTTP ${res.status}`;
            throw new Error(lastApiError);
        }
        return res.json();
    }

    // ===========================
    // Date range
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

    function getPeriodLabel() {
        const preset = $('#global-date-preset')?.value || '';
        return {
            today: 'today',
            '7d': '7 days',
            '30d': '30 days',
            this_month: 'this month',
            last_month: 'last month',
            '6m': '6 months',
            '1y': '1 year',
            all: 'all time',
            custom: 'custom range'
        }[preset] || 'period';
    }

    // Bucket unit of the current chartBreakdown, mirroring the backend thresholds
    function getBucketUnit() {
        if (!statsData?.timeRange) return 'day';
        const days = (new Date(statsData.timeRange.endDate) - new Date(statsData.timeRange.startDate)) / 86400000;
        if (days <= 1.5) return 'hour';
        if (days <= 32) return 'day';
        if (days <= 185) return 'week';
        return 'month';
    }

    // ===========================
    // Data Loading
    // ===========================
    async function loadAllData() {
        $('#last-updated').textContent = 'Loading…';
        lastApiError = null;
        document.body.classList.add('is-loading');
        try {
            const { startDate, endDate } = getGlobalDateRange();
            const tzOffsetMinutes = new Date().getTimezoneOffset();

            const [statsRes, usersRes, activityRes, logsRes] = await Promise.all([
                apiFetch('/api/admin/stats', { startDate, endDate, tzOffsetMinutes }),
                apiFetch('/api/admin/users'),
                // Non-fatal: an older backend without this endpoint still gets a working dashboard
                apiFetch('/api/admin/user-activity', { startDate, endDate, tzOffsetMinutes })
                    .catch(err => {
                        console.warn('user-activity unavailable:', err.message);
                        return { data: [] };
                    }),
                apiFetch('/api/admin/logs', {
                    action: $('#log-action-filter').value,
                    limit: $('#log-limit').value,
                    startDate, endDate
                })
            ]);

            statsData = statsRes.data;
            activityData = activityRes.data || [];
            logsData = logsRes.data || [];
            usersData = mergeUsers(usersRes.data || [], activityData);

            renderAll();
            $('#last-updated').textContent = `Updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
        } catch (err) {
            console.error('Failed to load data:', err);
            $('#last-updated').textContent = `Error: ${lastApiError || err.message}`;
        } finally {
            document.body.classList.remove('is-loading');
        }
    }

    function mergeUsers(users, activity) {
        const byId = new Map(activity.map(a => [a.userId, a]));
        return users.map(u => {
            const act = byId.get(u.uid);
            return {
                ...u,
                lastActivity: act?.allTime?.lastActivity || null,
                firstActivity: act?.allTime?.firstActivity || null,
                activeDays: act?.allTime?.activeDays || 0,
                allTimeRequests: act?.allTime?.totalRequests || 0,
                periodRequests: act?.inRange?.totalRequests || 0,
                periodTranscriptions: act?.inRange?.transcriptions || 0,
                periodAudioMin: act?.inRange?.audioMinutes || 0,
                periodCostUsd: act?.inRange?.estimatedCostUsd || 0
            };
        });
    }

    function renderAll() {
        // New-users-per-bucket comes from Firebase Auth creation dates
        if (statsData?.chartBreakdown) {
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

        renderKpis();
        usersChart.setData(statsData?.chartBreakdown || []);
        requestsChart.setData(statsData?.chartBreakdown || []);
        renderInsights();
        renderUsersTable(filteredUsers());
        renderLogsTable(logsData);
    }

    // ===========================
    // KPIs
    // ===========================
    function renderKpis() {
        if (!statsData) return;
        const o = statsData.overall || {};
        const unit = getBucketUnit();
        const buckets = statsData.chartBreakdown || [];
        const now = Date.now();

        const inRange = (dateStr) => {
            if (!dateStr) return false;
            const t = new Date(dateStr).getTime();
            return t >= new Date(statsData.timeRange.startDate).getTime()
                && t <= new Date(statsData.timeRange.endDate).getTime();
        };

        // Active users + average per bucket
        $('#kpi-active').textContent = formatNumber(o.uniqueUsers || 0);
        const avgActive = buckets.length
            ? buckets.reduce((s, b) => s + (b.uniqueUsers || 0), 0) / buckets.length
            : 0;
        $('#kpi-active-sub').textContent = buckets.length > 1
            ? `≈ ${avgActive.toFixed(1)} per ${unit}`
            : '';

        // New users in period
        const newUsers = usersData.filter(u => inRange(u.createdAt)).length;
        $('#kpi-new-users').textContent = formatNumber(newUsers);
        $('#kpi-new-users-sub').textContent = `${usersData.length || statsData.totalRegisteredUsers || 0} registered total`;

        // Transcriptions
        $('#kpi-transcriptions').textContent = formatNumber(o.totalTranscriptions || 0);
        $('#kpi-transcriptions-sub').textContent = `${formatMinutes(o.totalAudioMinutes || 0)} of audio`;

        // AI processing
        $('#kpi-ai').textContent = formatNumber(o.totalAiProcessing || 0);
        $('#kpi-ai-sub').textContent = `${formatTokens(o.totalTokensUsed || 0)} tokens`;

        // Cost
        $('#kpi-cost').textContent = formatCost(o.estimatedCostUsd || 0);
        $('#kpi-cost-sub').textContent =
            `voice ${formatCost(o.transcriptionCostUsd || 0)} · AI ${formatCost(o.aiCostUsd || 0)}`;

        // Registered (all-time) + active in the last 30 days
        $('#kpi-registered').textContent = formatNumber(statsData.totalRegisteredUsers || usersData.length || 0);
        const active30 = usersData.filter(u =>
            u.lastActivity && (now - new Date(u.lastActivity).getTime()) < 30 * 86400000
        ).length;
        $('#kpi-registered-sub').textContent = `${active30} active in last 30 days`;
    }

    // ===========================
    // Chart engine (canvas line chart + crosshair tooltip)
    // ===========================
    function createChart({ canvasSel, tooltipSel, legendSel, series }) {
        const canvas = $(canvasSel);
        const tooltip = $(tooltipSel);
        const ctx = canvas.getContext('2d');
        let buckets = [];
        let geom = null; // {padding, W, H, chartW, chartH, yMax}
        let hoverIndex = -1;

        // Legend (HTML, outside the canvas)
        const legendEl = $(legendSel);
        legendEl.textContent = '';
        series.forEach(s => {
            const item = document.createElement('span');
            item.className = 'legend-item';
            const key = document.createElement('span');
            key.className = 'legend-key';
            key.style.borderTopColor = s.color;
            const name = document.createElement('span');
            name.textContent = s.label;
            item.append(key, name);
            legendEl.appendChild(item);
        });

        // Pick a clean tick step (1/2/5 × 10^n, never fractional — counts are
        // integers) so ~4 gridlines cover the max
        function pickScale(maxVal) {
            const target = Math.max(maxVal, 1) / 4;
            const mag = Math.pow(10, Math.floor(Math.log10(target)));
            let step = mag;
            for (const mult of [1, 2, 5, 10]) {
                if (mag * mult >= target) { step = mag * mult; break; }
            }
            step = Math.max(1, Math.round(step));
            const yMax = Math.max(step * Math.ceil(Math.max(maxVal, 1) / step), step);
            return { step, yMax };
        }

        function setData(newBuckets) {
            buckets = newBuckets || [];
            hoverIndex = -1;
            hideTooltip();
            draw();
        }

        function getX(i) {
            if (buckets.length === 1) return geom.padding.left + geom.chartW / 2;
            return geom.padding.left + (i / (buckets.length - 1)) * geom.chartW;
        }

        function getY(val) {
            return geom.padding.top + geom.chartH - (val / geom.yMax) * geom.chartH;
        }

        function draw() {
            const container = canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = container.clientWidth * dpr;
            canvas.height = container.clientHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const W = container.clientWidth;
            const H = container.clientHeight;
            ctx.clearRect(0, 0, W, H);

            if (!buckets.length) {
                ctx.fillStyle = '#6b7194';
                ctx.font = '13px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('No data for this period', W / 2, H / 2);
                geom = null;
                return;
            }

            const padding = { top: 14, right: 14, bottom: 26, left: 40 };
            const chartW = W - padding.left - padding.right;
            const chartH = H - padding.top - padding.bottom;

            const maxVal = Math.max(...buckets.map(b => Math.max(...series.map(s => b[s.key] || 0))), 1);
            const { step, yMax } = pickScale(maxVal);
            geom = { padding, W, H, chartW, chartH, yMax };

            // Gridlines (hairline, solid, recessive) + clean y ticks
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#2d3148';
            ctx.fillStyle = '#6b7194';
            ctx.font = '10px Inter, sans-serif';
            for (let v = 0; v <= yMax; v += step) {
                const y = Math.round(getY(v)) + 0.5;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(W - padding.right, y);
                ctx.stroke();
                ctx.textAlign = 'right';
                ctx.fillText(formatNumber(v), padding.left - 7, y + 3);
            }

            // Crosshair under the marks
            if (hoverIndex >= 0) {
                const x = Math.round(getX(hoverIndex)) + 0.5;
                ctx.strokeStyle = '#3a3f5c';
                ctx.beginPath();
                ctx.moveTo(x, padding.top);
                ctx.lineTo(x, padding.top + chartH);
                ctx.stroke();
            }

            const showMarkers = buckets.length <= 40;

            series.forEach(s => {
                const vals = buckets.map(b => b[s.key] || 0);

                // Area wash (~10% opacity flat fill)
                if (buckets.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(getX(0), getY(vals[0]));
                    for (let i = 1; i < vals.length; i++) ctx.lineTo(getX(i), getY(vals[i]));
                    ctx.lineTo(getX(vals.length - 1), padding.top + chartH);
                    ctx.lineTo(getX(0), padding.top + chartH);
                    ctx.closePath();
                    ctx.fillStyle = s.color + '1a';
                    ctx.fill();
                }

                // Line (2px, round joins)
                ctx.beginPath();
                ctx.moveTo(getX(0), getY(vals[0]));
                for (let i = 1; i < vals.length; i++) ctx.lineTo(getX(i), getY(vals[i]));
                ctx.strokeStyle = s.color;
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.stroke();

                // Markers with a 2px surface ring
                vals.forEach((v, i) => {
                    const isHovered = i === hoverIndex;
                    if (!showMarkers && !isHovered) return;
                    const px = getX(i), py = getY(v);
                    ctx.beginPath();
                    ctx.arc(px, py, isHovered ? 6.5 : 6, 0, Math.PI * 2);
                    ctx.fillStyle = CARD_BG;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(px, py, isHovered ? 4.5 : 4, 0, Math.PI * 2);
                    ctx.fillStyle = s.color;
                    ctx.fill();
                });
            });

            // Selective direct labels: the max point of each series (text tokens, not series color)
            const placed = [];
            series.forEach(s => {
                const vals = buckets.map(b => b[s.key] || 0);
                const maxV = Math.max(...vals);
                if (maxV <= 0) return;
                const i = vals.indexOf(maxV);
                const px = getX(i);
                let py = getY(maxV) - 10;
                if (placed.some(p => Math.abs(p.x - px) < 26 && Math.abs(p.y - py) < 13)) {
                    py = getY(maxV) + 17; // collision → drop below the dot
                }
                placed.push({ x: px, y: py });
                ctx.fillStyle = '#e8eaf0';
                ctx.font = '600 10px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(formatNumber(maxV), px, py);
            });

            // X labels (sparse; always the last one)
            const maxLabels = Math.max(2, Math.floor(chartW / 52));
            const nth = Math.max(1, Math.ceil(buckets.length / maxLabels));
            ctx.fillStyle = '#6b7194';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            buckets.forEach((b, i) => {
                const isLast = i === buckets.length - 1;
                if (i % nth !== 0 && !isLast) return;
                if (!isLast && i % nth === 0 && buckets.length - 1 - i < nth * 0.6) return; // avoid clash with last
                ctx.fillText(b.label, getX(i), padding.top + chartH + 17);
            });
        }

        // --- Tooltip ---
        function showTooltip(i, clientX) {
            const b = buckets[i];
            tooltip.textContent = '';

            const title = document.createElement('div');
            title.className = 'tt-title';
            title.textContent = formatBucketTitle(b);
            tooltip.appendChild(title);

            series.forEach(s => {
                const row = document.createElement('div');
                row.className = 'tt-row';
                const key = document.createElement('span');
                key.className = 'tt-key';
                key.style.borderTopColor = s.color;
                const value = document.createElement('span');
                value.className = 'tt-value';
                value.textContent = formatNumber(b[s.key] || 0);
                const name = document.createElement('span');
                name.className = 'tt-name';
                name.textContent = s.label;
                row.append(key, value, name);
                tooltip.appendChild(row);
            });

            tooltip.hidden = false;
            const contRect = canvas.parentElement.getBoundingClientRect();
            const x = getX(i);
            const ttW = tooltip.offsetWidth;
            let left = x + 12;
            if (left + ttW > contRect.width - 4) left = x - ttW - 12;
            tooltip.style.left = `${Math.max(4, left)}px`;
            tooltip.style.top = '8px';
        }

        function hideTooltip() {
            tooltip.hidden = true;
        }

        canvas.addEventListener('pointermove', (e) => {
            if (!geom || !buckets.length) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            let best = 0, bestDist = Infinity;
            for (let i = 0; i < buckets.length; i++) {
                const d = Math.abs(getX(i) - x);
                if (d < bestDist) { bestDist = d; best = i; }
            }
            if (best !== hoverIndex) {
                hoverIndex = best;
                draw();
            }
            showTooltip(best, e.clientX);
        });

        canvas.addEventListener('pointerleave', () => {
            hoverIndex = -1;
            hideTooltip();
            draw();
        });

        return { setData, draw };
    }

    function formatBucketTitle(b) {
        const unit = getBucketUnit();
        const d = new Date(b.date);
        if (unit === 'hour') {
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + b.label;
        }
        if (unit === 'week') {
            return `Week of ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
        }
        if (unit === 'month') {
            return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        }
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
    }

    const usersChart = createChart({
        canvasSel: '#chart-users',
        tooltipSel: '#tooltip-users',
        legendSel: '#legend-users',
        series: [SERIES.activeUsers, SERIES.newUsers]
    });

    const requestsChart = createChart({
        canvasSel: '#chart-requests',
        tooltipSel: '#tooltip-requests',
        legendSel: '#legend-requests',
        series: [SERIES.transcriptions, SERIES.aiProcessing]
    });

    window.addEventListener('resize', () => {
        usersChart.draw();
        requestsChart.draw();
    });

    // ===========================
    // Insights
    // ===========================
    function insightRow(dl, label, value) {
        const row = document.createElement('div');
        row.className = 'row';
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        row.append(dt, dd);
        dl.appendChild(row);
    }

    function renderInsights() {
        const o = statsData?.overall;
        const period = getPeriodLabel();
        $$('.insight-period').forEach(el => { el.textContent = `(${period})`; });

        // --- Averages ---
        const avgDl = $('#insight-averages');
        avgDl.textContent = '';
        if (!o || !o.totalRequests) {
            avgDl.appendChild(emptyNote());
        } else {
            insightRow(avgDl, 'Audio file length', formatMinutes(o.avgAudioMinutes || 0));
            insightRow(avgDl, 'Transcript length', `${Math.round(o.avgTranscriptChars || 0)} chars`);
            insightRow(avgDl, 'Transcription time', `${((o.avgTranscriptionMs || 0) / 1000).toFixed(1)} s`);
            insightRow(avgDl, 'AI response time', `${((o.avgAiMs || 0) / 1000).toFixed(1)} s`);
        }

        // --- Patterns ---
        const patDl = $('#insight-patterns');
        patDl.textContent = '';
        if (!o || !o.totalRequests) {
            patDl.appendChild(emptyNote());
        } else {
            const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const wd = o.weekdayHistogram || [];
            const busiestDay = wd.length ? wd.indexOf(Math.max(...wd)) : -1;
            const hh = o.hourHistogram || [];
            const busiestHour = hh.length ? hh.indexOf(Math.max(...hh)) : -1;

            if (busiestDay >= 0) insightRow(patDl, 'Busiest weekday', weekdays[busiestDay]);
            if (busiestHour >= 0) insightRow(patDl, 'Busiest hour', `${String(busiestHour).padStart(2, '0')}:00–${String((busiestHour + 1) % 24).padStart(2, '0')}:00`);
            insightRow(patDl, 'Requests per active user',
                o.uniqueUsers ? (o.totalRequests / o.uniqueUsers).toFixed(1) : '—');

            const buckets = statsData.chartBreakdown || [];
            const peak = buckets.reduce((best, b) => (b.totalRequests > (best?.totalRequests || 0) ? b : best), null);
            if (peak && peak.totalRequests > 0 && buckets.length > 1) {
                insightRow(patDl, `Peak ${getBucketUnit()}`, `${peak.label} · ${peak.totalRequests} req`);
            }
        }

        // --- Models ---
        const modelsEl = $('#insight-models');
        modelsEl.textContent = '';
        const counts = Object.entries(o?.modelCounts || {}).sort((a, b) => b[1] - a[1]);
        if (!counts.length) {
            modelsEl.appendChild(emptyNote());
        } else {
            const total = counts.reduce((s, [, n]) => s + n, 0);
            counts.slice(0, 4).forEach(([model, count]) => {
                const row = document.createElement('div');
                row.className = 'model-row';
                const top = document.createElement('div');
                top.className = 'model-top';
                const name = document.createElement('span');
                name.className = 'model-name';
                name.textContent = model;
                name.title = model;
                const num = document.createElement('span');
                num.className = 'model-count';
                num.textContent = `${count} · ${Math.round(count / total * 100)}%`;
                top.append(name, num);
                const track = document.createElement('div');
                track.className = 'model-bar-track';
                const fill = document.createElement('div');
                fill.className = 'model-bar-fill';
                fill.style.width = `${Math.max(2, count / counts[0][1] * 100)}%`;
                track.appendChild(fill);
                row.append(top, track);
                modelsEl.appendChild(row);
            });
        }
    }

    function emptyNote() {
        const el = document.createElement('div');
        el.className = 'empty-note';
        el.textContent = 'No activity in this period';
        return el;
    }

    // ===========================
    // Users table
    // ===========================
    function filteredUsers() {
        const query = ($('#user-search').value || '').toLowerCase();
        if (!query) return usersData;
        return usersData.filter((u) =>
            (u.email || '').toLowerCase().includes(query) ||
            (u.uid || '').toLowerCase().includes(query)
        );
    }

    function renderUsersTable(users) {
        const tbody = $('#users-tbody');
        const period = getPeriodLabel();
        $('#th-period-requests').childNodes[0].textContent = `Requests (${period})`;
        $('#th-period-audio').childNodes[0].textContent = `Audio min (${period})`;

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No users found</td></tr>';
            return;
        }

        const sorted = sortData(users, usersSort);
        const now = Date.now();

        tbody.innerHTML = sorted.map((u) => {
            const last = u.lastActivity ? new Date(u.lastActivity).getTime() : null;
            const dotClass = !last ? ''
                : (now - last < 7 * 86400000) ? ' recent'
                    : (now - last < 30 * 86400000) ? ' month' : '';
            const lastTitle = u.lastActivity ? formatDateTime(u.lastActivity) : 'never used';

            return `
      <tr>
        <td><span class="email-cell"><span class="status-dot${dotClass}"></span>${escapeHtml(u.email)}</span></td>
        <td class="date-cell" title="${escapeHtml(lastTitle)}">${u.lastActivity ? formatRelative(u.lastActivity) : '<span class="muted">never</span>'}</td>
        <td class="num">${u.periodRequests > 0 ? formatNumber(u.periodRequests) : '<span class="muted">—</span>'}</td>
        <td class="num">${u.periodAudioMin > 0 ? u.periodAudioMin.toFixed(1) : '<span class="muted">—</span>'}</td>
        <td class="num"><span class="badge ${u.availableCredits > 0 ? 'badge-green' : 'badge-gray'}">${u.availableCredits}</span></td>
        <td class="num">${u.usedCredits}</td>
        <td class="date-cell">${formatDate(u.createdAt)}</td>
      </tr>
    `;
        }).join('');
    }

    // ===========================
    // Logs table
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
                : '<span class="badge badge-orange">AI Processing</span>';

            const tokens = l.action === 'ai_processing'
                ? `${formatNumber(l.totalTokens || 0)}`
                : '—';

            const details = l.action === 'transcription'
                ? `${formatBytes(l.audioSizeBytes)} → ${formatNumber(l.transcriptLength)} chars`
                : `${formatNumber(l.promptTokens)}in / ${formatNumber(l.completionTokens)}out`;

            return `
        <tr>
          <td class="mono">${formatDateTime(l.timestamp)}</td>
          <td class="mono">${escapeHtml((l.userId || 'anonymous').slice(0, 12))}…</td>
          <td>${actionBadge}</td>
          <td class="mono">${escapeHtml(l.model || '—')}</td>
          <td class="num">${tokens}</td>
          <td class="num">${l.durationMs ? (l.durationMs / 1000).toFixed(1) + 's' : '—'}</td>
          <td>${details}</td>
        </tr>
      `;
        }).join('');
    }

    // ===========================
    // Sorting
    // ===========================
    function sortData(data, sortState) {
        if (!data || data.length === 0) return data;
        const { col, dir, type } = sortState;

        return [...data].sort((a, b) => {
            let valA = a[col];
            let valB = b[col];

            // Missing values always sink to the bottom, whatever the direction
            const missA = valA === undefined || valA === null || valA === '';
            const missB = valB === undefined || valB === null || valB === '';
            if (missA && missB) return 0;
            if (missA) return 1;
            if (missB) return -1;

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

            table.querySelectorAll('th.sortable').forEach(t => t.classList.remove('sorted-asc', 'sorted-desc'));
            th.classList.add(`sorted-${sortState.dir}`);

            if (isUsers) renderUsersTable(filteredUsers());
            else renderLogsTable(logsData);
        });
    });

    // ===========================
    // UI Event Listeners
    // ===========================
    $('#refresh-btn').addEventListener('click', () => loadAllData());

    $$('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            $$('.tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            $('#tab-users').style.display = target === 'users' ? 'block' : 'none';
            $('#tab-logs').style.display = target === 'logs' ? 'block' : 'none';
        });
    });

    $('#user-search').addEventListener('input', () => renderUsersTable(filteredUsers()));

    $('#global-date-preset').addEventListener('change', (e) => {
        const isCustom = e.target.value === 'custom';
        $('#custom-date-inputs').style.display = isCustom ? 'flex' : 'none';
        if (!isCustom) loadAllData();
    });
    $('#apply-global-dates').addEventListener('click', () => loadAllData());
    $('#apply-log-filters').addEventListener('click', () => loadAllData());

    // ===========================
    // Formatting Helpers
    // ===========================
    function formatNumber(n) {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
        return Math.round(n).toString();
    }

    function formatTokens(n) {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return n.toString();
    }

    function formatMinutes(min) {
        if (min >= 60) return `${(min / 60).toFixed(1)} h`;
        if (min >= 10) return `${Math.round(min)} min`;
        if (min >= 1) return `${min.toFixed(1)} min`;
        return `${Math.round(min * 60)} s`;
    }

    function formatCost(usd) {
        if (usd === 0) return '$0.00';
        if (usd < 0.01) return `$${usd.toFixed(4)}`;
        return `$${usd.toFixed(2)}`;
    }

    function formatBytes(bytes) {
        if (!bytes) return '—';
        if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + 'MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(0) + 'KB';
        return bytes + 'B';
    }

    function formatRelative(dateStr) {
        const t = new Date(dateStr).getTime();
        if (!t) return '—';
        const diff = Date.now() - t;
        if (diff < 90 * 1000) return 'just now';
        if (diff < 3600 * 1000) return `${Math.round(diff / 60000)} min ago`;
        if (diff < 24 * 3600 * 1000) return `${Math.round(diff / 3600000)} h ago`;
        if (diff < 7 * 86400000) return `${Math.round(diff / 86400000)} d ago`;
        return formatDate(dateStr);
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

    // ===========================
    // Boot
    // ===========================
    $('#dashboard-screen').style.display = 'block';
    loadAllData();

})();
