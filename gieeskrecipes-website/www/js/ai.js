/* ═══════════════════════════════════════════
   GIEESKRECIPES — AI Chef Chat
   Calls the ai-chef-chat Supabase Edge Function,
   which proxies to the Claude API.
═══════════════════════════════════════════ */

const AI_CHEF_MAX_HISTORY = 10; // messages of context kept and sent
let aiChefHistory = []; // [{ role: 'user' | 'assistant', content: string }]

function appendMessage(text, role) {
  role = role || 'bot';
  var messages = document.getElementById('aiMessages');
  if (!messages) return;
  var msg = document.createElement('div');
  msg.className = 'ai-msg ' + role;
  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  msg.appendChild(bubble);
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
  return msg;
}

function showTyping() {
  var messages = document.getElementById('aiMessages');
  if (!messages) return null;
  var typing = document.createElement('div');
  typing.className = 'ai-msg bot';
  typing.id = 'typingIndicator';
  typing.innerHTML = '<div class="msg-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;
  return typing;
}

function removeTyping() {
  var el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function setAIChefSending(sending) {
  var input = document.getElementById('aiInput');
  var sendBtn = document.getElementById('aiSend');
  if (input) input.disabled = sending;
  if (sendBtn) sendBtn.disabled = sending;
}

// Calls the ai-chef-chat Edge Function (proxies to Claude API server-side,
// same sb.functions.invoke pattern as triggerEngagementNotification in
// community.js — keeps the Anthropic key off the client entirely).
async function fetchAIChefReply(message) {
  var sb = getSupabase();
  if (!sb) throw new Error('Supabase client not ready');

  var trimmedHistory = aiChefHistory.slice(-AI_CHEF_MAX_HISTORY);

  var res = await sb.functions.invoke('ai-chef-chat', {
    body: { message: message, history: trimmedHistory },
  });
  var data = res.data, error = res.error;

  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data.reply;
}

// AI Chef is a Gieesk Pro feature. The app checked this on its tab, but
// the website let anyone type — and the Edge Function itself didn't check
// at all, so the Anthropic key was effectively open to the internet. The
// function now refuses non-subscribers; this is the polite version of
// the same rule, so people see why instead of getting an error.
function aiChefLockMessage(reason) {
  var url = (typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com') + '/upgrade.html';
  var messages = document.getElementById('aiMessages');
  if (!messages) return;
  var msg = document.createElement('div');
  msg.className = 'ai-msg bot';
  msg.innerHTML = reason === 'signin'
    ? '<div class="msg-bubble">Sign in to cook with the AI Chef.</div>'
    : '<div class="msg-bubble">AI Chef is part of Gieesk Pro — unlimited cooking help, meal planning and advanced filters for $4.99 a month.'
      + ' <a href="' + url + '" target="_blank" rel="noopener" style="color:var(--gold);font-weight:700">See Gieesk Pro</a></div>';
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

async function aiChefAllowed() {
  if (typeof currentUser === 'undefined' || !currentUser) return 'signin';
  if (typeof isPremiumUser !== 'function') return 'ok';
  try {
    return (await isPremiumUser()) ? 'ok' : 'upgrade';
  } catch (e) {
    return 'ok'; // never block on a failed check; the function still enforces it
  }
}

async function sendAIMessage(prompt) {
  prompt = (prompt || '').trim();
  if (!prompt) return;

  var allowed = await aiChefAllowed();
  if (allowed !== 'ok') {
    var inputEl = document.getElementById('aiInput');
    if (inputEl) inputEl.value = '';
    appendMessage(prompt, 'user');
    aiChefLockMessage(allowed);
    return;
  }

  var input = document.getElementById('aiInput');
  if (input) input.value = '';

  appendMessage(prompt, 'user');
  aiChefHistory.push({ role: 'user', content: prompt });

  setAIChefSending(true);
  showTyping();

  fetchAIChefReply(prompt)
    .then(function (reply) {
      removeTyping();
      appendMessage(reply, 'bot');
      aiChefHistory.push({ role: 'assistant', content: reply });
    })
    .catch(function (err) {
      console.error('[GieesK] AI Chef error:', err);
      removeTyping();
      var text = String((err && err.message) || '');
      if (/sign in/i.test(text)) { aiChefLockMessage('signin'); return; }
      if (/pro|subscription/i.test(text)) { aiChefLockMessage('upgrade'); return; }
      appendMessage("Sorry, the chef is having trouble responding right now. Please try again in a moment.", 'bot');
    })
    .finally(function () {
      setAIChefSending(false);
      if (input) input.focus();
    });
}

// The website had no sign of Gieesk Pro at all: the chat box invited
// everyone to type and only failed at the end. This locks the composer
// and says what's going on, in the section itself.
async function applyAIChefGate() {
  const input = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSend');
  const messages = document.getElementById('aiMessages');
  if (!input || !messages) return;

  const allowed = await aiChefAllowed();
  const locked = allowed !== 'ok';
  document.getElementById('aiChefLock')?.remove();

  input.disabled = locked;
  if (sendBtn) sendBtn.disabled = locked;
  input.placeholder = locked
    ? (allowed === 'signin' ? 'Sign in to use the AI Chef' : 'AI Chef is part of Gieesk Pro')
    : 'Ask the chef anything…';
  if (!locked) return;

  const url = (typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com') + '/upgrade.html';
  const card = document.createElement('div');
  card.id = 'aiChefLock';
  card.className = 'ai-chef-lock';
  card.innerHTML = allowed === 'signin'
    ? `<i class="ti ti-lock"></i>
       <h3>Sign in to cook with the AI Chef</h3>
       <p>Unlimited cooking help comes with Gieesk Pro.</p>
       <button type="button" class="btn-gold" onclick="if(typeof openAuthModal==='function')openAuthModal('login')">Sign in</button>`
    : `<i class="ti ti-lock"></i>
       <h3>AI Chef is a Gieesk Pro feature</h3>
       <p>Unlimited AI cooking help, full meal planning and advanced dietary filters — $4.99 a month, cancel anytime.</p>
       <a class="btn-gold" href="${url}" target="_blank" rel="noopener">Upgrade to Pro</a>`;
  messages.appendChild(card);
}
window.applyAIChefGate = applyAIChefGate;

function initAI() {
  var input   = document.getElementById('aiInput');
  var sendBtn = document.getElementById('aiSend');

  if (!input || !sendBtn) {
    console.warn('AI Chat: input or send button not found');
    return;
  }

  // Send on button click
  sendBtn.addEventListener('click', function() {
    sendAIMessage(input.value);
  });

  // Send on Enter key
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendAIMessage(input.value);
    }
  });

  applyAIChefGate();

  // Suggestion chips — attach after a tick to make sure they exist
  setTimeout(function() {
    document.querySelectorAll('.ai-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var prompt = chip.dataset.prompt;
        if (!prompt) return;
        if (input) input.value = prompt;
        // Make sure AI section is visible
        var section = document.getElementById('ai-finder');
        if (section) {
          section.style.opacity = '1';
          section.style.transform = 'translateY(0)';
          section.scrollIntoView({ behavior: 'smooth' });
        }
        setTimeout(function() { sendAIMessage(prompt); }, 400);
      });
    });
  }, 100);
}
