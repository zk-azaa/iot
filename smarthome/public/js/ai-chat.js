// Widget AI Assistant — dipakai di SEMUA halaman (satu sumber, tanpa duplikasi).
// Pesan dikirim ke /api/chat; API key Groq hanya ada di server (.env).
(() => {
  "use strict";

  const ENDPOINT = "/api/chat";
  const CHAT_KEY = "smarthome_ai_chat_v1";  
  const UI_KEY = "smarthome_ai_ui_v1";
  const MAX_STORED = 80; // pesan yang disimpan di browser
  const MAX_CONTEXT = 10; // pesan terakhir yang dikirim sebagai konteks
  const GREETING = "Halo! 👋 Ada yang bisa saya bantu untuk rumah pintar Anda?";

  const MARKUP = `
    <section class="ai-panel" id="aiPanel" aria-label="AI Assistant">
      <div class="ai-header">
        <div class="ai-title"><span class="ai-spark">✦</span><strong>AI Assistant</strong></div>
        <div class="ai-window-actions">
          <button id="minimizeChat" class="icon-button" type="button" aria-label="Minimalkan chat">−</button>
          <button id="closeChat" class="icon-button" type="button" aria-label="Tutup chat">×</button>
        </div>
      </div>
      <div class="chat-messages" id="chatMessages" aria-live="polite"></div>
      <form class="chat-form" id="chatForm">
        <input id="chatInput" type="text" placeholder="Ketik pesan..." autocomplete="off" aria-label="Ketik pesan untuk AI">
        <button class="mic-button" id="voiceButton" type="button" aria-label="Input suara" title="Input suara">
          <svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4m-4 0h8"/></svg>
        </button>
        <button class="send-button" type="submit" aria-label="Kirim pesan">
          <svg viewBox="0 0 24 24"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/></svg>
        </button>
      </form>
      <p class="voice-note" id="voiceNote" role="status"></p>
    </section>
    <button class="ai-launcher" id="aiLauncher" type="button" aria-label="Buka AI Assistant"><span>✧</span></button>`;

  document.body.insertAdjacentHTML("beforeend", MARKUP);

  const $ = (id) => document.getElementById(id);
  const panel = $("aiPanel");
  const launcher = $("aiLauncher");
  const messages = $("chatMessages");
  const form = $("chatForm");
  const input = $("chatInput");
  const sendButton = form.querySelector(".send-button");
  const voiceButton = $("voiceButton");
  const voiceNote = $("voiceNote");

  // ---------- Penyimpanan (aman jika localStorage diblokir) ----------
  const store = {
    read(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* abaikan */
      }
    },
  };

  let history = store.read(CHAT_KEY, []);
  if (!Array.isArray(history)) history = [];

  const persist = () => store.write(CHAT_KEY, history.slice(-MAX_STORED));

  // ---------- Render pesan ----------
  // textContent (bukan innerHTML) agar teks pengguna/AI tidak dianggap HTML.
  function renderMessage(text, sender, { save = true } = {}) {
    const isUser = sender === "user";
    const row = document.createElement("div");
    row.className = `chat-row ${isUser ? "user-row" : "bot-row"}`;

    if (!isUser) {
      const avatar = document.createElement("span");
      avatar.className = "bot-avatar";
      avatar.textContent = "✧";
      row.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = `message ${isUser ? "user-message" : "bot-message"}`;
    bubble.textContent = text;
    row.appendChild(bubble);

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;

    if (save) {
      history.push({ text, sender });
      persist();
    }
    return row;
  }

  if (history.length) {
    history.forEach((m) =>
      renderMessage(String(m.text ?? ""), m.sender, { save: false }),
    );
  } else {
    renderMessage(GREETING, "bot");
  }

  // ---------- Status jendela: open | minimized | closed ----------
  function setMode(mode) {
    panel.classList.remove("hidden", "minimized");
    launcher.classList.remove("is-hidden");

    if (mode === "open") launcher.classList.add("is-hidden");
    else if (mode === "minimized") panel.classList.add("minimized");
    else panel.classList.add("hidden");

    store.write(UI_KEY, { mode });
  }

  setMode(store.read(UI_KEY, {}).mode || "open");

  $("minimizeChat").addEventListener("click", () => setMode("minimized"));
  $("closeChat").addEventListener("click", () => setMode("closed"));
  launcher.addEventListener("click", () => {
    setMode("open");
    input.focus();
  });

  // ---------- Kirim pesan ----------
  function setSending(sending) {
    sendButton.disabled = sending;
    input.disabled = sending;
  }

  function contextForServer() {
    return history
      .slice(-MAX_CONTEXT - 1, -1) // tanpa pesan yang baru saja dikirim
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: String(m.text ?? ""),
      }));
  }


  let isSpeaking = false;
  let afnaAwake = false;
  let afnaTimeout = null;


  // =========================
