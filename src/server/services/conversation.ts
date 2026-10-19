import type { ConversationReply, ReportValue, Snapshot } from '../../shared/contracts.js';
import { DomainError, localTime } from '../domain/rules.js';
import type { Store } from '../storage/store.js';

interface PendingReport {
  occurrenceId: string;
  label: string;
  value: ReportValue;
  expectedResponseId: number | null;
  expiresAt: number;
}
interface CachedReply {
  payload: string;
  reply: ConversationReply;
  expiresAt: number;
}
const CONFIRMATION_TTL = 120_000;
const RETRY_TTL = 600_000;
const MAX_SESSIONS = 128;
const MAX_REQUESTS = 1024;
const LABELS: Record<ReportValue, string> = {
  taken: 'taken',
  'not-yet': 'not taken yet',
  unsure: 'not sure',
};

/** A deliberately bounded daily helper. It never guesses medical facts or executes generated code. */
export function createConversationService(store: Store) {
  const pending = new Map<string, PendingReport>();
  const replies = new Map<string, CachedReply>();
  const time = (instant: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: store.settings.timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(instant));
  const prune = <T extends { expiresAt: number }>(
    map: Map<string, T>,
    now: number,
    limit: number,
  ) => {
    for (const [key, value] of map) if (value.expiresAt <= now) map.delete(key);
    while (map.size >= limit) map.delete(map.keys().next().value!);
  };
  function answer(
    text: string,
    sessionId: string,
    requestId: string,
    now: number,
  ): ConversationReply {
    const snapshot = store.snapshot();
    const current = pending.get(sessionId);
    if (/^(yes|yes please|confirm|confirm it|that's right|that is right)$/.test(text)) {
      if (!current)
        return {
          text: 'There is nothing waiting for confirmation. Tell me what you would like to record.',
        };
      pending.delete(sessionId);
      store.respond(current.occurrenceId, {
        value: current.value,
        expectedResponseId: current.expectedResponseId,
        requestId: `voice:${sessionId}:${requestId}`,
      });
      return {
        text: `Saved. You reported ${current.label.toLowerCase()} as ${LABELS[current.value]}.`,
        action: 'recorded',
      };
    }
    if (/^(no|no thanks|no thank you|cancel|never mind|nevermind|stop)$/.test(text)) {
      pending.delete(sessionId);
      return {
        text: current
          ? 'Cancelled. I have not changed your medication record.'
          : 'All right. Nothing has been changed.',
        action: 'cancelled',
      };
    }

    const value = selfReport(text);
    if (value) {
      const medication = snapshot.medications
        .filter((item) => item.scheduledAt <= snapshot.now)
        .at(-1);
      if (!medication)
        return {
          text: 'There is no medication check-in due right now. You can review your schedule in Medications.',
        };
      pending.set(sessionId, {
        occurrenceId: medication.id,
        label: medication.label,
        value,
        expectedResponseId: medication.response?.id ?? null,
        expiresAt: now + CONFIRMATION_TTL,
      });
      return {
        text: `Should I record your ${medication.label.toLowerCase()} as ${LABELS[value]}? Say yes to confirm, or no to cancel.`,
        confirmation: { value, label: medication.label },
      };
    }

    // A different request abandons an earlier confirmation; a later yes cannot confirm stale context.
    pending.delete(sessionId);
    if (/\b(dose|dosage|double|extra|overdose|how many|should i take|can i take)\b/.test(text)) {
      return {
        text: 'I can help record what you tell me, but I cannot advise on medication doses. Please ask your pharmacist or clinician.',
      };
    }
    if (/\b(medication|medicine|pill|tablets?|took|taken)\b/.test(text)) {
      if (
        /\b(yesterday|last|earlier|think|maybe|might|probably|remember|not sure|uncertain|didn.t|haven.t)\b/.test(
          text,
        )
      ) {
        return {
          text: 'I have not changed your record. For today’s check-in, say “I took my medication”, “Not yet”, or “I am not sure”. I will ask you to confirm.',
        };
      }
      return { text: medicationSummary(snapshot, time) };
    }
    if (/\b(visit|visiting|helper|sarah|appointment|schedule|coming)\b/.test(text)) {
      const visit = snapshot.visits.find((item) => item.status !== 'cancelled');
      return {
        text: visit
          ? `${visit.alias} is scheduled today from ${time(visit.startsAt)} to ${time(visit.endsAt)}. This is the planned time; I cannot confirm an arrival.`
          : 'There are no planned visits today. You can check Visits for any cancelled arrangements.',
      };
    }
    if (/\b(family|daughter|son|grandchild|message|draft)\b/.test(text)) {
      if (/\b(send|call|contact)\b/.test(text))
        return {
          text: 'I can help write a family message, but I cannot send it or make calls. Ask me to draft a family message.',
        };
      const topic = /\b(meal|eat|dinner|lunch)\b/.test(text)
        ? 'meal'
        : /\b(walk|walking)\b/.test(text)
          ? 'walk'
          : 'hello';
      const draft = store.createDraft(topic);
      return {
        text: `Here is a draft: ${draft.text} It is saved in Family and has not been sent.`,
        action: 'draft',
      };
    }
    if (/\b(time|date|day is it)\b/.test(text)) {
      const date = new Intl.DateTimeFormat('en-US', {
        timeZone: snapshot.settings.timeZone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }).format(new Date(snapshot.now));
      return { text: `It is ${time(snapshot.now)} on ${date}.` };
    }
    if (
      /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|hello dayla|hi dayla)$/.test(
        text,
      )
    ) {
      const hour = localTime(snapshot.now, snapshot.settings.timeZone).hour;
      return {
        text: `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}. I’m Dayla. I can help with your medication check-in, visits, and family messages. What would you like to do?`,
      };
    }
    if (/\b(lonely|sad|down|upset)\b/.test(text))
      return {
        text: 'I’m sorry today feels difficult. I’m here with you. Would you like to prepare a little message for your family?',
      };
    if (/\b(tired|sleepy)\b/.test(text))
      return {
        text: 'Let’s take things at your pace. I can tell you what is planned today, whenever you’re ready.',
      };
    if (
      /^(?:i(?:'m| am) (?:feeling )?(?:good|well|fine|happy)|i feel (?:good|well|fine|happy)|thank you|thanks)(?: today)?$/.test(
        text,
      )
    )
      return {
        text: 'It’s lovely to spend a little time with you. Would you like to hear what is planned for today?',
      };
    if (/\b(weather|rain|temperature|forecast)\b/.test(text))
      return {
        text: 'I do not have live weather information. I can help with today’s time, medication check-in, visits, or a family message.',
      };
    return {
      text: 'I can help with the time, your medication check-in, planned visits, or a family message. Try asking “Who is visiting today?”',
    };
  }
  return {
    reply(input: { text: string; sessionId: string; requestId: string }): ConversationReply {
      if (
        typeof input.text !== 'string' ||
        !input.text.trim() ||
        input.text.length > 1000 ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(input.sessionId) ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId)
      ) {
        throw new DomainError('Provide a short message and valid conversation identifiers.');
      }
      const now = Date.parse(store.actualNow());
      const payload = JSON.stringify({ sessionId: input.sessionId, text: input.text });
      const key = `${input.sessionId}:${input.requestId}`;
      for (const [id, cached] of replies) if (cached.expiresAt <= now) replies.delete(id);
      const existing = replies.get(key);
      if (existing) {
        if (existing.payload !== payload)
          throw new DomainError('This request ID has already been used.', 409);
        return structuredClone(existing.reply);
      }
      prune(pending, now, MAX_SESSIONS);
      prune(replies, now, MAX_REQUESTS);
      const text = input.text
        .trim()
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/[.!?]+$/g, '')
        .trim()
        .replace(/\s+/g, ' ');
      const reply = answer(text, input.sessionId, input.requestId, now);
      replies.set(key, { payload, reply: structuredClone(reply), expiresAt: now + RETRY_TTL });
      return reply;
    },
  };
}

