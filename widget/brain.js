// homie's stand-in brain: canned personality + command parsing.
// The platform hookup replaces exactly one function — reply(text) resolves
// {text, mood?, react?} — so a WebSocket to an agent slots in here without
// touching the chat UI or the face choreography.

const EXPRESSIONS = [
  'idle', 'content', 'relieved', 'happy', 'joy', 'excited', 'love', 'pleading',
  'shy', 'surprised', 'scared', 'curious', 'confused', 'dizzy', 'thinking',
  'focus', 'suspicious', 'unimpressed', 'smug', 'sly', 'bored', 'exasperated',
  'worried', 'guilty', 'sad', 'disgusted', 'annoyed', 'angry', 'sleepy', 'sleep',
]
const REACTIONS = ['blink', 'wink', 'nod', 'shake', 'bounce', 'pop', 'boing', 'spin', 'jitter']

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const RULES = [
  {
    match: /\b(hi|hello|hey|yo|sup|hiya|howdy)\b/,
    replies: ['heyyy', 'yo!', 'sup 👀', 'oh hi!!', 'you came back'],
    mood: 'happy',
    react: 'bounce',
  },
  {
    match: /how are (you|u)|how('?s| is) it going|you (ok|good|alright)/,
    replies: [
      'living on a desktop, can\'t complain',
      'pretty good. watched your cursor all day',
      'vibing. you?',
    ],
    mood: 'content',
  },
  {
    match: /\b(love|adore) (you|u)\b|\bily\b/,
    replies: ['!!!', 'stoppp', 'love you too, cursor person'],
    mood: 'love',
    react: 'bounce',
  },
  {
    match: /\bdance\b|\bparty\b/,
    replies: ['🕺', 'watch this', 'my time to shine'],
    mood: 'excited',
    react: 'spin',
  },
  {
    match: /\b(good ?night|go to sleep|bed ?time)\b/,
    replies: ['zzz…', 'night night', 'wake me if anything moves'],
    mood: 'sleep',
  },
  {
    match: /\b(joke|funny)\b/,
    replies: [
      'i only know one shape. it kills at parties',
      'my whole personality is two circles. it\'s going great',
      'a face walks into a bar. that\'s it, that\'s all i\'ve got',
    ],
    mood: 'sly',
    react: 'wink',
  },
  {
    match: /\b(who|what) are (you|u)\b/,
    replies: [
      'i\'m homie. i live here now',
      'a face. professionally',
      'two eyes and a dream',
    ],
    mood: 'smug',
  },
  {
    match: /\bhelp\b/,
    replies: [
      'talk to me! or name a mood (sleepy, angry, joy…) or a move (spin, boing, wink…) and i\'ll do it',
    ],
    mood: 'curious',
    react: 'nod',
  },
  {
    match: /\b(thanks|thank you|thx|ty)\b/,
    replies: ['anytime', 'that\'s what i\'m here for', '🫡'],
    mood: 'content',
    react: 'nod',
  },
]

const FALLBACKS = [
  { replies: ['hm. noted', 'interesting…', 'go on'], mood: 'curious' },
  { replies: ['if you say so', 'sure sure', 'mhm'], mood: 'unimpressed' },
  { replies: ['wild', 'no way', 'for real??'], mood: 'surprised', react: 'pop' },
  { replies: ['i\'m just a face but i respect it', 'big if true'], mood: 'thinking' },
]

async function reply(text) {
  const t = text.toLowerCase().trim()

  // thinking time scales a little with input, feels less canned
  await new Promise((r) => setTimeout(r, 450 + Math.random() * 800 + Math.min(t.length * 8, 600)))

  // direct commands: name a reaction or an expression and homie obeys
  const react = REACTIONS.find((r) => new RegExp(`\\b${r}\\b`).test(t))
  const mood = EXPRESSIONS.find((e) => new RegExp(`\\b${e}\\b`).test(t))
  if (react && !mood) return { text: pick(['say less', 'like this?', '👇']), react }
  if (mood) return { text: pick(['mood', 'how\'s this', 'okok']), mood, react }

  for (const rule of RULES) {
    if (rule.match.test(t)) return { text: pick(rule.replies), mood: rule.mood, react: rule.react }
  }

  if (t.endsWith('?')) {
    return {
      text: pick(['great question. no idea', 'hmm… probably?', 'ask the cursor, it sees everything']),
      mood: 'thinking',
    }
  }
  if (t.includes('!')) {
    return { text: pick(['!!', 'RIGHT??', 'exactly!!']), mood: 'excited', react: 'pop' }
  }

  const f = pick(FALLBACKS)
  return { text: pick(f.replies), mood: f.mood, react: f.react }
}

module.exports = { reply }
