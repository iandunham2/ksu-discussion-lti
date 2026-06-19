'use strict';

// Maps D2L content topic IDs → internal disc keys (MENT 3300)
const TOPIC_ID_TO_DISC = {
    '62324565': '3300-disc0',
    '62324566': '3300-disc1',
    '62324567': '3300-disc2',
    '62324568': '3300-disc3',
    '62324569': '3300-disc4',
    '62324570': '3300-disc5',
    '62324571': '3300-disc6',
    '62324572': '3300-disc7',
    '62324573': '3300-disc8',
    // COMM 3340
    '61805440': '3340-mod1',
    '61805441': '3340-mod2',
    '61805442': '3340-mod3',
    '61805443': '3340-mod4',
    '61805444': '3340-mod5',
    '61805445': '3340-mod6',
    '61805446': '3340-mod7',
    '61805447': '3340-mod8',
    '61805448': '3340-mod9',
    '61805449': '3340-mod10',
    '61805450': '3340-mod11',
    '61805451': '3340-mod13',
    '61805452': '3340-mod15',
};

// D2L resource_link_title values → disc keys (3300 + 3340 + alternate titles)
const TITLE_TO_DISC = {
    // COMM 3340
    'Module 1 Discussion': '3340-mod1',
    'Module 2 Discussion': '3340-mod2',
    'Module 3 Discussion': '3340-mod3',
    'Module 4 Discussion': '3340-mod4',
    'Module 5 Discussion': '3340-mod5',
    'Module 6 Discussion': '3340-mod6',
    'Module 7 Discussion': '3340-mod7',
    'Module 8 Discussion': '3340-mod8',
    'Module 9 Discussion': '3340-mod9',
    'Module 10 Discussion': '3340-mod10',
    'Module 11 Discussion': '3340-mod11',
    'Module 13 Discussion': '3340-mod13',
    'Module 15 Discussion': '3340-mod15',
    'Discussion 0: Introduce Yourself': '3300-disc0',
    'Discussion 1: Choose Your Podcast Topic': '3300-disc1',
    'Discussion 1: Podcasts You Watch': '3300-disc1',
    'Discussion 2: Peer Critique \u2014 Episode 2': '3300-disc2',
    'Discussion 2: Peer Critique \u2014 Episode 1': '3300-disc2',
    'Discussion 3: The Sound of Podcasting': '3300-disc3',
    'Discussion 4: Peer Critique \u2014 Episode 3': '3300-disc4',
    'Discussion 5: Brand Identity in the Wild': '3300-disc5',
    'Discussion 6: Peer Critique \u2014 Episode 5': '3300-disc6',
    'Discussion 7: Episode Structure Analysis': '3300-disc7',
    'Discussion 8: Capstone Showcase & Final Peer Critique': '3300-disc8',
};