// Voice AFNA
// =========================

  let selectedVoice = null;

  function loadVoice() {

    const voices = speechSynthesis.getVoices();

    selectedVoice =
        voices.find(v =>
          v.name.includes("Google Bahasa Indonesia")
        )
    || voices.find(v =>
          v.name.includes("Female")
        )
    || voices.find(v =>
          v.name.includes("Zira")
        )
    || voices[0];

    
  }

  // browser kadang lambat load voice
  loadVoice();

  speechSynthesis.onvoiceschanged = () => {
    loadVoice();
  };


  function speak(text) {
    if (recognition) {
      recognition.stop();
    }

    speechSynthesis.cancel();

    isSpeaking = true;

    const utterance =
      new SpeechSynthesisUtterance(text);

    utterance.lang = "id-ID";

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = 1;
    utterance.pitch = 1.2;
    utterance.volume = 1;

    console.log(
      "Voice dipakai:",
      utterance.voice?.name
    );

    utterance.onend = () => {

      isSpeaking = false;

      setTimeout(() => {

        try {
          recognition.start();
        } catch {}

      }, 500);

    };

    speechSynthesis.speak(utterance);

  }

  function wakeAfna() {

    afnaAwake = true;

    clearTimeout(afnaTimeout);

    afnaTimeout = setTimeout(() => {

      afnaAwake = false;

      speak("Afna standby boss");

    }, 30000); // 30 detik

  }



  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    renderMessage(message, "user");
    input.value = "";
    setSending(true);

    const typing = renderMessage("Sedang berpikir...", "bot", { save: false });
    typing.querySelector(".message").classList.add("typing-message");

    try {
      const res = await fetch("http://localhost:3000/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: contextForServer() }),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();

      if (!res.ok || data.success === false) {
        throw new Error(data.error || `Permintaan gagal (${res.status})`);
      }
      renderMessage(String(data.reply ?? "Balasan AI kosong."), "bot");
    } catch (err) {
      typing.remove();
      renderMessage(`Maaf, AI belum bisa dihubungi. (${err.message})`, "bot", {
        save: false,
      });
    } finally {
      setSending(false);
      input.focus();
    }
  });

  // ---------- Input suara (Web Speech API) ----------
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "id-ID";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("start", () => {
      voiceButton.classList.add("listening");
      voiceNote.textContent = "Mendengarkan...";
    });
    recognition.addEventListener("result", async (e) => {

      if (isSpeaking) return;

      let transcript =
        e.results[e.results.length - 1][0].transcript.trim();

        console.log("Terdengar:", transcript);
      if (!transcript) return;

      //==========
      //wake word
      //==========
     const lowerText = transcript.toLowerCase();

      // jika belum aktif
      // jika belum aktif
if (!afnaAwake) {

    if (lowerText.includes("afna")) {

      wakeAfna();

      // hanya bilang "afna"
      if (
        lowerText.trim() === "afna"
      ) {

        speak(
          "Ya boss, ada yang bisa afna bantu?"
        );

        return;
      }

      // ada perintah setelah kata afna
      transcript = transcript
        .replace(/afna/gi, "")
        .trim();

    } else {

      return;

    }
  }

      // jika sudah aktif
      wakeAfna();

      renderMessage(transcript, "user");

      setSending(true);

      const typing = renderMessage(
        "Sedang berpikir...",
        "bot",
        { save: false }
      );

      try {

        const res = await fetch(
          "http://localhost:3000/api/agent",
          {
            method: "POST",
            headers: {
              "Content-Type":"application/json"
            },
            body: JSON.stringify({
              message: transcript,
              history: contextForServer()
            })
          }
        );

        const data =
          await res.json().catch(() => ({}));

        typing.remove();

        if (!res.ok) {
          throw new Error(
            data.error || "Server error"
          );
        }

        const reply =
          data.reply || "Tidak ada balasan.";

        renderMessage(reply, "bot");

        speak(reply);

      } catch (err) {

        typing.remove();

        renderMessage(
          "AI tidak dapat dihubungi.",
          "bot"
        );

      } finally {
        setSending(false);
      }

    });
    recognition.addEventListener("error", (e) => {
      voiceNote.textContent = `Input suara bermasalah: ${e.error}`;
    });
    recognition.addEventListener("end", () => {
      voiceButton.classList.remove("listening");
      if (!isSpeaking) {
        try {
          recognition.start();
        } catch {}
      }
    });
  } else {
    voiceButton.title = "Input suara tidak didukung browser ini";
  }

  voiceButton.addEventListener("click", () => {
    if (!recognition) {
      voiceNote.textContent =
        "Browser ini belum mendukung input suara. Coba Chrome atau Edge.";
      return;
    }
    try {
      voiceNote.textContent = "";
      recognition.start();
    } catch {
      voiceNote.textContent = "Mikrofon sedang digunakan atau belum siap.";
    }
  });

  window.addEventListener("load", () => {
    if (!recognition) return;
    setTimeout(() => {
      try {
        recognition.start();
      } catch {}
    }, 1000);

  });
})();
