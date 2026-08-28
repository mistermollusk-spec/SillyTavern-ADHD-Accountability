import { executeSlashCommands } from '../../../slash-commands/SlashCommandParser.js';
import { getContext } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';

let currentStage = 1;
let activeDeadline = null;
let taskName = "";
let lastNotifiedMsgId = null; // Tracks messages to prevent duplicate phone alerts

// --- PASTE YOUR DISCORD WEBHOOK URL HERE ---
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1542951488576294983/p1qhSQZDbop8EAnESGaas_TCP4NYm2AGFgJjAbLg3Pj48YyEKBpwT5RLHlQj1xfWheG0";

async function pushToPhone(charName, text) {
    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL === "YOUR_WEBHOOK_URL_HERE") return;
    
    // Strip out the hidden timer tags so your phone notification looks clean
    const cleanText = text.replace(/\[SET_TIMER:[^\]]*\]/gi, '').replace(/\[TASK_DONE\]/gi, '').trim();
    
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                content: cleanText,
                username: charName // Magically changes the Discord sender name to match your AI
            })
        });
    } catch (error) {
        console.error("Phone notification failed:", error);
    }
}

function checkTasksAndMessages() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return;

    const msgId = chat.length - 1;
    const lastMsg = chat[msgId];

    // Initialize on the very first loop so we don't spam you with old messages
    if (lastNotifiedMsgId === null) {
        lastNotifiedMsgId = msgId;
    }

    if (lastMsg.is_user === false && typeof lastMsg.mes === 'string') {
        
        // --- NEW: Trigger Phone Notification ---
        if (msgId > lastNotifiedMsgId) {
            lastNotifiedMsgId = msgId;
            pushToPhone(lastMsg.name, lastMsg.mes);
        }

        const timerRegex = /\[SET_TIMER:\s*(\d+)\s*\|\s*(.*?)\]/i;
        const doneRegex = /\[TASK_DONE\]/i;
        let modified = false;

        if (timerRegex.test(lastMsg.mes)) {
            const match = lastMsg.mes.match(timerRegex);
            const minutes = parseInt(match[1]);
            taskName = match[2];
            activeDeadline = Date.now() + (minutes * 60000);
            currentStage = 1;
            
            lastMsg.mes = lastMsg.mes.replace(timerRegex, "").trim();
            modified = true;
        }

        if (doneRegex.test(lastMsg.mes)) {
            activeDeadline = null;
            taskName = "";
            lastMsg.mes = lastMsg.mes.replace(doneRegex, "").trim();
            modified = true;
        }

        if (modified) {
            const messageElement = document.querySelector(`.mes[mesid="${msgId}"] .mes_text`);
            if (messageElement) {
                messageElement.innerHTML = lastMsg.mes; 
            }
        }
    }

    if (activeDeadline) {
        const now = new Date();
        const minutesLeft = Math.round((activeDeadline - now.getTime()) / 60000);
        let newStage = currentStage;

        if (minutesLeft <= 0 && currentStage < 4) newStage = 4;
        else if (minutesLeft <= 15 && currentStage < 3) newStage = 3;
        else if (minutesLeft <= 45 && currentStage < 2) newStage = 2;

        if (newStage !== currentStage) {
            currentStage = newStage;
            const timeMsg = minutesLeft > 0 ? `${minutesLeft} minutes left` : "the deadline has passed";
            const currentTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const sysNote = `/sys [System Note (Real-World Time: ${currentTimeStr}): The user has ${timeMsg} for "${taskName}". This is a Tier ${newStage} accountability alert. Generate a proactive, urgent message to apply social pressure, staying strictly in your character persona.] | /gen`;
            executeSlashCommands(sysNote);
        }
    }
}

jQuery(async () => {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'timer',
        callback: () => {
            if (!activeDeadline) return "⏳ No active task timer running.";
            const now = Date.now();
            const minutesLeft = Math.round((activeDeadline - now) / 60000);
            if (minutesLeft > 0) return `⏳ Active Task: "${taskName}" - ${minutesLeft} minutes remaining.`;
            return `⚠️ Active Task: "${taskName}" is OVERDUE by ${Math.abs(minutesLeft)} minutes!`;
        },
        returns: 'string',
        helpString: 'Checks the remaining time on your hidden accountability task.'
    }));

    setInterval(checkTasksAndMessages, 5000);
});