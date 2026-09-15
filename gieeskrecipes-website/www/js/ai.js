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

function sendAIMessage(prompt) {
  prompt = (prompt || '').trim();
  if (!prompt) return;

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
      appendMessage("Sorry, the chef is having trouble responding right now. Please try again in a moment.", 'bot');
    })
    .finally(function () {
      setAIChefSending(false);
      if (input) input.focus();
    });
}

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
