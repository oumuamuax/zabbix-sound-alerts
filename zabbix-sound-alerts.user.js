// ==UserScript==
// @name         Zabbix Sound Alerts
// @namespace    https://github.com/oumuamuax/zabbix-sound-alerts
// @version      8.0
// @description  Alertas sonoras para problemas Critical/High Unacknowledged con umbrales separados y excepciones
// @author       oumuamuax
// @match        *://xabbix.acens.priv/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    console.log('%c[ZBX-SA] v8.0 CARGADO', 'color:lime;font-size:16px;font-weight:bold');

    // =====================================================================
    // ESTADO
    // =====================================================================
    let isEnabled        = JSON.parse(localStorage.getItem('zbx_sa_enabled') ?? 'true');
    let thresholdHigh    = parseInt(localStorage.getItem('zbx_sa_thr_high') ?? '15');
    let thresholdCrit    = parseInt(localStorage.getItem('zbx_sa_thr_crit') ?? '5');
    let highFilter       = localStorage.getItem('zbx_sa_high_filter') ?? '';
    let criticalFilter   = localStorage.getItem('zbx_sa_crit_filter') ?? '';
    let highExceptions   = localStorage.getItem('zbx_sa_high_except') ?? '';
    let critExceptions   = localStorage.getItem('zbx_sa_crit_except') ?? '';
    let alertedIds       = new Set(JSON.parse(localStorage.getItem('zbx_sa_ids') ?? '[]'));
    let intervalHandle   = null;
    let alarmHandle      = null;
    let alarmActive      = false;
    let audioCtx         = null;
    let audioUnlocked    = false;
    let lastStatus       = 'idle';
    let pendingAlarm     = null;

    // =====================================================================
    // AUDIO
    // =====================================================================
    function getCtx() {
        if (!audioCtx || audioCtx.state === 'closed')
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx;
    }

    function unlockAudio() {
        if (audioUnlocked) return;
        const ctx = getCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
                audioUnlocked = true;
                console.log('%c[ZBX-SA] 🔊 Audio desbloqueado', 'color:cyan;font-weight:bold');
                updateDot();
                if (pendingAlarm) {
                    const { type, names } = pendingAlarm;
                    pendingAlarm = null;
                    startAlarm(type, names);
                }
            });
        } else { audioUnlocked = true; }
        try {
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf; src.connect(ctx.destination); src.start(0);
        } catch(e) {}
    }

    ['click','touchstart','touchend','mousedown','keydown'].forEach(evt => {
        document.addEventListener(evt, unlockAudio, { once: false, capture: true });
    });

    function playSiren(durationSec) {
        const c = getCtx(); if (c.state === 'suspended') c.resume();
        const now = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth'; g.gain.setValueAtTime(0.7, now);
        const cycles = Math.ceil(durationSec / 0.6);
        for (let i = 0; i < cycles; i++) {
            const t = now + i * 0.6;
            o.frequency.setValueAtTime(600, t);
            o.frequency.linearRampToValueAtTime(1400, t + 0.3);
            o.frequency.linearRampToValueAtTime(600, t + 0.6);
        }
        o.connect(g); g.connect(c.destination);
        o.start(now); o.stop(now + durationSec);
    }

    function playBeeps(count) {
        const c = getCtx(); if (c.state === 'suspended') c.resume();
        for (let i = 0; i < count; i++) {
            const t = c.currentTime + i * 0.15;
            const o = c.createOscillator(), g = c.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(i % 2 === 0 ? 1000 : 800, t);
            g.gain.setValueAtTime(0.8, t);
            g.gain.setValueAtTime(0, t + 0.1);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + 0.12);
        }
    }

    function startAlarm(type, problemNames) {
        if (!audioUnlocked) {
            pendingAlarm = { type, names: problemNames };
            showStopOverlay(type, problemNames, true);
            return;
        }
        if (alarmActive) return;
        alarmActive = true;
        showStopOverlay(type, problemNames, false);
        (function loop() {
            if (!alarmActive) return;
            if (type === 'critical') {
                playSiren(2.5);
                setTimeout(() => playBeeps(8), 2600);
                alarmHandle = setTimeout(loop, 5500);
            } else {
                playSiren(1.5);
                setTimeout(() => playBeeps(5), 1600);
                alarmHandle = setTimeout(loop, 4000);
            }
        })();
    }

    function stopAlarm() {
        alarmActive = false; pendingAlarm = null;
        if (alarmHandle) { clearTimeout(alarmHandle); alarmHandle = null; }
        hideStopOverlay();
    }

    // =====================================================================
    // OVERLAY PANTALLA COMPLETA
    // =====================================================================
    function showStopOverlay(type, problemNames, needsUnlock) {
        if (document.getElementById('zbx-sa-stop-overlay')) return;
        const thr = type === 'critical' ? thresholdCrit : thresholdHigh;
        const namesList = (problemNames || []).map(n =>
            '<div style="background:rgba(0,0,0,0.3);padding:6px 12px;border-radius:4px;margin:3px 0;font-size:16px">' + n + '</div>'
        ).join('');
        const overlay = document.createElement('div');
        overlay.id = 'zbx-sa-stop-overlay';
        overlay.setAttribute('style', 'position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;background:' + (type === 'critical' ? 'rgba(200,0,0,0.9)' : 'rgba(200,100,0,0.9)') + '!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;');
        overlay.innerHTML = '<div style="font-size:80px;margin-bottom:20px;animation:zbx-pulse 0.5s infinite alternate">' + (type === 'critical' ? '🚨' : '⚠️') + '</div>' +
            '<div style="color:#fff;font-size:42px;font-weight:bold;text-align:center;margin-bottom:10px;text-shadow:2px 2px 4px rgba(0,0,0,0.5)">' + (type === 'critical' ? '¡¡ ALERTA CRITICAL !!' : '¡¡ ALERTA HIGH !!') + '</div>' +
            '<div style="color:#fff;font-size:18px;margin-bottom:15px;opacity:0.9">Problemas UNACK con más de ' + thr + ' minutos:</div>' +
            '<div style="margin-bottom:25px;max-height:200px;overflow-y:auto;text-align:center;color:#fff">' + namesList + '</div>' +
            '<button id="zbx-sa-stop-btn" style="padding:20px 60px;border:none;border-radius:12px;background:#fff;color:#333;font-size:28px;font-weight:bold;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3)">' + (needsUnlock ? '🔊 CLICK PARA ACTIVAR SONIDO' : '🔇 PARAR ALARMA') + '</button>';
        const style = document.createElement('style');
        style.id = 'zbx-sa-stop-style';
        style.textContent = '@keyframes zbx-pulse{from{transform:scale(1)}to{transform:scale(1.3)}}';
        document.documentElement.appendChild(style);
        document.documentElement.appendChild(overlay);
        document.getElementById('zbx-sa-stop-btn').addEventListener('click', e => {
            e.stopPropagation();
            if (needsUnlock) {
                hideStopOverlay();
                setTimeout(() => { if (pendingAlarm) { const {type:t, names:n} = pendingAlarm; pendingAlarm = null; startAlarm(t, n); } }, 200);
            } else { stopAlarm(); }
        });
    }

    function hideStopOverlay() {
        const el = document.getElementById('zbx-sa-stop-overlay'); if (el) el.remove();
        const st = document.getElementById('zbx-sa-stop-style'); if (st) st.remove();
    }

    // =====================================================================
    // FILTROS Y EXCEPCIONES
    //
    //   Filtro:     "if_stat, error_53"  → solo alerta si nombre contiene alguno (OR)
    //   Excepción:  "if_error, disklat"  → NO alerta si nombre contiene alguno
    //   Vacío = sin restricción
    // =====================================================================
    function matchesList(name, csv) {
        if (!csv || csv.trim() === '') return false;
        const terms = csv.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
        if (terms.length === 0) return false;
        const lower = name.toLowerCase();
        return terms.some(term => lower.includes(term));
    }

    function shouldAlert(name, filterCsv, exceptionCsv) {
        // 1. Si está en excepciones → NO alertar
        if (matchesList(name, exceptionCsv)) return false;
        // 2. Si hay filtro y NO coincide → NO alertar
        if (filterCsv && filterCsv.trim() !== '' && !matchesList(name, filterCsv)) return false;
        // 3. En cualquier otro caso → SÍ alertar
        return true;
    }

    // =====================================================================
    // ZABBIX API — DOS LLAMADAS CON UMBRALES DISTINTOS
    // =====================================================================
    function apiUrl() {
        return window.location.origin + '/api_jsonrpc.php';
    }

    async function fetchProblems(severities, thresholdMinutes) {
        const now = Math.floor(Date.now() / 1000);
        const body = {
            jsonrpc: '2.0', method: 'problem.get', id: 1,
            params: {
                output: ['eventid', 'objectid', 'clock', 'name', 'severity', 'acknowledged'],
                source: 0, object: 0,
                severities: severities,
                acknowledged: false,
                suppressed: false,
                time_till: now - thresholdMinutes * 60,
                sortfield: ['eventid'], sortorder: 'DESC',
                limit: 100
            }
        };
        try {
            const r = await fetch(apiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json-rpc' },
                body: JSON.stringify(body),
                credentials: 'same-origin'
            });
            const d = await r.json();
            if (d.error) { console.warn('[ZBX-SA] API error:', d.error); return null; }
            return d.result || [];
        } catch (e) {
            console.error('[ZBX-SA] Fetch error:', e);
            return null;
        }
    }

    async function getProblems() {
        // Llamada separada para cada severidad con su umbral propio
        const [critProblems, highProblems] = await Promise.all([
            fetchProblems([5], thresholdCrit),   // Critical/Disaster con umbral CRITICAL
            fetchProblems([4], thresholdHigh)     // High con umbral HIGH
        ]);

        if (critProblems === null || highProblems === null) {
            lastStatus = 'error'; updateDot();
            return { critical: critProblems || [], high: highProblems || [] };
        }

        lastStatus = 'ok'; updateDot();
        console.log('[ZBX-SA] API: ' + critProblems.length + ' CRITICAL (>' + thresholdCrit + 'min) + ' + highProblems.length + ' HIGH (>' + thresholdHigh + 'min) UNACK');
        return { critical: critProblems, high: highProblems };
    }

    // =====================================================================
    // LÓGICA PRINCIPAL
    // =====================================================================
    async function check() {
        if (!isEnabled) return;

        const { critical, high } = await getProblems();
        let newCritNames = [];
        let newHighNames = [];

        // Procesar CRITICAL
        for (const p of critical) {
            if (alertedIds.has(p.eventid)) continue;
            if (shouldAlert(p.name, criticalFilter, critExceptions)) {
                newCritNames.push(p.name);
                alertedIds.add(p.eventid);
                console.log('[ZBX-SA] 🔴 CRITICAL: ' + p.name + ' (' + p.eventid + ')');
            }
        }

        // Procesar HIGH
        for (const p of high) {
            if (alertedIds.has(p.eventid)) continue;
            if (shouldAlert(p.name, highFilter, highExceptions)) {
                newHighNames.push(p.name);
                alertedIds.add(p.eventid);
                console.log('[ZBX-SA] 🟠 HIGH: ' + p.name + ' (' + p.eventid + ')');
            }
        }

        // Lanzar alarma (Critical tiene prioridad)
        if (newCritNames.length > 0) {
            startAlarm('critical', newCritNames);
        } else if (newHighNames.length > 0) {
            startAlarm('high', newHighNames);
        }

        // Limpiar IDs antiguos
        if (alertedIds.size > 500) alertedIds = new Set([...alertedIds].slice(-200));
        localStorage.setItem('zbx_sa_ids', JSON.stringify([...alertedIds]));
    }

    function startLoop() { stopLoop(); check(); intervalHandle = setInterval(check, 30000); }
    function stopLoop()  { if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; } }

    // =====================================================================
    // UI
    // =====================================================================
    function updateDot() {
        const d = document.getElementById('zbx-sa-dot'); if (!d) return;
        if (!isEnabled) { d.style.background = '#888'; return; }
        if (!audioUnlocked) { d.style.background = '#ff9800'; return; }
        d.style.background = lastStatus === 'ok' ? '#4CAF50' : lastStatus === 'error' ? '#f44336' : '#ff9800';
    }

    function inject() {
        if (document.getElementById('zbx-sa-fab')) return;

        // FAB
        const fab = document.createElement('div');
        fab.id = 'zbx-sa-fab';
        fab.setAttribute('style', 'position:fixed!important;bottom:24px!important;right:24px!important;z-index:2147483646!important;width:56px!important;height:56px!important;border-radius:50%!important;background:#1a1a2e!important;color:#fff!important;font-size:26px!important;cursor:pointer!important;box-shadow:0 4px 16px rgba(0,0,0,0.5)!important;display:flex!important;align-items:center!important;justify-content:center!important;border:2px solid #444!important;user-select:none!important;');
        fab.innerHTML = '<span id="zbx-sa-icon" style="pointer-events:none">' + (isEnabled ? '🔔' : '🔕') + '</span>';
        const dot = document.createElement('div');
        dot.id = 'zbx-sa-dot';
        dot.setAttribute('style', 'position:absolute!important;top:2px!important;right:2px!important;width:12px!important;height:12px!important;border-radius:50%!important;border:2px solid #1a1a2e!important;background:#ff9800!important;pointer-events:none!important;');
        fab.appendChild(dot);

        // PANEL
        const panel = document.createElement('div');
        panel.id = 'zbx-sa-panel';
        panel.setAttribute('style', 'display:none;position:fixed!important;bottom:90px!important;right:24px!important;z-index:2147483646!important;width:380px!important;background:#1a1a2e!important;border:1px solid #555!important;border-radius:10px!important;padding:20px!important;box-shadow:0 8px 32px rgba(0,0,0,0.6)!important;color:#eee!important;font-family:Arial,sans-serif!important;font-size:13px!important;max-height:80vh!important;overflow-y:auto!important;');

        const inputStyle = 'width:100%;padding:7px 10px;border:1px solid #555;border-radius:4px;background:#111;color:#fff;font-size:13px;box-sizing:border-box';
        const labelStyle = 'font-size:11px;font-weight:bold;color:#aaa;text-transform:uppercase;margin-bottom:4px;letter-spacing:0.5px';
        const hintStyle = 'color:#666;font-size:11px;margin-top:2px';
        const sectionStyle = 'margin-bottom:14px';

        panel.innerHTML =
            '<div style="margin:0 0 14px;font-size:16px;font-weight:bold;color:#fff;border-bottom:1px solid #444;padding-bottom:10px">🔔 Zabbix Sound Alerts v8</div>' +

            // Audio warning
            '<div id="zbx-sa-audio-warn" style="display:' + (audioUnlocked ? 'none' : 'block') + ';margin-bottom:10px;padding:8px;background:rgba(255,150,0,0.2);border:1px solid rgba(255,150,0,0.4);border-radius:4px;font-size:12px;color:#fa0">⚠️ <b>Audio bloqueado</b> — Haz click en la página para desbloquearlo.</div>' +

            // Info
            '<div style="margin-bottom:10px;padding:8px;background:rgba(71,150,196,0.15);border-radius:4px;font-size:11px;color:#8bc;border:1px solid rgba(71,150,196,0.3)">ℹ️ Solo alerta problemas <b>UNACKNOWLEDGED</b>. La alarma <b>no para</b> hasta pulsar el botón.</div>' +

            // === SECCIÓN HIGH ===
            '<div style="margin:16px 0 6px;font-size:13px;font-weight:bold;color:#ff9800;border-bottom:1px solid #444;padding-bottom:6px">🟠 CONFIGURACIÓN HIGH</div>' +

            '<div style="' + sectionStyle + '">' +
                '<div style="' + labelStyle + '">⏱ Umbral HIGH (minutos)</div>' +
                '<input id="zbx-sa-inp-thr-high" type="number" min="1" max="1440" value="' + thresholdHigh + '" style="' + inputStyle + '">' +
                '<div style="' + hintStyle + '">Alerta HIGH si lleva activo más de este tiempo</div>' +
            '</div>' +

            '<div style="' + sectionStyle + '">' +
                '<div style="' + labelStyle + '">🔍 Filtro HIGH (separar con comas, vacío = todas)</div>' +
                '<input id="zbx-sa-inp-hf" type="text" value="' + highFilter + '" placeholder="if_stat, error_53" style="' + inputStyle + '">' +
                '<div style="' + hintStyle + '">Solo alertará HIGH cuyo nombre contenga alguno de estos</div>' +
            '</div>' +

            '<div style="' + sectionStyle + '">' +
                '<div style="' + labelStyle + '">🚫 Excepciones HIGH (separar con comas)</div>' +
                '<input id="zbx-sa-inp-he" type="text" value="' + highExceptions + '" placeholder="if_error, mem_free" style="' + inputStyle + '">' +
                '<div style="' + hintStyle + '">NUNCA alertará HIGH cuyo nombre contenga alguno de estos</div>' +
            '</div>' +

            // === SECCIÓN CRITICAL ===
            '<div style="margin:16px 0 6px;font-size:13px;font-weight:bold;color:#f44336;border-bottom:1px solid #444;padding-bottom:6px">🔴 CONFIGURACIÓN CRITICAL</div>' +

            '<div style="' + sectionStyle + '">' +
                '<div style="' + labelStyle + '">⏱ Umbral CRITICAL (minutos)</div>' +
                '<input id="zbx-sa-inp-thr-crit" type="number" min="1" max="1440" value="' + thresholdCrit + '" style="' + inputStyle + '">' +
                '<div style="' + hintStyle + '">Alerta CRITICAL si lleva activo más de este tiempo</div>' +
            '</div>' +

            '<div style="' + sectionStyle + '">' +
                '<div style="' + labelStyle + '">🔍 Filtro CRITICAL (separar con comas, vacío = todas)</div>' +
                '<input id="zbx-sa-inp-cf" type="text" value="' + criticalFilter + '" placeholder="Server Down, DB crash" style="' + inputStyle + '">' +
                '<div style="' + hintStyle + '">Solo alertará CRITICAL cuyo nombre contenga alguno de estos</div>' +
            '</div>' +

            '<div style="' + sectionStyle + '">' +
                '<div style="' + labelStyle + '">🚫 Excepciones CRITICAL (separar con comas)</div>' +
                '<input id="zbx-sa-inp-ce" type="text" value="' + critExceptions + '" placeholder="backup_warn, test_" style="' + inputStyle + '">' +
                '<div style="' + hintStyle + '">NUNCA alertará CRITICAL cuyo nombre contenga alguno de estos</div>' +
            '</div>' +

            // === BOTONES ===
            '<div style="display:flex;gap:6px;margin-top:16px">' +
                '<button id="zbx-sa-save" style="flex:1;padding:9px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold;background:#4796c4;color:#fff">💾 Guardar</button>' +
                '<button id="zbx-sa-toggle" style="flex:1;padding:9px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold;background:' + (isEnabled ? '#4CAF50' : '#f44336') + ';color:#fff">' + (isEnabled ? '✅ ON' : '❌ OFF') + '</button>' +
            '</div>' +
            '<div style="display:flex;gap:6px;margin-top:10px">' +
                '<button id="zbx-sa-tc" style="flex:1;padding:6px;border:none;border-radius:4px;cursor:pointer;font-size:11px;background:#333;color:#ccc">🚨 Test CRIT</button>' +
                '<button id="zbx-sa-th" style="flex:1;padding:6px;border:none;border-radius:4px;cursor:pointer;font-size:11px;background:#333;color:#ccc">⚠️ Test HIGH</button>' +
                '<button id="zbx-sa-tr" style="flex:1;padding:6px;border:none;border-radius:4px;cursor:pointer;font-size:11px;background:#333;color:#ccc">🗑 Reset</button>' +
            '</div>';

        document.documentElement.appendChild(fab);
        document.documentElement.appendChild(panel);
        console.log('%c[ZBX-SA] ✅ BOTÓN INYECTADO', 'color:lime;font-size:14px;font-weight:bold');

        // === EVENTOS ===
        fab.addEventListener('click', e => {
            e.stopPropagation(); unlockAudio();
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', e => {
            if (panel.style.display === 'block' && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target))
                panel.style.display = 'none';
        });

        // Guardar
        document.getElementById('zbx-sa-save').addEventListener('click', () => {
            const th = parseInt(document.getElementById('zbx-sa-inp-thr-high').value);
            const tc = parseInt(document.getElementById('zbx-sa-inp-thr-crit').value);
            if (th >= 1) { thresholdHigh = th; localStorage.setItem('zbx_sa_thr_high', th); }
            if (tc >= 1) { thresholdCrit = tc; localStorage.setItem('zbx_sa_thr_crit', tc); }

            highFilter = document.getElementById('zbx-sa-inp-hf').value;
            criticalFilter = document.getElementById('zbx-sa-inp-cf').value;
            highExceptions = document.getElementById('zbx-sa-inp-he').value;
            critExceptions = document.getElementById('zbx-sa-inp-ce').value;

            localStorage.setItem('zbx_sa_high_filter', highFilter);
            localStorage.setItem('zbx_sa_crit_filter', criticalFilter);
            localStorage.setItem('zbx_sa_high_except', highExceptions);
            localStorage.setItem('zbx_sa_crit_except', critExceptions);

            panel.style.display = 'none';
            console.log('[ZBX-SA] Config guardada: HIGH>' + thresholdHigh + 'min, CRIT>' + thresholdCrit + 'min, HF="' + highFilter + '", CF="' + criticalFilter + '", HE="' + highExceptions + '", CE="' + critExceptions + '"');
            if (isEnabled) startLoop();
        });

        // Toggle
        document.getElementById('zbx-sa-toggle').addEventListener('click', () => {
            isEnabled = !isEnabled;
            localStorage.setItem('zbx_sa_enabled', JSON.stringify(isEnabled));
            const b = document.getElementById('zbx-sa-toggle');
            b.style.background = isEnabled ? '#4CAF50' : '#f44336';
            b.textContent = isEnabled ? '✅ ON' : '❌ OFF';
            document.getElementById('zbx-sa-icon').textContent = isEnabled ? '🔔' : '🔕';
            isEnabled ? startLoop() : stopLoop();
            updateDot();
        });

        // Tests
        document.getElementById('zbx-sa-tc').addEventListener('click', () => { unlockAudio(); startAlarm('critical', ['TEST: Problema de prueba CRITICAL']); });
        document.getElementById('zbx-sa-th').addEventListener('click', () => { unlockAudio(); startAlarm('high', ['TEST: Problema de prueba HIGH']); });
        document.getElementById('zbx-sa-tr').addEventListener('click', () => {
            alertedIds.clear(); localStorage.setItem('zbx_sa_ids', '[]');
            console.log('[ZBX-SA] IDs reseteados');
        });

        updateDot();
    }

    // =====================================================================
    // INIT
    // =====================================================================
    function tryInject() {
        if (document.getElementById('zbx-sa-fab')) {
            if (isEnabled && !intervalHandle) startLoop();
            return;
        }
        inject();
        if (isEnabled) setTimeout(startLoop, 2000);
    }

    if (document.documentElement) tryInject();
    document.addEventListener('DOMContentLoaded', tryInject);
    window.addEventListener('load', tryInject);
    setTimeout(tryInject, 1000);
    setTimeout(tryInject, 3000);
    setTimeout(tryInject, 5000);
})();