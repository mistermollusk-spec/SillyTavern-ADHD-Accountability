import { executeSlashCommands } from '../../../slash-commands/SlashCommandParser.js';
import { getContext } from '../../../extensions.js';

let currentStage = 1;
let activeDeadline = null;
let taskName = "";

function checkTasksAndMessages() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return;

    // 1. Scan the AI's latest message for hidden tags
    const lastMsg = chat[chat.length - 1];
    if (lastMsg.is_user === false && typeof lastMsg.mes === 'string') {
        
        const timerRegex = /\[SET_TIMER:\s*(\d+)\s*\|\s*(.*?)\]/i;
        const doneRegex = /\[TASK_DONE\]/i;
        let modified = false;

        // Start Timer Trigger
        if (timerRegex.test(lastMsg.mes)) {
            const match = lastMsg.mes.match(timerRegex);
            const minutes = parseInt(match[1]);
            taskName = match[2];
            activeDeadline = Date.now() + (minutes * 60000);
            currentStage = 1;
            
            lastMsg.mes = lastMsg.mes.replace(timerRegex, "").trim();
            modified = true;
        }

        // End Timer Trigger
        if (doneRegex.test(lastMsg.mes)) {
            activeDeadline = null;
            taskName = "";
            lastMsg.mes = lastMsg.mes.replace(doneRegex, "").trim();
            modified = true;
        }

        // Hide the tags from the UI so it looks like a natural conversation
        if (modified) {
            const msgId = chat.length - 1;
            const messageElement = document.querySelector(`.mes[mesid="${msgId}"] .mes_text`);
            if (messageElement) {
                messageElement.innerHTML = lastMsg.mes; 
            }
        }
    }

    // 2. Background Timer & Social Pressure Escalation
    if (activeDeadline) {
        const now = Date.now();
        const minutesLeft = Math.round((activeDeadline - now) / 60000);
        let newStage = currentStage;

        if (minutesLeft <= 0 && currentStage < 4) newStage = 4;
        else if (minutesLeft <= 15 && currentStage < 3) newStage = 3;
        else if (minutesLeft <= 45 && currentStage < 2) newStage = 2;

        // Trigger a proactive message when crossing a threshold
        if (newStage !== currentStage) {
            currentStage = newStage;
            const timeMsg = minutesLeft > 0 ? `${minutesLeft} minutes left` : "the deadline has passed";
            const sysNote = `/sys [System Note: The user has ${timeMsg} for "${taskName}". This is a Tier ${newStage} accountability alert. Generate a proactive, urgent message to apply social pressure and get them back on track, staying strictly in your character persona.] | /gen`;
            executeSlashCommands(sysNote);
        }
    }
}

jQuery(async () => {
    // Check the chat and the clock every 5 seconds
    setInterval(checkTasksAndMessages, 5000);
});