const CORRECT_3300_INSTRUCTIONS = {
    '3300-disc0': `<h3>Discussion 0: Introduce Yourself</h3>
<p>Welcome to MENT 3300! Introduce yourself to your classmates. Include your name, major, why you're interested in podcasting, and your favorite podcast.</p>
<p><strong>Minimum:</strong> 100–200 words. Reply to at least two classmates.</p>`,
    '3300-disc1': `<h3>Discussion 1: Podcasts You Watch</h3>
<p>Now that you've submitted your first solo episode, let's look outward.</p>
<p>Find a <strong>video podcast</strong> (not audio-only) that you have <em>not</em> watched before. Watch at least 15 minutes of one episode. Then post the following:</p>
<ol>
  <li><strong>Link</strong> to the episode (YouTube, Spotify, etc.)</li>
  <li><strong>What is the host's setup?</strong> Describe the camera framing, lighting, and background. How does it compare to your Episode 1?</li>
  <li><strong>What works?</strong> Name one specific production choice that makes this episode watchable.</li>
  <li><strong>What doesn't?</strong> Name one production issue you noticed (audio, framing, pacing, etc.).</li>
</ol>
<p>Respond to <strong>two classmates</strong> with substantive feedback — not just "I agree." Tell them what you noticed in the podcast they reviewed that they didn't mention.</p>
<p><strong>Minimum:</strong> 200 words for your post, 75 words per reply.</p>`,
    '3300-disc2': `<h3>Discussion 2: Peer Critique — Episode 1</h3>
<p>You will watch and critique a classmate's Episode 1 submission.</p>
<p>Your instructor will assign critique pairs. Watch your assigned classmate's Episode 1 in full, then post feedback addressing:</p>
<ol>
  <li><strong>Camera framing:</strong> Is the speaker positioned intentionally? What would you change?</li>
  <li><strong>Audio quality:</strong> Is the voice clear and consistent? Any distracting background noise?</li>
  <li><strong>Pacing:</strong> Does the episode feel like 15 minutes or does it drag? Where specifically?</li>
  <li><strong>Editing:</strong> Can you spot the cuts? Are they invisible or jarring?</li>
  <li><strong>One concrete suggestion:</strong> What is the single most impactful change this person could make for Episode 2?</li>
</ol>
<p>Be honest and specific. Vague praise ("it was good") is not useful. Specific critique ("your framing was too low — your forehead was cut off for the first 3 minutes") is.</p>
<p><strong>Minimum:</strong> 250 words. Respond to your critique partner's feedback on your own work with at least 100 words.</p>`,
    '3300-disc3': `<h3>Discussion 3: The Sound of Podcasting</h3>
<p>Now that you've processed audio for Episode 3, you have ears for this.</p>
<p>Find two podcast episodes — one that sounds <strong>professionally produced</strong> and one that sounds <strong>rough or unprocessed</strong>. They can be audio-only or video podcasts. Post:</p>
<ol>
  <li><strong>Links</strong> to both episodes</li>
  <li><strong>Professional episode:</strong> What makes the audio comfortable to listen to? Can you identify specific processing (EQ, compression, noise reduction) based on what you learned in Episode 3?</li>
  <li><strong>Rough episode:</strong> What specific audio problems do you hear? How would you fix them using the Fairlight tools you now know?</li>
  <li><strong>Your own Episode 3:</strong> Which of these two does your audio sound closer to? Be honest.</li>
</ol>
<p>Respond to <strong>two classmates</strong> — listen to one of the podcasts they linked and add your own observations.</p>
<p><strong>Minimum:</strong> 250 words for your post, 75 words per reply.</p>`,
    '3300-disc4': `<h3>Discussion 4: Peer Critique — Episode 3</h3>
<p>Watch your assigned classmate's Episode 3 and critique the audio processing specifically.</p>
<ol>
  <li><strong>Before/after impression:</strong> Does the audio sound processed? In a good way or a bad way?</li>
  <li><strong>EQ:</strong> Does the voice sound muddy, thin, or balanced?</li>
  <li><strong>Compression:</strong> Is the volume consistent throughout, or do you find yourself adjusting your volume?</li>
  <li><strong>Noise:</strong> Is there distracting background noise? If noise reduction was applied, does the voice sound metallic?</li>
  <li><strong>Overall:</strong> Could you listen to 15 minutes of this audio comfortably? What one change would make the biggest difference?</li>
</ol>
<p><strong>Minimum:</strong> 250 words. Respond to your critique partner's feedback with at least 100 words.</p>`,
    '3300-disc5': `<h3>Discussion 5: Brand Identity in the Wild</h3>
<p>You just built a brand for your podcast. Now look at how professionals do it.</p>
<p>Find a video podcast with a <strong>strong, recognizable brand identity</strong> — consistent title sequence, lower thirds, color scheme, music, and visual style. Post:</p>
<ol>
  <li><strong>Link</strong> to the show (or a specific episode)</li>
  <li><strong>Visual brand:</strong> Describe the title sequence, lower thirds, colors, and typography. How long is the intro? What makes it recognizable?</li>
  <li><strong>Audio brand:</strong> What music do they use? How is it mixed under dialogue? Does it play throughout or only in transitions?</li>
  <li><strong>Consistency:</strong> Watch the first 2 minutes of two different episodes. Are the brand elements identical? Any drift?</li>
  <li><strong>Your brand vs. theirs:</strong> What is one element from their brand you wish you had incorporated into yours?</li>
</ol>
<p>Respond to <strong>two classmates</strong> with your own take on the brand they analyzed.</p>
<p><strong>Minimum:</strong> 250 words for your post, 75 words per reply.</p>`,
    '3300-disc6': `<h3>Discussion 6: Peer Critique — Episode 5</h3>
<p>Watch your assigned classmate's Episode 5 (their first branded episode) and evaluate the brand execution.</p>
<ol>
  <li><strong>Title sequence:</strong> Does it look professional? Is it under 30 seconds? Does it set the tone?</li>
  <li><strong>Lower thirds:</strong> Are they consistent in style? Do they appear at the right moments?</li>
  <li><strong>Music:</strong> Does the music enhance or distract? Is it mixed at an appropriate level under dialogue?</li>
  <li><strong>Overall brand impression:</strong> If you saw this episode with no context, would you recognize it as a "show"? What makes it feel (or not feel) like a professional production?</li>
  <li><strong>One concrete suggestion</strong> for Episodes 6 and 7.</li>
</ol>
<p><strong>Minimum:</strong> 250 words. Respond to your critique partner's feedback with at least 100 words.</p>`,
    '3300-disc7': `<h3>Discussion 7: Episode Structure Analysis</h3>
<p>Now that you've built a multi-segment episode, analyze how professionals structure theirs.</p>
<p>Find a video podcast episode that is <strong>at least 20 minutes long</strong> and has a clear multi-segment structure. Post:</p>
<ol>
  <li><strong>Link</strong> to the episode</li>
  <li><strong>Segment map:</strong> Create a timestamped outline of the episode's segments (e.g., 0:00–0:45 Cold open, 0:45–1:15 Title sequence, etc.)</li>
  <li><strong>Transitions:</strong> How does the show move between segments? Musical stingers? Graphic cards? Hard cuts?</li>
  <li><strong>Pacing:</strong> Which segment is the strongest? Which drags? Why?</li>
  <li><strong>Application:</strong> Name one structural technique from this episode that you can use in your Episode 7 capstone.</li>
</ol>
<p>Respond to <strong>two classmates</strong> — compare the structure of the episode they analyzed to the one you chose.</p>
<p><strong>Minimum:</strong> 300 words for your post, 75 words per reply.</p>`,
    '3300-disc8': `<h3>Discussion 8: Capstone Showcase &amp; Final Peer Critique</h3>
<p>This is your final discussion. Share your capstone and reflect on the semester.</p>
<p><strong>Part 1 — Showcase your Episode 7:</strong></p>
<ol>
  <li>Post a <strong>link or description</strong> of your capstone episode (title, topic, format).</li>
  <li>In 100 words, describe what you are most proud of in this episode and why.</li>
  <li>In 100 words, describe what you would change if you had one more week.</li>
</ol>
<p><strong>Part 2 — Final Peer Critique:</strong></p>
<p>Watch your assigned classmate's Episode 7 capstone. Evaluate it holistically:</p>
<ol>
  <li>Technical quality (audio, video, export)</li>
  <li>Brand consistency (does it match their Episodes 5 and 6?)</li>
  <li>Episode structure (segments, transitions, pacing)</li>
  <li>Content quality (is it engaging for 15 minutes?)</li>
  <li>Captions (accurate and properly timed?)</li>
</ol>
<p>End your critique with: <strong>"The strongest moment in your capstone was..."</strong> and <strong>"If this were a real show, the next episode should..."</strong></p>
<p><strong>Minimum:</strong> 300 words total. Respond to your critique partner with at least 100 words.</p>`,
};

/**
 * Resolve the internal disc key for a discussion launch.
 * Priority: query param → custom LTI param → D2L topic ID → link title → DB mapping.
 */
function resolveDisc({ queryDisc, body, resourceLinkTitle, extD2lLinkId, dbDisc }) {
    if (queryDisc && typeof queryDisc === 'string' && queryDisc.trim()) {
        return queryDisc.trim();
    }

    const customDisc = body?.custom_disc || body?.['custom_disc'];
    if (customDisc && typeof customDisc === 'string') {
        return customDisc.trim();
    }

    if (extD2lLinkId && TOPIC_ID_TO_DISC[String(extD2lLinkId)]) {
        return TOPIC_ID_TO_DISC[String(extD2lLinkId)];
    }

    if (resourceLinkTitle && TITLE_TO_DISC[resourceLinkTitle]) {
        return TITLE_TO_DISC[resourceLinkTitle];
    }

    return dbDisc || null;
}

function discFromTitle(title) {
    return title ? TITLE_TO_DISC[title] || null : null;
}

module.exports = {
    TOPIC_ID_TO_DISC,
    TITLE_TO_DISC,
    CORRECT_3300_INSTRUCTIONS,
    resolveDisc,
    discFromTitle,
};
