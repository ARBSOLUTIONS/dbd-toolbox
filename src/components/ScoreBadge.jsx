export default function ScoreBadge({ score, community = null, plain = false }) {
  const level = score >= 80 ? 'high' : score >= 55 ? 'mid' : 'low';
  return (
    <div
      className={`score score-${level}`}
      title={
        plain
          ? undefined
          : 'Score (0-100): how well these perks fit together and with the playstyle' +
            (community
              ? `, ${community.points >= 0 ? '+' : ''}${community.points} from NightLight community stats (how often the perks win)`
              : '') +
            '. A rough guide, not a win rate.'
      }
    >
      {score}
    </div>
  );
}
