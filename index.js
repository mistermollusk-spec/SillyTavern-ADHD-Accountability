import { executeSlashCommands } from '../../../slash-commands/SlashCommandParser.js';
import { getContext } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';

// --- PASTE YOUR DISCORD WEBHOOK URL HERE ---
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1542955556061454417/zU2Lsn4YbMz9rNT5P1cInvPVd11D7fD1LvBioMGrkOIjSNTOiWPiOL7YdQ8JhLR7N7v-";

let activeDeadline = null;
let taskName = "";
let currentStage = 1;

// Stores custom Discord avatars per character in your local browser storage
const avatarStorageKey = 'Accountability_Avatars';
let avatarMap = JSON.parse(localStorage.getItem(avatarStorageKey) || '{}');

async function sendDiscordWebhook(charName, text) {
    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL === "YOUR_WEBHOOK_URL_HERE") return;
    
    const cleanText = text.replace(/\[SET_TIMER:[^\]]*\]/gi, '').replace(/\[TASK_DONE\]/gi, '').trim();
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
eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
    const context = getContext();
    const chat = context.chat;
    const msg = chat[messageId];

    if (!msg || msg.is_user) return; // Only process AI messages

    let modified = false;

    const timerRegex = /\[SET_TIMER:\s*(\d+)\s*\|\s*(.*?)\]/i;
    if (timerRegex.test(msg.mes)) {
        const match = msg.mes.match(timerRegex);
        activeDeadline = Date.now() + (parseInt(match[1]) * 60000);
        taskName = match[2];
        currentStage = 1;
        msg.mes = msg.mes.replace(timerRegex, "").trim();
        modified = true;
    }

    const doneRegex = /\[TASK_DONE\]/i;
    if (doneRegex.test(msg.mes)) {
        activeDeadline = null;
        taskName = "";
        msg.mes = msg.mes.replace(doneRegex, "").trim();
        modified = true;
    }

    if (modified) {
        const msgEl = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
        if (msgEl) msgEl.innerHTML = msg.mes; 
    }

    sendDiscordWebhook(msg.name, msg.mes);
});

// Background Timer Loop (Checking the clock)
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
        
        // Injects real-world clock and calendar into the prompt
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString();

        const sysNote = `/sys [System Note (Real-World Time: ${timeStr} on ${dateStr}): The user has ${timeMsg} for "${taskName}". This is a Tier ${newStage} accountability alert. Generate a proactive, urgent message to apply social pressure, staying strictly in your character persona.] | /gen`;
        
        executeSlashCommands(sysNote);
    }
}, 10000);

// Dynamic Avatar Command setup
jQuery(async () => {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'setdiscordavatar',
        callback: (args, value) => {
            const context = getContext();
            if (!context.characters || !context.characters[context.characterId]) return "❌ No character selected.";
            
            const charName = context.characters[context.characterId].name;
            avatarMap[charName] = value.trim();
            localStorage.setItem(avatarStorageKey, JSON.stringify(avatarMap));
            
            return `✅ Avatar URL saved for ${charName}!`;
        },
        returns: 'string',
        helpString: 'Sets the Discord profile picture for the current character. Usage: /setdiscordavatar [Public Image URL]'
    }));
});