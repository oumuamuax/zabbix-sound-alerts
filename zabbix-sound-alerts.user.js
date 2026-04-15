// ==UserScript==
// @name         Zabbix Sound Alerts
// @namespace    https://github.com/oumuamuax/zabbix-sound-alerts
// @version      9.0
// @description  Alertas sonoras para todos los niveles de severidad Zabbix + detección de alertas masivas
// @author       oumuamuax
// @match        *://xabbix.acens.priv/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    console.log('%c[ZBX-SA] v9.0 CARGADO', 'color:lime;font-size:16px;font-weight:bold');

    // =====================================================================
    // DEFINICIÓN DE SEVERIDADES
    // Zabbix: 0=Not classified, 1=Information, 2=Warning, 3=Average, 4=High, 5=Disaster
    // =====================================================================
    const SEV = {
        notclassified: { id: 0, key: 'nc',   label: 'Not Classified', emoji: '🔘', color: '#97AAB3', alarmType: 'low' },
        information:   { id: 1, key: 'info', label: 'Information',    emoji: '🔵', color: '#7499FF', alarmType: 'low' },
        warning:       { id: 2, key: 'warn', label: 'Warning',        emoji: '🟡', color: '#FFC859', alarmType: 'low' },
        average:       { id: 3, key: 'avg',  label: 'Average',        emoji: '🟤', color: '#FFA059', alarmType: 'medium' },
        high:          { id: 4, key: 'high', label: 'High',           emoji: '🟠', color: '#FF9800', alarmType: 'high' },
        critical:      { id: 5, key: 'crit', label: 'Critical',       emoji: '🔴', color: '#f44336', alarmType: 'critical' }
    };
    const SEV_LIST = Object.values(SEV);

    // =====================================================================
    // ESTADO — Cada severidad tiene: enabled, threshold, filter, exceptions
    // =====================================================================
    function loadCfg(key, def) { const v = localStorage.getItem('zbx_sa_' + key); return v !== null ? v : def; }
    function saveCfg(key, val) { localStorage.setItem('zbx_sa_' + key, val); }

    let isEnabled   = JSON.parse(loadCfg('enabled', 'true'));
    let alertedIds  = new Set(JSON.parse(loadCfg('ids', '[]')));
    let massiveThreshold = parseInt(loadCfg('massive_thr', '100'));
    let massiveAlerted   = false;

    // Config por severidad
    const sevCfg = {};
    for (const s of SEV_LIST) {
        const defaultEnabled = (s.id >= 4) ? 'true' : 'false'; // HIGH y CRITICAL activas por defecto
        const defaultThreshold = s.id === 5 ? '5' : '15';
        sevCfg[s.key] = {
            enabled:    JSON.parse(loadCfg(s.key + '_enabled', defaultEnabled)),
            threshold:  parseInt(loadCfg(s.key + '_thr', defaultThreshold)),
            filter:     loadCfg(s.key + '_filter', ''),
            exceptions: loadCfg(s.key + '_except', '')
        };
    }

    let intervalHandle = null;
    let alarmHandle    = null;
    let alarmActive    = false;
    let audioCtx       = null;
    let audioUnlocked  = false;
    let lastStatus     = 'idle';
    let pendingAlarm   = null;

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
                const w = document.getElementById('zbx-sa-audio-warn');
                if (w) w.style.display = 'none';
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

    // Sirena agresiva (critical/high)
    function playSiren(durationSec) {
        const c = getCtx(); if (c.state === 'suspended') c.resume();
        const now = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth'; g.gain.setValueAtTime(0.7, now);
        for (let i = 0; i < Math.ceil(durationSec / 0.6); i++) {
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

    // Tono medio (average)
    function playMediumTone(durationSec) {
        const c = getCtx(); if (c.state === 'suspended') c.resume();
        const now = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle'; g.gain.setValueAtTime(0.6, now);
        for (let i = 0; i < Math.ceil(durationSec / 0.8); i++) {
            const t = now + i * 0.8;
            o.frequency.setValueAtTime(500, t);
            o.frequency.linearRampToValueAtTime(900, t + 0.4);
            o.frequency.linearRampToValueAtTime(500, t + 0.8);
        }
        o.connect(g); g.connect(c.destination);
        o.start(now); o.stop(now + durationSec);
    }

    // Tono suave (warning/info/notclassified)
    function playLowTone(count) {
        const c = getCtx(); if (c.state === 'suspended') c.resume();
        for (let i = 0; i < count; i++) {
            const t = c.currentTime + i * 0.4;
            const o = c.createOscillator(), g = c.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(600, t);
            g.gain.setValueAtTime(0.5, t);
            g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + 0.35);
        }
    }

    // Alarma MASIVA — la más agresiva de todas
    function playMassiveSiren(durationSec) {
        const c = getCtx(); if (c.state === 'suspended') c.resume();
        const now = c.currentTime;
        // Doble oscilador para efecto más potente
        for (let j = 0; j < 2; j++) {
            const o = c.createOscillator(), g = c.createGain();
            o.type = j === 0 ? 'sawtooth' : 'square';
            g.gain.setValueAtTime(0.6, now);
            for (let i = 0; i < Math.ceil(durationSec / 0.3); i++) {
                const t = now + i * 0.3;
                o.frequency.setValueAtTime(400 + j * 200, t);
                o.frequency.linearRampToValueAtTime(1600 + j * 200, t + 0.15);
                o.frequency.linearRampToValueAtTime(400 + j * 200, t + 0.3);
            }
            o.connect(g); g.connect(c.destination);
            o.start(now); o.stop(now + durationSec);
        }
    }

    // =====================================================================
    // ALARMA CONTINUA
    // =====================================================================
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
            switch(type) {
                case 'massive':
                    playMassiveSiren(3);
                    setTimeout(() => playBeeps(12), 3100);
                    alarmHandle = setTimeout(loop, 6000);
                    break;
                case 'critical':
                    playSiren(2.5);
                    setTimeout(() => playBeeps(8), 2600);
                    alarmHandle = setTimeout(loop, 5500);
                    break;
                case 'high':
                    playSiren(1.5);
                    setTimeout(() => playBeeps(5), 1600);
                    alarmHandle = setTimeout(loop, 4000);
                    break;
                case 'medium':
                    playMediumTone(1.5);
                    setTimeout(() => playBeeps(3), 1600);
                    alarmHandle = setTimeout(loop, 5000);
                    break;
                default: // low
                    playLowTone(4);
                    alarmHandle = setTimeout(loop, 6000);
                    break;
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
    function getOverlayConfig(type) {
        switch(type) {
            case 'massive':  return { bg:'rgba(120,0,180,0.92)', icon:'💥', title:'¡¡ ALERTA MASIVA !!', subtitle:'Se han superado el umbral de alertas totales' };
            case 'critical': return { bg:'rgba(200,0,0,0.9)',    icon:'🚨', title:'¡¡ ALERTA CRITICAL !!', subtitle:null };
            case 'high':     return { bg:'rgba(200,100,0,0.9)',  icon:'⚠️', title:'¡¡ ALERTA HIGH !!', subtitle:null };
            case 'medium':   return { bg:'rgba(180,120,0,0.85)', icon:'🟤', title:'¡¡ ALERTA AVERAGE !!', subtitle:null };
            default:         return { bg:'rgba(80,80,120,0.85)', icon:'🔔', title:'¡¡ ALERTA !!', subtitle:null };
        }
    }

    function showStopOverlay(type, problemNames, needsUnlock) {
        if (document.getElementById('zbx-sa-stop-overlay')) return;
        const cfg = getOverlayConfig(type);
        const namesList = (problemNames || []).map(n =>
            '<div style="background:rgba(0,0,0,0.3);padding:6px 12px;border-radius:4px;margin:3px 0;font-size:16px">' + n + '</div>'
        ).join('');
        const overlay = document.createElement('div');
        overlay.id = 'zbx-sa-stop-overlay';
        overlay.setAttribute('style', 'position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;background:' + cfg.bg + '!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;');
        overlay.innerHTML =
            '<div style="font-size:80px;margin-bottom:20px;animation:zbx-pulse 0.5s infinite alternate">' + cfg.icon + '</div>' +
            '<div style="color:#fff;font-size:42px;font-weight:bold;text-align:center;margin-bottom:10px;text-shadow:2px 2px 4px rgba(0,0,0,0.5)">' + cfg.title + '</div>' +
            (cfg.subtitle ? '<div style="color:#fff;font-size:20px;margin-bottom:15px;opacity:0.9">' + cfg.subtitle + '</div>' : '') +
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
                setTimeout(() => { if (pendingAlarm) { const {type:t,names:n} = pendingAlarm; pendingAlarm = null; startAlarm(t, n); } }, 200);
            } else { stopAlarm(); }
        });
    }

    function hideStopOverlay() {
        const el = document.getElementById('zbx-sa-stop-overlay'); if (el) el.remove();
        const st = document.getElementById('zbx-sa-stop-style'); if (st) st.remove();
    }

    // =====================================================================
    // FILTROS Y EXCEPCIONES
    // =====================================================================
    function matchesList(name, csv) {
        if (!csv || csv.trim() === '') return false;
        const terms = csv.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
        if (terms.length === 0) return false;
        const lower = name.toLowerCase();
        return terms.some(term => lower.includes(term));
    }

    function shouldAlert(name, filterCsv, exceptionCsv) {
        if (matchesList(name, exceptionCsv)) return false;
        if (filterCsv && filterCsv.trim() !== '' && !matchesList(name, filterCsv)) return false;
        return true;
    }

    // =====================================================================
    // DETECCIÓN DE ALERTAS MASIVAS (lee "Displaying X to Y of Z found" del DOM)
    // =====================================================================
    function checkMassiveAlerts() {
        // Buscar el texto "Displaying ... of N found" en la página
        const body = document.body ? document.body.innerText : '';
        const match = body.match(/Displaying\s+\d+\s+to\s+\d+\s+of\s+(\d+)\s+found/i);
        if (match) {
            const total = parseInt(match[1]);
            console.log('[ZBX-SA] Displaying total: ' + total + ' (umbral masivo: ' + massiveThreshold + ')');
            if (total >= massiveThreshold && !massiveAlerted) {
                massiveAlerted = true;
                console.log('%c[ZBX-SA] 💥 ALERTA MASIVA: ' + total + ' alertas detectadas!', 'color:magenta;font-size:16px;font-weight:bold');
                startAlarm('massive', [total + ' alertas activas detectadas en pantalla', 'Umbral configurado: ' + massiveThreshold]);
            }
        }
    }

    // =====================================================================
    // ZABBIX API — UNA LLAMADA POR CADA SEVERIDAD ACTIVA
    // =====================================================================
    function apiUrl() { return window.location.origin + '/api_jsonrpc.php'; }

    async function fetchProblems(severities, thresholdMinutes) {
        const now = Math.floor(Date.now() / 1000);
        const body = {
            jsonrpc: '2.0', method: 'problem.get', id: 1,
            params: {
                output: ['eventid', 'objectid', 'clock', 'name', 'severity', 'acknowledged'],
                source: 0, object: 0,
                severities: severities,
                acknowledged: false, suppressed: false,
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

    async function getAllProblems() {
        const calls = [];
        const callMeta = [];

        for (const s of SEV_LIST) {
            const cfg = sevCfg[s.key];
            if (!cfg.enabled) continue;
            calls.push(fetchProblems([s.id], cfg.threshold));
            callMeta.push(s);
        }

        if (calls.length === 0) return {};

        const results = await Promise.all(calls);
        const grouped = {};
        let hasError = false;

        for (let i = 0; i < results.length; i++) {
            const s = callMeta[i];
            if (results[i] === null) { hasError = true; grouped[s.key] = []; }
            else { grouped[s.key] = results[i]; }
        }

        lastStatus = hasError ? 'error' : 'ok';
        updateDot();

        const summary = callMeta.map((s, i) => s.label + ':' + (results[i] ? results[i].length : '?') + '(>' + sevCfg[s.key].threshold + 'm)').join(', ');
        console.log('[ZBX-SA] API UNACK: ' + summary);

        return grouped;
    }

    // =====================================================================
    // LÓGICA PRINCIPAL
    // =====================================================================
    async function check() {
        if (!isEnabled) return;

        // 1. Comprobar alertas masivas (DOM)
        checkMassiveAlerts();

        // 2. Comprobar por severidad (API)
        const grouped = await getAllProblems();

        // Procesar en orden de prioridad: critical > high > average > warning > info > notclassified
        const priorityOrder = ['crit', 'high', 'avg', 'warn', 'info', 'nc'];
        let triggered = false;

        for (const key of priorityOrder) {
            if (triggered) break;
            const problems = grouped[key];
            if (!problems || problems.length === 0) continue;

            const cfg = sevCfg[key];
            const sev = SEV_LIST.find(s => s.key === key);
            const newNames = [];

            for (const p of problems) {
                if (alertedIds.has(p.eventid)) continue;
                if (shouldAlert(p.name, cfg.filter, cfg.exceptions)) {
                    newNames.push(p.name);
                    alertedIds.add(p.eventid);
                    console.log('[ZBX-SA] ' + sev.emoji + ' ' + sev.label.toUpperCase() + ': ' + p.name + ' (' + p.eventid + ')');
                }
            }

            if (newNames.length > 0) {
                startAlarm(sev.alarmType, newNames);
                triggered = true;
            }
        }

        // Limpiar IDs
        if (alertedIds.size > 500) alertedIds = new Set([...alertedIds].slice(-200));
        saveCfg('ids', JSON.stringify([...alertedIds]));
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

    function buildSeveritySection(s) {
        const cfg = sevCfg[s.key];
        const inputStyle = 'width:100%;padding:6px 8px;border:1px solid #555;border-radius:4px;background:#111;color:#fff;font-size:12px;box-sizing:border-box';
        const labelStyle = 'font-size:10px;font-weight:bold;color:#aaa;text-transform:uppercase;margin-bottom:3px;letter-spacing:0.5px';
        const hintStyle = 'color:#555;font-size:10px;margin-top:1px';

        return '<div style="margin:12px 0 4px;padding:8px;background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:6px">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
                '<span style="font-size:13px;font-weight:bold;color:' + s.color + '">' + s.emoji + ' ' + s.label.toUpperCase() + '</span>' +
                '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:#aaa">' +
                    '<input type="checkbox" id="zbx-sa-chk-' + s.key + '" ' + (cfg.enabled ? 'checked' : '') + ' style="cursor:pointer;width:16px;height:16px">' +
                    ' Activado' +
                '</label>' +
            '</div>' +
            '<div id="zbx-sa-sec-' + s.key + '" style="' + (cfg.enabled ? '' : 'opacity:0.4;pointer-events:none') + '">' +
                '<div style="margin-bottom:8px">' +
                    '<div style="' + labelStyle + '">⏱ Umbral (minutos)</div>' +
                    '<input id="zbx-sa-thr-' + s.key + '" type="number" min="1" max="1440" value="' + cfg.threshold + '" style="' + inputStyle + '">' +
                '</div>' +
                '<div style="margin-bottom:8px">' +
                    '<div style="' + labelStyle + '">🔍 Filtro (comas, vacío=todas)</div>' +
                    '<input id="zbx-sa-fil-' + s.key + '" type="text" value="' + cfg.filter + '" placeholder="nombre1, nombre2" style="' + inputStyle + '">' +
                '</div>' +
                '<div>' +
                    '<div style="' + labelStyle + '">🚫 Excepciones (comas)</div>' +
                    '<input id="zbx-sa-exc-' + s.key + '" type="text" value="' + cfg.exceptions + '" placeholder="excluir1, excluir2" style="' + inputStyle + '">' +
                '</div>' +
            '</div>' +
        '</div>';
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
        panel.setAttribute('style', 'display:none;position:fixed!important;bottom:90px!important;right:24px!important;z-index:2147483646!important;width:400px!important;max-height:85vh!important;overflow-y:auto!important;background:#1a1a2e!important;border:1px solid #555!important;border-radius:10px!important;padding:20px!important;box-shadow:0 8px 32px rgba(0,0,0,0.6)!important;color:#eee!important;font-family:Arial,sans-serif!important;font-size:13px!important;');

        let sectionsHtml = '';
        // Orden visual: Critical, High, Average, Warning, Information, Not Classified
        const visualOrder = [SEV.critical, SEV.high, SEV.average, SEV.warning, SEV.information, SEV.notclassified];
        for (const s of visualOrder) {
            sectionsHtml += buildSeveritySection(s);
        }

        panel.innerHTML =
            '<div style="margin:0 0 12px;font-size:16px;font-weight:bold;color:#fff;border-bottom:1px solid #444;padding-bottom:10px">🔔 Zabbix Sound Alerts v9</div>' +

            '<div id="zbx-sa-audio-warn" style="display:' + (audioUnlocked ? 'none' : 'block') + ';margin-bottom:8px;padding:6px 8px;background:rgba(255,150,0,0.2);border:1px solid rgba(255,150,0,0.4);border-radius:4px;font-size:11px;color:#fa0">⚠️ <b>Audio bloqueado</b> — Haz click en la página para desbloquearlo.</div>' +

            '<div style="margin-bottom:8px;padding:6px 8px;background:rgba(71,150,196,0.15);border-radius:4px;font-size:10px;color:#8bc;border:1px solid rgba(71,150,196,0.3)">ℹ️ Solo alerta problemas <b>UNACKNOWLEDGED</b>. La alarma <b>no para</b> hasta pulsar el botón.</div>' +

            // MASIVA
            '<div style="margin:10px 0 4px;padding:8px;background:rgba(120,0,180,0.1);border:1px solid rgba(120,0,180,0.3);border-radius:6px">' +
                '<div style="font-size:13px;font-weight:bold;color:#b060e0;margin-bottom:6px">💥 ALERTA MASIVA</div>' +
                '<div style="font-size:10px;font-weight:bold;color:#aaa;text-transform:uppercase;margin-bottom:3px">Umbral de alertas totales en pantalla</div>' +
                '<input id="zbx-sa-massive-thr" type="number" min="10" max="99999" value="' + massiveThreshold + '" style="width:100%;padding:6px 8px;border:1px solid #555;border-radius:4px;background:#111;color:#fff;font-size:12px;box-sizing:border-box">' +
                '<div style="color:#555;font-size:10px;margin-top:1px">Si "Displaying X of <b>N</b> found" supera este número → alarma masiva</div>' +
            '</div>' +

            // SECCIONES POR SEVERIDAD
            sectionsHtml +

            // BOTONES
            '<div style="display:flex;gap:6px;margin-top:14px">' +
                '<button id="zbx-sa-save" style="flex:1;padding:9px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold;background:#4796c4;color:#fff">💾 Guardar</button>' +
                '<button id="zbx-sa-toggle" style="flex:1;padding:9px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold;background:' + (isEnabled ? '#4CAF50' : '#f44336') + ';color:#fff">' + (isEnabled ? '✅ ON' : '❌ OFF') + '</button>' +
            '</div>' +
            '<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">' +
                '<button id="zbx-sa-t-massive" style="flex:1;min-width:70px;padding:5px;border:none;border-radius:4px;cursor:pointer;font-size:10px;background:#333;color:#ccc">💥 Test Masiva</button>' +
                '<button id="zbx-sa-t-crit" style="flex:1;min-width:70px;padding:5px;border:none;border-radius:4px;cursor:pointer;font-size:10px;background:#333;color:#ccc">🔴 Test Crit</button>' +
                '<button id="zbx-sa-t-high" style="flex:1;min-width:70px;padding:5px;border:none;border-radius:4px;cursor:pointer;font-size:10px;background:#333;color:#ccc">🟠 Test High</button>' +
                '<button id="zbx-sa-t-med" style="flex:1;min-width:70px;padding:5px;border:none;border-radius:4px;cursor:pointer;font-size:10px;background:#333;color:#ccc">🟤 Test Avg</button>' +
                '<button id="zbx-sa-t-low" style="flex:1;min-width:70px;padding:5px;border:none;border-radius:4px;cursor:pointer;font-size:10px;background:#333;color:#ccc">🟡 Test Low</button>' +
                '<button id="zbx-sa-tr" style="flex:1;min-width:70px;padding:5px;border:none;border-radius:4px;cursor:pointer;font-size:10px;background:#333;color:#ccc">🗑 Reset</button>' +
            '</div>';

        document.documentElement.appendChild(fab);
        document.documentElement.appendChild(panel);
        console.log('%c[ZBX-SA] ✅ BOTÓN INYECTADO', 'color:lime;font-size:14px;font-weight:bold');

        // === CHECKBOX TOGGLE para habilitar/deshabilitar secciones ===
        for (const s of SEV_LIST) {
            const chk = document.getElementById('zbx-sa-chk-' + s.key);
            const sec = document.getElementById('zbx-sa-sec-' + s.key);
            if (chk && sec) {
                chk.addEventListener('change', () => {
                    sec.style.opacity = chk.checked ? '1' : '0.4';
                    sec.style.pointerEvents = chk.checked ? 'auto' : 'none';
                });
            }
        }

        // === EVENTOS ===
        fab.addEventListener('click', e => {
            e.stopPropagation(); unlockAudio();
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', e => {
            if (panel.style.display === 'block' && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target))
                panel.style.display = 'none';
        });

        // GUARDAR
        document.getElementById('zbx-sa-save').addEventListener('click', () => {
            // Masiva
            const mt = parseInt(document.getElementById('zbx-sa-massive-thr').value);
            if (mt >= 10) { massiveThreshold = mt; saveCfg('massive_thr', mt); }
            massiveAlerted = false;

            // Cada severidad
            for (const s of SEV_LIST) {
                const cfg = sevCfg[s.key];
                const chk = document.getElementById('zbx-sa-chk-' + s.key);
                const thr = document.getElementById('zbx-sa-thr-' + s.key);
                const fil = document.getElementById('zbx-sa-fil-' + s.key);
                const exc = document.getElementById('zbx-sa-exc-' + s.key);

                cfg.enabled = chk ? chk.checked : cfg.enabled;
                const t = thr ? parseInt(thr.value) : cfg.threshold;
                if (t >= 1) cfg.threshold = t;
                cfg.filter = fil ? fil.value : cfg.filter;
                cfg.exceptions = exc ? exc.value : cfg.exceptions;

                saveCfg(s.key + '_enabled', JSON.stringify(cfg.enabled));
                saveCfg(s.key + '_thr', cfg.threshold);
                saveCfg(s.key + '_filter', cfg.filter);
                saveCfg(s.key + '_except', cfg.exceptions);
            }

            panel.style.display = 'none';
            const summary = SEV_LIST.map(s => s.label + ':' + (sevCfg[s.key].enabled ? '✅>' + sevCfg[s.key].threshold + 'm' : '❌')).join(', ');
            console.log('[ZBX-SA] Config guardada: ' + summary + ', Masiva>' + massiveThreshold);
            if (isEnabled) startLoop();
        });

        // TOGGLE GENERAL
        document.getElementById('zbx-sa-toggle').addEventListener('click', () => {
            isEnabled = !isEnabled;
            saveCfg('enabled', JSON.stringify(isEnabled));
            const b = document.getElementById('zbx-sa-toggle');
            b.style.background = isEnabled ? '#4CAF50' : '#f44336';
            b.textContent = isEnabled ? '✅ ON' : '❌ OFF';
            document.getElementById('zbx-sa-icon').textContent = isEnabled ? '🔔' : '🔕';
            isEnabled ? startLoop() : stopLoop();
            updateDot();
        });

        // TESTS
        document.getElementById('zbx-sa-t-massive').addEventListener('click', () => { unlockAudio(); startAlarm('massive', ['TEST: Alerta masiva simulada']); });
        document.getElementById('zbx-sa-t-crit').addEventListener('click', () => { unlockAudio(); startAlarm('critical', ['TEST: Critical']); });
        document.getElementById('zbx-sa-t-high').addEventListener('click', () => { unlockAudio(); startAlarm('high', ['TEST: High']); });
        document.getElementById('zbx-sa-t-med').addEventListener('click', () => { unlockAudio(); startAlarm('medium', ['TEST: Average']); });
        document.getElementById('zbx-sa-t-low').addEventListener('click', () => { unlockAudio(); startAlarm('low', ['TEST: Warning/Info']); });
        document.getElementById('zbx-sa-tr').addEventListener('click', () => {
            alertedIds.clear(); saveCfg('ids', '[]');
            massiveAlerted = false;
            console.log('[ZBX-SA] IDs y estado masivo reseteados');
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