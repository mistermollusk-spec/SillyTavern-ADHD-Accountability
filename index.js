import { getContext } from '../../extensions.js';
import { eventSource, event_types } from '../../script.js';
import { executeSlashCommands } from '../../slash-commands/SlashCommandParser.js';

// --- PASTE YOUR DISCORD WEBHOOK URL HERE ---
const DISCORD_WEBHOOK_URL = "YOUR_WEBHOOK_URL_HERE";

let activeDeadline = null;
let taskName = "";
let currentStage = 1;
const avatarStorageKey = 'Accountability_Avatars';
let avatarMap = JSON.parse(localStorage.getItem(avatarStorageKey) || '{}');

async function sendDiscordWebhook(charName, text) {
    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL === "https://discord.com/api/webhooks/1542955556061454417/zU2Lsn4YbMz9rNT5P1cInvPVd11D7fD1LvBioMGrkOIjSNTOiWPiOL7YdQ8JhLR7N7v-") return;
    
    // Globally strip all XML timer tags so your phone notification is clean
    const cleanText = text.replace(/<timer[^>]*>/gi, '').replace(/<done>/gi, '').trim();
    if (!cleanText) return;

    const payload = { content: cleanText, username: charName };
    if (avatarMap[charName]) payload.avatar_url = avatarMap[charName];

    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Discord Webhook Error:", err);
    }
}

// Hook cleanly into SillyTavern's native message event
eventSource.on(event_types.MESSAGE_RECEIVED, async (messageId) => {
    const context = getContext();
    const chat = context.chat;
    const msg = chat[messageId];

    if (!msg || msg.is_user) return; 

    let modified = false;
    
    // Regex looking for the new XML tags
    const timerRegex = /<timer\s+mins="(\d+)"\s+task="([^"]+)">/i;
    const doneRegex = /<done>/i;

    if (timerRegex.test(msg.mes)) {
        const match = msg.mes.match(timerRegex);
        activeDeadline = Date.now() + (parseInt(match[1]) * 60000);
        taskName = match[2];
        currentStage = 1;
        modified = true;
        console.log(`TIMER STARTED: "${taskName}" for ${match[1]} minutes.`);
    }

    if (doneRegex.test(msg.mes)) {
        activeDeadline = null;
        taskName = "";
        modified = true;
        console.log("TIMER STOPPED.");
    }

    if (modified) {
        // Strip the tags from the visual UI
        msg.mes = msg.mes.replace(/<timer[^>]*>/gi, '').replace(/<done>/gi, '').trim();
        
        setTimeout(() => {
            const msgEl = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
            if (msgEl) msgEl.innerHTML = msg.mes; 
        }, 300);
    }

    // Fire to Discord
    await sendDiscordWebhook(msg.name, msg.mes);
});

// Background Timer Loop
setInterval(() => {
    if (!activeDeadline) return;

    const now = new Date();
    const minutesLeft = Math.round((activeDeadline - now.getTime()) / 60000);
    
    let newStage = currentStage;
    if (minutesLeft <= 0 && currentStage < 4) newStage = 4;
    else if (minutesLeft <= 15 && currentStage < 3) newStage = 3;
    else if (minutesLeft <= 45 && currentStage < 2) newStage = 2;

    if (newStage !== currentStage) {
        currentStage = newStage;
        const timeMsg = minutesLeft > 0 ? `${minutesLeft} minutes left` : "the deadline has passed";
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const sysNote = `/sys [System Note (Real-World Time: ${timeStr}): The user has ${timeMsg} for "${taskName}". This is a Tier ${newStage} accountability alert. Generate a proactive, urgent message to apply pressure, staying strictly in character.] | /gen`;
        
        executeSlashCommands(sysNote);
    }
}, 10000);