function selfReport(text: string): ReportValue | null {
  if (
    /^(not yet|i (?:have not|haven't|did not|didn't) (?:take|taken) (?:my |the )?(?:medication|medicine|pills?)(?: yet| today)?|i have not taken it(?: yet| today)?)$/.test(
      text,
    )
  )
    return 'not-yet';
  if (
    /^(i am not sure|i'm not sure|not sure|unsure|i (?:do not|don't) know if i (?:took|have taken) (?:my |the )?(?:medication|medicine|pills?)(?: today)?)$/.test(
      text,
    )
  )
    return 'unsure';
  if (
    /^(i (?:took|have taken) (?:my |the )?(?:medication|medicine|pills?)(?: today)?|i've taken (?:my |the )?(?:medication|medicine|pills?)(?: today)?|i (?:took|have taken) it(?: today)?)$/.test(
      text,
    )
  )
    return 'taken';
  return null;
}
function medicationSummary(snapshot: Snapshot, time: (instant: string) => string): string {
  const med = snapshot.medications[0];
  if (!med) return 'There are no medication check-ins scheduled today.';
  if (med.response)
    return `${med.label} is scheduled for ${time(med.scheduledAt)}. Your latest self-report is ${LABELS[med.response.value]}.`;
  return `${med.label} is scheduled for ${time(med.scheduledAt)}. No response has been recorded.${med.scheduledAt <= snapshot.now ? ' You can say “I took my medication”, “Not yet”, or “I am not sure”.' : ''}`;
}
