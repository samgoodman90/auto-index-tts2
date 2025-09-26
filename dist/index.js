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
        volume: 1.0,
        ref_base_url: 'http://127.0.0.1:7860/gradio_api/file='
    };

    // Tracks the latest expression we’ve seen from ST (via events or console sniffing)

    // ---- UI ----
    const settingsTemplate = `
    <div class="inline-drawer tts_queue_settings_container">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Auto Index TTS2</b>
            <div class="inline-drawer-icon fa-solid fa-chevron-down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="flex-container flexFlowColumn" style="gap:.5rem">
                <label>IndexTTS Base URL <input id="tts_base_url" type="text" placeholder="http://127.0.0.1:7860"></label>
                <label>Reference File Path <input id="tts_ref_path" type="text" placeholder="/tmp/gradio/..../reference-audio.mp3"></label>
                <div class="flex-container" style="gap:1rem;flex-wrap:wrap">
                    <label>Volume <input id="tts_volume" type="range" min="0" max="1" step="0.01"></label>
                </div>
                <hr>
                <div><b>Emotion Vectors</b> <span style="opacity:.8"></span></div>
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
                    <button id="tts_test_say" class="menu_button">Test: say "This is a Test Message"</button>
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
        el('tts_ref_path').value = s.refPath;
        el('tts_volume').value = String(s.volume);
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
        bind('tts_ref_path','refPath');
        bind('tts_volume','volume','number');
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
            await speakQuotes(['This is a Test Message']);
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
        hint.textContent = `Base URL: ${s.baseUrl}.`;
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
                return msg.mes;
            }
        }
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
            console.log(`[TTS-Queue] using MANUAL/DEFAULT vector for seq ${seq}`);

            // Fire POST ASAP (non-blocking)
            pushJob(text, hash).catch(err => {
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
    function buildPushBody(text, hashForText){
        const s = getSettings();

        return {
            data: [
                "Use emotion vectors",
                {
                    path: s.refPath || null,
                    url: s.ref_base_url + s.refPath || null,
                    orig_name: s.refUrl ? s.refUrl.split('/').pop() : "reference.mp3",
                    size: null,
                    mime_type: "audio/mpeg",
                    meta: { _type: "gradio.FileData" }
                },
                text,
                null,
                s.emotionWeight,
                s.happy,
                s.angry,
                s.sad,
                s.afraid,
                s.disgusted,
                s.melancholic,
                s.surprised,
                s.calm,
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

            console.log("[TTS-Queue] message received");
            const text = getLastCharacterMessage();
            console.log("[TTS-Queue] text:", text);

            await handleMessage(text);
        });
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

    async function pushJob(text, hash){
        const s = getSettings();
        const url = s.baseUrl.replace(/\/+$/,'') + '/gradio_api/queue/join/';

        const body = buildPushBody(text, hash.toString());
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
