/**
 * Local mock server for the Dr.Filler admin dashboard.
 * Serves the real admin/ static files and /api/admin/* endpoints backed by
 * the REAL backend/services/statsCompute.js over generated data — so the
 * frontend sees exactly the shapes production will return.
 *
 * Run: node dev/mock-server.js  →  http://localhost:8323/?server=http://localhost:8323
 * (expects the sibling backend/ repo next to admin/, as in the drfiller folder)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.join(__dirname, '..');
const { computeUsageStats, computeUserActivity } =
    require(path.join(__dirname, '../../backend/services/statsCompute.js'));

const PORT = 8323;

// ---------- Deterministic PRNG ----------
function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- Generate users ----------
const NOW = new Date();
const USERS = [];
const FIRST = ['ruta', 'jonas', 'egle', 'tomas', 'aiste', 'lukas', 'greta', 'mantas', 'ieva', 'paulius',
    'laura', 'dovydas', 'gabija', 'rokas', 'monika', 'arnas', 'kotryna', 'simas', 'urte', 'karolis',
    'austeja', 'nedas', 'vilte', 'tautvydas', 'emilija', 'benas', 'liepa', 'domas', 'saule', 'matas',
    'gerda', 'vytas', 'milda', 'zygimantas', 'indre', 'titas', 'jurga', 'aurimas', 'rasa', 'giedrius'];
for (let i = 0; i < 40; i++) {
    const createdDaysAgo = 5 + Math.floor(rand() * 200);
    const createdAt = new Date(NOW.getTime() - createdDaysAgo * 86400000);
    USERS.push({
        uid: `mockuid${String(i).padStart(3, '0')}${'x'.repeat(16)}`,
        email: `${FIRST[i]}.gyd${i}@example.com`,
        createdAt: createdAt.toUTCString(),
        lastSignIn: null, // filled after logs
        _created: createdAt,
        // activity profile: 0 = churned, 1 = occasional, 2 = regular, 3 = power
        _profile: rand() < 0.25 ? 0 : rand() < 0.5 ? 1 : rand() < 0.85 ? 2 : 3,
        totalCredits: 15 + (rand() < 0.4 ? 250 : 0) + (rand() < 0.15 ? 600 : 0),
        usedCredits: 0,
        availableCredits: 0,
        pendingTranscription: false
    });
}

// ---------- Generate logs (~6 months) ----------
const LOGS = [];
const DAYS = 190;
for (let d = DAYS; d >= 0; d--) {
    const day = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - d);
    const weekday = day.getDay();
    const weekdayFactor = (weekday === 0 || weekday === 6) ? 0.2 : 1;
    // product grew over time: more activity in recent months
    const growth = 0.4 + 0.6 * (1 - d / DAYS);

    USERS.forEach(u => {
        if (u._created > day) return;
        if (u._profile === 0 && d < 60) return; // churned two months ago
        const pDaily = [0.02, 0.08, 0.22, 0.55][u._profile] * weekdayFactor * growth;
        if (rand() > pDaily) return;

        const sessions = 1 + Math.floor(rand() * (u._profile >= 3 ? 5 : 3));
        for (let s = 0; s < sessions; s++) {
            const hour = 8 + Math.floor(rand() * 11); // 8:00–18:59 local (≈UTC in mock)
            const ts = new Date(day.getTime() + hour * 3600000 + Math.floor(rand() * 3500000));
            const minutes = 0.4 + rand() * 4.5;
            const transcriptLength = Math.round(minutes * (380 + rand() * 350));

            LOGS.push({
                userId: u.uid,
                action: 'transcription',
                ts,
                audioSizeBytes: Math.round(minutes * 60 * 32000),
                audioDurationSeconds: null,
                transcriptLength,
                durationMs: Math.round(900 + rand() * 4800),
                model: d > 70 ? 'gpt-4o-mini-transcribe-2025-03-20' : 'gpt-4o-mini-transcribe-2025-12-15'
            });
            u.usedCredits++;

            if (rand() < 0.82) {
                const promptTokens = 900 + Math.round(transcriptLength / 3.2);
                const completionTokens = 350 + Math.round(rand() * 1400);
                LOGS.push({
                    userId: u.uid,
                    action: 'ai_processing',
                    ts: new Date(ts.getTime() + 20000 + rand() * 60000),
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                    transcriptLength,
                    durationMs: Math.round(2500 + rand() * 11000),
                    model: d > 40 ? 'gpt-5-mini' : (rand() < 0.6 ? 'gemini-2.5-flash' : 'gpt-5-mini')
                });
            }
        }
    });
}
LOGS.sort((a, b) => a.ts - b.ts);

USERS.forEach(u => {
    u.availableCredits = Math.max(0, u.totalCredits - u.usedCredits);
    const own = LOGS.filter(l => l.userId === u.uid);
    u.lastSignIn = own.length ? own[own.length - 1].ts.toUTCString() : u.createdAt;
});

console.log(`Mock data: ${USERS.length} users, ${LOGS.length} logs`);

// ---------- HTTP server ----------
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };

function send(res, code, data, type = 'application/json') {
    res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const q = url.searchParams;

    try {
        if (url.pathname === '/api/admin/stats') {
            const now = new Date();
            const defStart = new Date(now); defStart.setDate(defStart.getDate() - 6); defStart.setHours(0, 0, 0, 0);
            const start = q.get('startDate') ? new Date(q.get('startDate')) : defStart;
            const end = q.get('endDate') ? new Date(q.get('endDate')) : now;
            const logs = LOGS.filter(l => l.ts >= start && l.ts <= end);
            const stats = computeUsageStats(logs, {
                start, end, now,
                tzOffsetMinutes: Number(q.get('tzOffsetMinutes')) || 0
            });
            return send(res, 200, { success: true, data: { ...stats, totalRegisteredUsers: USERS.length } });
        }

        if (url.pathname === '/api/admin/users') {
            const data = USERS.map(({ _created, _profile, ...u }) => u)
                .sort((a, b) => new Date(b.lastSignIn) - new Date(a.lastSignIn));
            return send(res, 200, { success: true, data, total: data.length });
        }

        if (url.pathname === '/api/admin/user-activity') {
            const start = q.get('startDate') ? new Date(q.get('startDate')) : null;
            const end = q.get('endDate') ? new Date(q.get('endDate')) : null;
            const data = computeUserActivity(LOGS, {
                start, end,
                tzOffsetMinutes: Number(q.get('tzOffsetMinutes')) || 0
            });
            return send(res, 200, { success: true, data, total: data.length });
        }

        if (url.pathname === '/api/admin/logs') {
            let logs = [...LOGS];
            if (q.get('action')) logs = logs.filter(l => l.action === q.get('action'));
            if (q.get('startDate')) logs = logs.filter(l => l.ts >= new Date(q.get('startDate')));
            if (q.get('endDate')) logs = logs.filter(l => l.ts <= new Date(q.get('endDate')));
            logs.sort((a, b) => b.ts - a.ts);
            logs = logs.slice(0, Number(q.get('limit')) || 100);
            const data = logs.map(({ ts, ...l }) => ({ ...l, timestamp: ts.toISOString() }));
            return send(res, 200, { success: true, data, total: data.length });
        }

        // Static files from admin/
        let file = url.pathname === '/' ? '/index.html' : url.pathname;
        const full = path.join(ADMIN_DIR, path.normalize(file).replace(/^(\.\.[\/\\])+/, ''));
        if (full.startsWith(ADMIN_DIR) && fs.existsSync(full) && fs.statSync(full).isFile()) {
            return send(res, 200, fs.readFileSync(full), MIME[path.extname(full)] || 'application/octet-stream');
        }

        send(res, 404, { error: 'not found' });
    } catch (e) {
        console.error(e);
        send(res, 500, { success: false, error: e.message });
    }
}).listen(PORT, () => console.log(`Mock admin dashboard on http://localhost:${PORT}/`));
