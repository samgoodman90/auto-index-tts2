(()=>{
    const MODULE_NAME = 'ttsQueue';
    const DEFAULTS = {
        baseUrl: 'http://127.0.0.1:7860',
        sessionHash: 'SillyTavern',
        refPath: '',
        refUrl: '',
        useEmotionVectors: true,
        emotionWeight: 0.65,
        happy: 0.4,
        angry: 0.0,
        sad: 0.0,
        afraid: 0.0,
        disgusted: 0.0,
        melancholic: 0.0,
        surprised: 0.0,
        calm: 0.0,
        speed: 1.0,
        autoSpeak: true,
        onlyQuoted: true,
        volume: 1.0,
        // Auto emotion
        autoEmotionFromExpression: true,
        // Max time to wait for expression after message render (ms)
        expressionSettleMs: 300
    };

    // Tracks the latest expression we’ve seen from ST (via events or console sniffing)
    let lastExpression = null;
    let lastExpressionAt = 0; // timestamp (ms) of last update

    // ---- UI ----
    const settingsTemplate = `
    <div class="inline-drawer tts_queue_settings_container">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>🎙️ TTS Queue (Gradio)</b>
            <div class="inline-drawer-icon fa-solid fa-chevron-down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="flex-container flexFlowColumn" style="gap:.5rem">
                <label>Base URL <input id="tts_base_url" type="text" placeholder="http://127.0.0.1:7860"></label>
                <label>Session Hash <input id="tts_session_hash" type="text" placeholder="SillyTavern"></label>
                <label>Reference File Path <input id="tts_ref_path" type="text" placeholder="/tmp/gradio/....mp3"></label>
                <label>Reference File URL <input id="tts_ref_url" type="text" placeholder="http://127.0.0.1:7860/gradio_api/file=.../Vei.mp3"></label>
                <div class="flex-container" style="gap:1rem;flex-wrap:wrap">
                    <label><input id="tts_auto" type="checkbox"> Auto speak new replies</label>
                    <label><input id="tts_only_quoted" type="checkbox"> Only speak quoted text</label>
                    <label><input id="tts_auto_emotion" type="checkbox"> Auto emotion from expression</label>
                </div>
                <div class="flex-container" style="gap:1rem;flex-wrap:wrap">
                    <label>Volume <input id="tts_volume" type="range" min="0" max="1" step="0.01"></label>
                    <label title="Max time to wait after message render for an expression update (via events or console)">
                        Expression settle (ms)
                        <input id="tts_expr_settle_ms" type="number" min="0" step="50">
                    </label>
                </div>
                <hr>
                <div><b>Emotion Vectors</b> <span style="opacity:.8">(used if auto emotion is off or no expression found)</span></div>
                <div class="flex-container" style="gap:.75rem;flex-wrap:wrap">
                    <label>Weight <input id="tts_emotion_weight" type="number" min="0" max="1" step="0.01"></label>
                    <label>Happy <input id="tts_happy" type="number" min="0" max="1" step="0.01"></label>
                    <label>Angry <input id="tts_angry" type="number" min="0" max="1" step="0.01"></label>
                    <label>Sad <input id="tts_sad" type="number" min="0" max="1" step="0.01"></label>
                    <label>Afraid <input id="tts_afraid" type="number" min="0" max="1" step="0.01"></label>
                    <label>Disgusted <input id="tts_disgusted" type="number" min="0" max="1" step="0.01"></label>
                    <label>Melancholic <input id="tts_melancholic" type="number" min="0" max="1" step="0.01"></label>
                    <label>Surprised <input id="tts_surprised" type="number" min="0" max="1" step="0.01"></label>
                    <label>Calm <input id="tts_calm" type="number" min="0" max="1" step="0.01"></label>
                </div>
                <div class="flex-container" style="gap:.5rem;flex-wrap:wrap">
                    <button id="tts_test_say" class="menu_button">Test: say "Hello i am Bella!"</button>
                    <button id="tts_say_last" class="menu_button">Speak last assistant reply</button>
                </div>
                <div class="hint" id="tts_hint" style="opacity:.8"></div>
            </div>
        </div>
    </div>`;

    function getCtx() {
        return SillyTavern.getContext();
    }

    function getSettings() {
        const ctx = getCtx();
        const global = ctx.extensionSettings || ctx.extension_settings || {};
        if (!global[MODULE_NAME]) {
            global[MODULE_NAME] = Object.assign({}, DEFAULTS);
        } else {
            // ensure keys
            for (const k in DEFAULTS) if (global[MODULE_NAME][k] === undefined) global[MODULE_NAME][k] = DEFAULTS[k];
        }
        return global[MODULE_NAME];
    }

    function saveSettings() {
        const { saveSettingsDebounced } = getCtx();
        saveSettingsDebounced();
        renderHint();
    }

    function el(id){ return document.getElementById(id); }

    function renderSettingsUI() {
        const container = document.getElementById('tts_queue_settings_container') || document.getElementById('extensions_settings');
        if (!container) return;
        const tpl = document.createElement('template');
        tpl.innerHTML = settingsTemplate;
        container.appendChild(tpl.content);

        const s = getSettings();
        // Bind inputs
        el('tts_base_url').value = s.baseUrl;
        el('tts_session_hash').value = s.sessionHash;
        el('tts_ref_path').value = s.refPath;
        el('tts_ref_url').value = s.refUrl;
        el('tts_auto').checked = s.autoSpeak;
        el('tts_only_quoted').checked = s.onlyQuoted;
        el('tts_auto_emotion').checked = s.autoEmotionFromExpression;
        el('tts_volume').value = String(s.volume);
        el('tts_expr_settle_ms').value = String(s.expressionSettleMs);
        el('tts_emotion_weight').value = String(s.emotionWeight);
        el('tts_happy').value = String(s.happy);
        el('tts_angry').value = String(s.angry);
        el('tts_sad').value = String(s.sad);
        el('tts_afraid').value = String(s.afraid);
        el('tts_disgusted').value = String(s.disgusted);
        el('tts_melancholic').value = String(s.melancholic);
        el('tts_surprised').value = String(s.surprised);
        el('tts_calm').value = String(s.calm);

        const bind = (id, key, type='text') => {
            el(id).addEventListener('input', () => {
                const s = getSettings();
                s[key] = type==='checkbox' ? el(id).checked :
                         type==='number' ? parseFloat(el(id).value||'0') :
                         el(id).value;
                saveSettings();
            });
        };
        bind('tts_base_url','baseUrl');
        bind('tts_session_hash','sessionHash');
        bind('tts_ref_path','refPath');
        bind('tts_ref_url','refUrl');
        bind('tts_auto','autoSpeak','checkbox');
        bind('tts_only_quoted','onlyQuoted','checkbox');
        bind('tts_auto_emotion','autoEmotionFromExpression','checkbox');
        bind('tts_volume','volume','number');
        bind('tts_expr_settle_ms','expressionSettleMs','number');
        bind('tts_emotion_weight','emotionWeight','number');
        bind('tts_happy','happy','number');
        bind('tts_angry','angry','number');
        bind('tts_sad','sad','number');
        bind('tts_afraid','afraid','number');
        bind('tts_disgusted','disgusted','number');
        bind('tts_melancholic','melancholic','number');
        bind('tts_surprised','surprised','number');
        bind('tts_calm','calm','number');

        el('tts_test_say').addEventListener('click', async ()=>{
            await speakQuotes(['Hello i am Bella!']);
        });
        el('tts_say_last').addEventListener('click', async ()=>{
            const text = getLastAssistantText();
            if (text) await handleMessage(text);
        });

        renderHint();
    }

    function renderHint() {
        const s = getSettings();
        const hint = el('tts_hint');
        if (!hint) return;
        const on = s.autoSpeak ? 'ON' : 'OFF';
        const emoOn = s.autoEmotionFromExpression ? 'ON' : 'OFF';
        const last = lastExpression ?? '—';
        hint.textContent = `Auto-speak: ${on}. Auto-emotion: ${emoOn}. Settle: ${s.expressionSettleMs}ms. Base URL: ${s.baseUrl}. Session: ${s.sessionHash}. Last expression: ${last}`;
    }

    // ---- Message/DOM helpers ----
    function extractQuoted(text, onlyQuoted) {
        const quotes = [];
        const re = /"([^"]+)"|“([^”]+)”/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            let q = (m[1] || m[2] || "").trim();
            q = q.replaceAll("*", "");
            q = q.replace(/[^a-zA-Z0-9\s,.\-''"?!]/g, "");
            if (q.startsWith(",")) q = q.slice(1).trim();
            if (q.endsWith(",")) q = q.slice(0, -1).trim();
            if (q) quotes.push(q);
        }
        if (!onlyQuoted && quotes.length === 0 && text?.trim()) {
            quotes.push(text.trim());
        }
        return quotes;
    }

    function getLastAssistantText(){
        const nodes = Array.from(document.querySelectorAll('.mes, .assistant, .assistantMessage, .mes_text'));
        for (let i=nodes.length-1;i>=0;i--){
            const n = nodes[i];
            const txt = n.innerText || n.textContent || '';
            if (txt && txt.length>1) return txt;
        }
        return null;
    }

    function getLastCharacterMessage() {
        const ctx = SillyTavern.getContext();
        if (!ctx || !ctx.chat) return null;
        for (let i = ctx.chat.length - 1; i >= 0; i--) {
            const msg = ctx.chat[i];
            if (!msg.is_user) {  // character reply
                const expr = (msg?.extra && (msg.extra.expression || msg.extra.emotion)) ||
                             msg?.expression || msg?.emotion || null;
                if (expr) setLastExpression(expr, 'msg');
                return msg.mes;
            }
        }
        return null;
    }

    // ---- Expression tracking (events + console sniffing) ----
    function setLastExpression(expr, source='unknown'){
        if (!expr) return;
        lastExpression = String(expr).trim();
        lastExpressionAt = Date.now();
        console.log("[TTS-Queue] expression update ("+source+"): ", lastExpression);
        renderHint();
    }

    // Monkey-patch console methods once to sniff expression logs from other extensions.
    function patchConsoleForExpression(){
        if (window.__ttsQueueConsolePatched) return;
        window.__ttsQueueConsolePatched = true;

        const methods = ['log','info','warn'];
        const orig = {};
        methods.forEach(m=>{
            orig[m] = console[m].bind(console);
            console[m] = function(...args){
                try{
                    const text = args.map(a=>{
                        if (typeof a === 'string') return a;
                        try { return JSON.stringify(a); } catch { return String(a); }
                    }).join(' ');

                    // specific fuzzy-search pattern
                    let m1 = /fuzzy\s*search\s*found:\s*([a-zA-Z _-]+?)\s+as\s+closest/i.exec(text);
                    if (m1 && m1[1]) {
                        setLastExpression(m1[1], 'console:fuzzy');
                    } else {
                        // generic "expression: value"
                        let m2 = /\b(expression|emotion)\s*[:=]\s*([a-zA-Z _-]+)/i.exec(text);
                        if (m2 && m2[2]) setLastExpression(m2[2], 'console:generic');
                    }
                }catch(_){}
                return orig[m](...args);
            };
        });
    }

    // Wait up to N ms for an expression update AFTER now; resolves early if one comes in.
    function awaitExpressionSettle(maxMs){
        const s = getSettings();
        if (!s.autoEmotionFromExpression || !maxMs || maxMs <= 0) {
            console.log("[TTS-Queue] expression settle: skipped (autoEmotion=", !!s.autoEmotionFromExpression, ", maxMs=", maxMs, ")");
            return Promise.resolve();
        }
        const start = Date.now();
        const lastAtSnapshot = lastExpressionAt;

        return new Promise(resolve=>{
            const check = ()=>{
                if (lastExpressionAt > lastAtSnapshot) {
                    console.log("[TTS-Queue] expression settle: early expression detected after", Date.now()-start, "ms →", lastExpression);
                    return resolve();
                }
                const elapsed = Date.now() - start;
                if (elapsed >= maxMs) {
                    console.log("[TTS-Queue] expression settle: timeout at", elapsed, "ms; proceeding with", lastExpression ?? "no expression");
                    return resolve();
                }
                setTimeout(check, 25);
            };
            console.log("[TTS-Queue] expression settle: waiting up to", maxMs, "ms for late expression...");
            check();
        });
    }

    // ---- Expression → Emotion mapping ----
    function mapExpressionToEmotions(exprRaw){
        const s = getSettings();
        if (!s.autoEmotionFromExpression || !exprRaw) return null;

        const expr = String(exprRaw).toLowerCase().trim();
        const Z = { happy:0, angry:0, sad:0, afraid:0, disgusted:0, melancholic:0, surprised:0, calm:0 };

        const table = {
            'neutral':           { ...Z, calm: 0.5 },
            'calm':              { ...Z, calm: 1.0 },
            'happy':             { ...Z, happy: 0.9, calm: 0.2 },
            'smile':             { ...Z, happy: 0.7, calm: 0.2 },
            'smirk':             { ...Z, happy: 0.5, disgusted: 0.1, calm: 0.2 },
            'laugh':             { ...Z, happy: 1.0, surprised: 0.2 },
            'excited':           { ...Z, happy: 0.9, surprised: 0.4 },
            'surprised':         { ...Z, surprised: 1.0 },
            'shock':             { ...Z, surprised: 0.9, afraid: 0.4 },
            'angry':             { ...Z, angry: 1.0 },
            'annoyed':           { ...Z, angry: 0.5, disgusted: 0.2 },
            'disgust':           { ...Z, disgusted: 1.0 },
            'sad':               { ...Z, sad: 0.9, melancholic: 0.6 },
            'cry':               { ...Z, sad: 1.0, melancholic: 0.7 },
            'melancholic':       { ...Z, melancholic: 1.0 },
            'afraid':            { ...Z, afraid: 1.0 },
            'nervous':           { ...Z, afraid: 0.6, surprised: 0.3 },
            'shy':               { ...Z, calm: 0.3, melancholic: 0.3, afraid: 0.2 },
            'embarrassed':       { ...Z, surprised: 0.4, sad: 0.2, calm: 0.1 },
            'thinking':          { ...Z, calm: 0.6, melancholic: 0.2 },
            'serious':           { ...Z, calm: 0.6, angry: 0.2 },
            'stern':             { ...Z, calm: 0.5, angry: 0.3 },
            'sleepy':            { ...Z, calm: 0.8, melancholic: 0.2 },
            // aliases / extras
            'caring':            { ...Z, happy: 0.4, calm: 0.5, melancholic: 0.2 },
            'concerned':         { ...Z, calm: 0.4, melancholic: 0.3, sad: 0.2 },
            'teasing':           { ...Z, happy: 0.5, surprised: 0.2 },
        };

        if (table[expr]) return table[expr];

        if (expr.includes('happy') || expr.includes('joy')) return table['happy'];
        if (expr.includes('laugh') || expr.includes('lol')) return table['laugh'];
        if (expr.includes('smile') || expr.includes('grin')) return table['smile'];
        if (expr.includes('angry') || expr.includes('anger') || expr.includes('rage')) return table['angry'];
        if (expr.includes('annoy') || expr.includes('irrit')) return table['annoyed'];
        if (expr.includes('sad') || expr.includes('blue')) return table['sad'];
        if (expr.includes('cry') || expr.includes('tears')) return table['cry'];
        if (expr.includes('afraid') || expr.includes('fear') || expr.includes('scared')) return table['afraid'];
        if (expr.includes('disgust')) return table['disgust'];
        if (expr.includes('surpris') || expr.includes('shock')) return table['surprised'];
        if (expr.includes('calm') || expr.includes('neutral')) return table['neutral'];
        if (expr.includes('think') || expr.includes('pensive')) return table['thinking'];
        if (expr.includes('serious') || expr.includes('stern')) return table['serious'];
        if (expr.includes('sleep')) return table['sleepy'];
        if (expr.includes('care') || expr.includes('concern')) return table['caring'];

        return null;
    }

    // helper to print vectors nicely
    function formatVec(V){
        return `happy=${V.happy}, angry=${V.angry}, sad=${V.sad}, afraid=${V.afraid}, disgusted=${V.disgusted}, melancholic=${V.melancholic}, surprised=${V.surprised}, calm=${V.calm}`;
    }

    // ---- Ordered TTS pipeline (producer/consumer) ----
    const ttsPipeline = (() => {
        let nextSeq = 0;
        let playSeq = 0;
        const results = new Map(); // seq -> { url, vec }
        let playing = false;

        async function enqueue(text) {
            const seq = nextSeq++;
            const hash = quoteHash();

            const exprSnapshot = lastExpression; // snapshot for logs
            const vec = mapExpressionToEmotions(exprSnapshot);

            if (vec) {
                console.log(`[TTS-Queue] using EXPRESSION vector (expr="${exprSnapshot}") for seq ${seq}: ${formatVec(vec)}`);
            } else {
                console.log(`[TTS-Queue] using MANUAL/DEFAULT vector for seq ${seq}`);
            }

            // Fire POST ASAP (non-blocking)
            pushJob(text, hash, { vec, expr: exprSnapshot }).catch(err => {
                console.error("[TTS-Queue] pushJob failed seq:", seq, err);
                results.set(seq, { url: null, vec });
                tryStart();
            });

            // When result is ready, buffer it
            (async () => {
                try {
                    const url = await awaitResult(hash);
                    console.log("[TTS-Queue] result ready seq:", seq, "url:", url);
                    results.set(seq, { url, vec });
                    tryStart();
                } catch (err) {
                    console.error("[TTS-Queue] awaitResult failed seq:", seq, err);
                    results.set(seq, { url: null, vec });
                    tryStart();
                }
            })();
        }

        function tryStart(){
            if (!playing && results.has(playSeq)) {
                playLoop();
            }
        }

        async function playLoop(){
            if (playing) return;
            playing = true;
            try {
                while (results.has(playSeq)) {
                    const { url } = results.get(playSeq);
                    results.delete(playSeq);
                    const nowPlaying = playSeq;
                    playSeq++;

                    if (!url) {
                        console.warn("[TTS-Queue] skipping failed item seq:", nowPlaying);
                        continue;
                    }

                    console.log("[TTS-Queue] playing seq:", nowPlaying, "url:", url);
                    await playAudio(url, getSettings().volume); // waits for 'ended'
                    console.log("[TTS-Queue] finished seq:", nowPlaying);
                }
            } finally {
                playing = false;
                if (results.has(playSeq)) tryStart();
            }
        }

        function reset(){
            nextSeq = 0;
            playSeq = 0;
            results.clear();
            playing = false;
        }

        return { enqueue, reset };
    })();

    // --- Gradio Queue client ---
    function buildPushBody(text, hashForText, vecOverride, exprName){
        const s = getSettings();
        const V = {
            happy:        vecOverride?.happy        ?? s.happy,
            angry:        vecOverride?.angry        ?? s.angry,
            sad:          vecOverride?.sad          ?? s.sad,
            afraid:       vecOverride?.afraid       ?? s.afraid,
            disgusted:    vecOverride?.disgusted    ?? s.disgusted,
            melancholic:  vecOverride?.melancholic  ?? s.melancholic,
            surprised:    vecOverride?.surprised    ?? s.surprised,
            calm:         vecOverride?.calm         ?? s.calm,
        };

        // Clear, single-line log of what we're sending
        const source = vecOverride ? `EXPRESSION"${exprName ?? ''}"` : "MANUAL/DEFAULT";
        console.log(`[TTS-Queue] TTS payload emotion source: ${source} | weight=${s.emotionWeight} | ${formatVec(V)}`);

        return {
            data: [
                s.useEmotionVectors ? "Use emotion vectors" : "",
                {
                    path: s.refPath || null,
                    url: s.refUrl || null,
                    orig_name: s.refUrl ? s.refUrl.split('/').pop() : "reference.mp3",
                    size: null,
                    mime_type: "audio/mpeg",
                    meta: { _type: "gradio.FileData" }
                },
                text,
                null,
                s.emotionWeight,
                V.happy,
                V.angry,
                V.sad,
                V.afraid,
                V.disgusted,
                V.melancholic,
                V.surprised,
                V.calm,
                "",
                false,
                120,
                true,
                0.8,
                30,
                0.8,
                0,
                3,
                10,
                1500
            ],
            event_data: null,
            fn_index: 6,
            trigger_id: 7,
            session_hash: hashForText
        };
    }

    function setupAutoHook(){
        const { event_types, eventSource } = getCtx();

        // Capture expression from message itself if provided, then wait briefly for late expression logs, then speak.
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async function (eventData) {
            const s = getSettings();
            if (!s.autoSpeak) return;

            try {
                const evExpr = eventData?.expression || eventData?.emotion || eventData?.data?.expression || null;
                if (evExpr) setLastExpression(evExpr, 'event:render');
            } catch(_) {}

            console.log("[TTS-Queue] message received");
            const text = getLastCharacterMessage();
            console.log("[TTS-Queue] text:", text);

            // Wait briefly for expression updates that may arrive AFTER render (from other extensions)
            await awaitExpressionSettle(s.expressionSettleMs);

            await handleMessage(text);
        });

        // Dedicated expression-change event if your build has it
        if (event_types?.CHARACTER_EXPRESSION_CHANGED) {
            eventSource.on(event_types.CHARACTER_EXPRESSION_CHANGED, function (eventData) {
                try {
                    const evExpr = eventData?.expression || eventData?.emotion || eventData?.data?.expression || eventData || null;
                    if (evExpr) setLastExpression(evExpr, 'event:expr');
                } catch(_) {}
            });
        }
    }

    async function handleMessage(fullText){
        if (!fullText) return;
        const s = getSettings();
        const quotes = extractQuoted(fullText, s.onlyQuoted);
        console.log("[TTS-Queue] quotes:", quotes, "quotelength:", quotes.length);
        if (!quotes.length) return;

        await speakQuotes(quotes);
    }

    // Synthesize in parallel; play in order
    async function speakQuotes(quotes){
        for (const q of quotes) {
            ttsPipeline.enqueue(q);
        }
    }

    async function pushJob(text, hash, meta){
        const s = getSettings();
        const url = s.baseUrl.replace(/\/+$/,'') + '/gradio_api/queue/join/';
        const vecOverride = meta?.vec ?? null;
        const exprName = meta?.expr ?? null;

        const body = buildPushBody(text, hash.toString(), vecOverride, exprName);
        console.log("[TTS-Queue] sending POST with Body:", JSON.stringify(body), "hash:", hash);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Push failed: ' + res.status);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function awaitResult(hash) {
        const s = getSettings();
        const url = s.baseUrl.replace(/\/+$/, '') + '/gradio_api/queue/data?session_hash=' + encodeURIComponent(hash);
        await sleep(200);
        console.log("[TTS-Queue] sending GET with hash:", url);

        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error('Queue data failed: ' + res.status);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });

                const lines = chunk.split('\n')
                    .map(l => l.trim())
                    .filter(l => l.startsWith('data: '))
                    .map(l => l.slice(6));

                for (const line of lines) {
                    try {
                        const obj = JSON.parse(line);
                        console.log("[TTS-Queue] Got SSE data:", obj);
                        if (obj.msg === 'process_completed' && obj.output?.data?.[0]?.value?.url) {
                            const audioUrl = obj.output.data[0].value.url;
                            try { await reader.cancel(); } catch {}
                            return audioUrl;
                        }
                    } catch (e) {
                        // ignore malformed JSON
                    }
                }
            }
        } finally {
            try { await reader.cancel(); } catch {}
        }

        throw new Error('No audio URL in process_completed');
    }

    function playAudio(url, volume){
        return new Promise((resolve, reject)=>{
            console.log("TTS starting audio construction url:", url, "volume:", volume);
            const audio = new Audio(url);
            audio.volume = Math.max(0, Math.min(1, volume||1));
            audio.addEventListener('ended', resolve, { once: true });
            audio.addEventListener('error', ()=>reject(new Error('Audio playback error')), { once: true });
            console.log("TTS playing audio");
            audio.play().catch(reject);
        });
    }

    function quoteHash() {
        // 10-digit-ish random for session_hash uniqueness
        return Math.floor(1e9 + Math.random() * 9e9);
    }

    // Init
    (function init(){
        try{
            renderSettingsUI();
            setupAutoHook();
            patchConsoleForExpression();
            const { saveSettingsDebounced } = getCtx();
            saveSettingsDebounced();
            console.log('[TTS Queue] initialized');
        }catch(e){
            console.error('[TTS Queue] init failed', e);
        }
    })();
})();
