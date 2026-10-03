// Scene 7 — end credits for the people who were keyed out.
// Roles and places only — no invented names. Every figure is quoted from a source shown beneath it.
// DRAFT: edit freely before submission.

// Set to false to leave the user's own prompt out of the credits.
export const SHOW_PROMPT_IN_CREDITS = true

export function buildCredits(root, prompt) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const rows = (list) => list.map(([l, r]) => `<div class="cr-row"><span class="l">${l}</span><span></span><span class="r">${r}</span></div>`).join('')

  const promptBlock = SHOW_PROMPT_IN_CREDITS && prompt
    ? `<p class="cr-prompt">Your prompt<br><em>“${esc(prompt)}”</em><br>was answered by people you will never meet.</p>`
    : ''

  root.innerHTML = `
    <div class="cr-block">
      <p class="cr-head">NIMBUS WAS MADE POSSIBLE BY</p>
      ${rows([
        ['Data Annotation', 'Kenya · India · the Philippines'],
        ['Content Moderation', 'Kenya · the Philippines'],
        ['Human Feedback Evaluation', 'remote, by the task'],
        ['Image Labelling', 'remote, by the task'],
        ['Transcription', 'remote, by the task'],
        ['Microtask Crowdwork', 'the Global South'],
      ])}
    </div>

    <p class="cr-fact">Median earnings for these workers in developing countries: about US$2 an hour.
      <small>Rani &amp; Dhir, International Labour Organization, 2024</small></p>

    <p class="cr-fact">Many hold bachelor’s or postgraduate degrees.
      <small>Rani &amp; Dhir, International Labour Organization, 2024</small></p>

    <p class="cr-fact">Workers in Kenya who labelled toxic text to make a chatbot “safe” took home less than US$2 an hour.
      <small>Perrigo, TIME, 2023</small></p>

    <p class="cr-fact">Moderators are “routinely exposed to graphic violence, hate speech, child exploitation and other objectionable material”.
      <small>Rani &amp; Dhir, International Labour Organization, 2024</small></p>

    ${promptBlock}

    <div class="cr-block">
      <p class="cr-head">THIS WORK</p>
      ${rows([
        ['Concept & design', 'Meilin Chen'],
        ['Images', 'ChatGPT (AI-generated)'],
        ['3D worker', 'Meshy (AI-generated)'],
        ['Eye footage', 'AI-generated video'],
        ['Code', 'written with Claude'],
        ['Tearable cloth physics', 'after Dissimulate (MIT)'],
        ['Course', 'Critical AI · 2026'],
      ])}
    </div>

    <p class="cr-last">And thousands more, uncredited.</p>
  `
}
