import { getContext } from '../../extensions.js';
import { eventSource, event_types } from '../../script.js';
import { executeSlashCommands } from '../../slash-commands/SlashCommandParser.js';

// --- PASTE YOUR DISCORD WEBHOOK URL HERE ---
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1542955556061454417/zU2Lsn4YbMz9rNT5P1cInvPVd11D7fD1LvBioMGrkOIjSNTOiWPiOL7YdQ8JhLR7N7v-";

let activeDeadline = null;
let taskName = "";
let currentStage = 1;

async function sendDiscordWebhook(charName, text) {
    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL === "YOUR_WEBHOOK_URL_HERE") {
        console.warn("Discord Webhook URL is missing.");
        return;
    }
    
    // Strip ALL tags for the Discord push
    const cleanText = text.replace(/\[SET_TIMER:[^\]]*\]/gi, '').replace(/\[TASK_DONE\]/gi, '').trim();
    if (!cleanText) return;

    try {
        console.log("Attempting to send message to Discord...");
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: cleanText, username: charName })
        });
        console.log("Discord Webhook Status:", response.status);
    } catch (err) {
        console.error("Discord Webhook Error (Check your adblocker!):", err);
    }
}

// Hook cleanly into SillyTavern's native message event
eventSource.on(event_types.MESSAGE_RECEIVED, async (messageId) => {
    const context = getContext();
    const chat = context.chat;
    const msg = chat[messageId];

    if (!msg || msg.is_user) return; 

    let modified = false;
    
    // Find the first valid timer data
    const timerMatch = msg.mes.match(/\[SET_TIMER:\s*(\d+)\s*\|\s*(.*?)\]/i);
    if (timerMatch) {
        activeDeadline = Date.now() + (parseInt(timerMatch[1]) * 60000);
        taskName = timerMatch[2];
        currentStage = 1;
        modified = true;
        console.log(`TIMER STARTED: "${taskName}" for ${timerMatch[1]} minutes.`);
    }

    if (/\[TASK_DONE\]/i.test(msg.mes)) {
        activeDeadline = null;
        taskName = "";
        modified = true;
        console.log("TIMER STOPPED: Task completed.");
    }

    if (modified) {
        // Globally strip ALL duplicate tags from the saved chat message
        msg.mes = msg.mes.replace(/\[SET_TIMER:[^\]]*\]/gi, '').replace(/\[TASK_DONE\]/gi, '').trim();
        
        // Wait 500ms for SillyTavern to finish its own rendering, then safely overwrite it
        setTimeout(() => {
            const msgEl = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
            if (msgEl) {
                msgEl.innerHTML = msg.mes; 
            }
        }, 500);
    }

    // Fire to Discord
    await sendDiscordWebhook(msg.name, msg.mes);
});

// Background Timer Loop: Checks the clock every 10 seconds
setInterval(() => {
    if (!activeDeadline) return;

    const now = new Date();
    const minutesLeft = Math.round((activeDeadline - now.getTime()) / 60000);
    
    let newStage = currentStage;
    if (minutesLeft <= 0 && currentStage < 4) newStage = 4;
    else if (minutesLeft <= 15 && currentStage < 3) newStage = 3;
    else if (minutesLeft <= 45 && currentStage < 2) newStage = 2;

    if (newStage !== currentStage) {
        console.log(`TRIGGERING ESCALATION: Tier ${newStage} for "${taskName}"`);
        currentStage = newStage;
        const timeMsg = minutesLeft > 0 ? `${minutesLeft} minutes left` : "the deadline has passed";
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Independent API generation trigger
        const sysNote = `/sys [System Note (Real-World Time: ${timeStr}): The user has ${timeMsg} for "${taskName}". This is a Tier ${newStage} accountability alert. Generate a proactive, urgent message to apply pressure, staying strictly in character.] | /gen`;
        
        executeSlashCommands(sysNote);
    }
}, 10000);