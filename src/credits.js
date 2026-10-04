// Scene 7 — end credits for the people who were keyed out.
// Roles and places only — no invented names. Every figure is quoted from a source shown beneath it.

export function buildCredits(root) {
  const rows = (list) => list.map(([l, r]) => `<div class="cr-row"><span class="l">${l}</span><span></span><span class="r">${r}</span></div>`).join('')

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
      <p class="cr-more">And thousands more, uncredited.</p>
    </div>

    <p class="cr-fact">Median earnings for these workers in developing countries: about US$2 an hour.
      <small>Rani &amp; Dhir (2024), International Labour Organization</small></p>

    <p class="cr-fact">Many hold bachelor’s or postgraduate degrees.
      <small>Rani &amp; Dhir (2024), International Labour Organization</small></p>

    <p class="cr-fact">Moderators are “routinely exposed to graphic violence, hate speech, child exploitation and other objectionable material”.
      <small>Rani &amp; Dhir (2024), International Labour Organization</small></p>

    <p class="cr-fact">A survey of 76 data workers in Colombia, Ghana and Kenya recorded 60 incidents of psychological harm, from anxiety and panic attacks to PTSD, alongside forced unpaid overtime and withheld pay.
      <small>Du &amp; Okolo (2025), Brookings</small></p>

    <div class="cr-block">
      <p class="cr-head">THIS WORK</p>
      ${rows([
        ['Concept & design', 'Meilin Chen'],
        ['Images', 'ChatGPT (AI-generated)'],
        ['3D worker', 'Meshy (AI-generated)'],
        ['Eye footage', 'Kling, Doubao, Qianwen(AI-generated-video)'],
        ['Code', 'written with Claude'],
        ['Tearable cloth physics', 'after Dissimulate (MIT)'],
        ['Course', 'Critical AI · 2026'],
      ])}
    </div>
  `
}
