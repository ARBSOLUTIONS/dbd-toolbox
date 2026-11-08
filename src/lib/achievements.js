// Achievements you unlock by completing challenges (and a few by using the app).
// Each achievement has a `progress(stats)` function returning [current, target].
// `stats` is built from your challenge history by `buildStats`.

import { PLAYSTYLES } from './tags.js';

export function buildStats(history, { killerCount = 45, customBuilds = 0 } = {}) {
  const done = history.filter((h) => h.status === 'completed');
  const failed = history.filter((h) => h.status === 'failed');
  const set = (fn) => new Set(done.map(fn).filter(Boolean));

  // Days (local) with at least one completed daily challenge, for streaks.
  const dailyDays = [...set((h) => (h.challenge.label?.startsWith('Daily ') ? h.challenge.label.slice(6) : null))].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of dailyDays) {
    run = prev && (new Date(d) - new Date(prev)) / 86400e3 === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }

  return {
    completed: done.length,
    failed: failed.length,
    points: done.reduce((n, h) => n + (h.challenge.points ?? 0), 0),
    survivor: done.filter((h) => h.challenge.role === 'survivor').length,
    killer: done.filter((h) => h.challenge.role === 'killer').length,
    hard: done.filter((h) => h.challenge.difficulty === 'hard').length,
    adept: done.filter((h) => h.challenge.kind === 'adept').length,
    adeptCharacters: set((h) => (h.challenge.kind === 'adept' ? h.challenge.character : null)).size,
    meme: done.filter((h) => h.challenge.kind === 'meme').length,
    rules: set((h) => h.challenge.rule),
    killers: set((h) => (h.challenge.role === 'killer' ? h.challenge.killer : null)).size,
    killerCount,
    survivorStyles: set((h) => (h.challenge.kind === 'theme' && h.challenge.role === 'survivor' ? h.challenge.style : null)).size,
    killerStyles: set((h) => (h.challenge.kind === 'theme' && h.challenge.role === 'killer' ? h.challenge.style : null)).size,
    daily: dailyDays.length,
    weekly: done.filter((h) => h.challenge.label?.startsWith('Weekly ')).length,
    dailyStreak: best,
    customBuilds,
  };
}

const n = (x) => Math.max(0, x);
const survivorStyleCount = Object.keys(PLAYSTYLES.survivor).length;
const killerStyleCount = Object.keys(PLAYSTYLES.killer).length;

export const ACHIEVEMENTS = [
  // Getting started
  { id: 'first-blood', icon: '🩸', name: 'First Blood', description: 'Complete your first challenge.', progress: (s) => [s.completed, 1] },
  { id: 'both-sides', icon: '⚖️', name: 'Both Sides of the Fog', description: 'Complete a survivor and a killer challenge.', progress: (s) => [Math.min(s.survivor, 1) + Math.min(s.killer, 1), 2] },
  { id: 'dedicated', icon: '🔥', name: 'Dedicated', description: 'Complete 10 challenges.', progress: (s) => [s.completed, 10] },
  { id: 'veteran', icon: '🎖️', name: 'Veteran of the Fog', description: 'Complete 50 challenges.', progress: (s) => [s.completed, 50] },
  { id: 'entity-favourite', icon: '🕷️', name: "The Entity's Favourite", description: 'Complete 100 challenges.', progress: (s) => [s.completed, 100] },
  // Points
  { id: 'points-100', icon: '🥉', name: 'Bloodpoint Collector', description: 'Earn 100 challenge points.', progress: (s) => [s.points, 100] },
  { id: 'points-500', icon: '🥈', name: 'Bloodpoint Hoarder', description: 'Earn 500 challenge points.', progress: (s) => [s.points, 500] },
  { id: 'points-2000', icon: '🥇', name: 'Prestige Material', description: 'Earn 2,000 challenge points.', progress: (s) => [s.points, 2000] },
  // Difficulty and kinds
  { id: 'hard-5', icon: '💀', name: 'Hardened', description: 'Complete 5 hard challenges.', progress: (s) => [s.hard, 5] },
  { id: 'adept-1', icon: '⭐', name: 'Adept', description: 'Complete an Adept challenge.', progress: (s) => [s.adept, 1] },
  { id: 'adept-10', icon: '🌟', name: 'Adept Collector', description: 'Complete Adept challenges with 10 different characters.', progress: (s) => [s.adeptCharacters, 10] },
  { id: 'meme-3', icon: '🤡', name: 'Meme Lord', description: 'Complete 3 meme-build challenges.', progress: (s) => [s.meme, 3] },
  { id: 'naked', icon: '🫥', name: 'Naked and Afraid', description: 'Complete a no-perks challenge.', progress: (s) => [s.rules.has('no-perks') ? 1 : 0, 1] },
  { id: 'hex', icon: '🔮', name: 'Hex Gambler', description: 'Complete a hex-only challenge.', progress: (s) => [s.rules.has('hex-only') ? 1 : 0, 1] },
  { id: 'boon', icon: '🕯️', name: 'Totem Keeper', description: 'Complete a boon-only challenge.', progress: (s) => [s.rules.has('boon-only') ? 1 : 0, 1] },
  { id: 'hipster', icon: '🕶️', name: 'Hipster', description: 'Complete an off-meta challenge.', progress: (s) => [s.rules.has('off-meta') ? 1 : 0, 1] },
  // Variety
  { id: 'roster-10', icon: '🔪', name: 'Roster Explorer', description: 'Complete killer challenges with 10 different killers.', progress: (s) => [s.killers, 10] },
  { id: 'roster-all', icon: '👑', name: 'Full Roster', description: 'Complete a challenge with every killer.', progress: (s) => [s.killers, s.killerCount] },
  { id: 'styles-survivor', icon: '🎭', name: 'Jack of All Trades', description: 'Complete a theme challenge in every survivor playstyle.', progress: (s) => [s.survivorStyles, survivorStyleCount] },
  { id: 'styles-killer', icon: '🪓', name: 'Master of Methods', description: 'Complete a theme challenge in every killer playstyle.', progress: (s) => [s.killerStyles, killerStyleCount] },
  // Daily / weekly
  { id: 'daily-1', icon: '📅', name: 'Daily Ritual', description: 'Complete a daily challenge.', progress: (s) => [s.daily, 1] },
  { id: 'streak-3', icon: '📆', name: 'On a Roll', description: 'Complete daily challenges 3 days in a row.', progress: (s) => [s.dailyStreak, 3] },
  { id: 'streak-7', icon: '🗓️', name: 'Week of Terror', description: 'Complete daily challenges 7 days in a row.', progress: (s) => [s.dailyStreak, 7] },
  { id: 'weekly-1', icon: '🏔️', name: 'Weekly Warrior', description: 'Complete a weekly challenge.', progress: (s) => [s.weekly, 1] },
  // Fun
  { id: 'fail-5', icon: '🪦', name: 'Better Luck Next Trial', description: 'Fail 5 challenges. It happens!', progress: (s) => [s.failed, 5] },
  { id: 'architect', icon: '🛠️', name: 'Architect', description: 'Save 3 of your own builds from the Build maker.', progress: (s) => [s.customBuilds, 3] },
];

/** Returns every achievement with { current, target, unlocked }. */
export function evaluateAchievements(stats) {
  return ACHIEVEMENTS.map((a) => {
    const [current, target] = a.progress(stats);
    return { ...a, current: Math.min(n(current), target), target, unlocked: current >= target };
  });
}
