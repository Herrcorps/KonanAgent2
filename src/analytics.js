import config from './config.js';

export function calculateEngagementRate({ likes = 0, comments = 0, shares = 0, views = 1 }) {
  return (likes + comments + shares) / Math.max(views, 1);
}

export function diagnosePost(postData) {
  const { views = 0, likes = 0, comments = 0, shares = 0 } = postData;
  const engagement = calculateEngagementRate({ likes, comments, shares, views });
  const { highViewsThreshold, highEngagementRate } = config.analytics;

  const highViews = views >= highViewsThreshold;
  const highEngagement = engagement >= highEngagementRate;

  if (highViews && highEngagement) {
    return { status: 'SCALE', emoji: '🟢', label: 'Scale It', message: 'This is working. Make 3 variations of this hook immediately. Test different posting times.', views, engagement: (engagement * 100).toFixed(2) + '%' };
  }
  if (highViews && !highEngagement) {
    return { status: 'FIX_CTA', emoji: '🟡', label: 'Fix the CTA', message: 'People are seeing it but not engaging. Try different CTAs on slide 6. Check if the content delivers on the hook promise.', views, engagement: (engagement * 100).toFixed(2) + '%' };
  }
  if (!highViews && highEngagement) {
    return { status: 'FIX_HOOKS', emoji: '🟡', label: 'Fix the Hooks', message: 'People who see it love it, but not enough people are seeing it. Test radically different hooks and slide 1 images.', views, engagement: (engagement * 100).toFixed(2) + '%' };
  }
  return { status: 'FULL_RESET', emoji: '🔴', label: 'Full Reset', message: 'Neither the hook nor the content is working. Try a completely different format, audience angle, or hook category.', views, engagement: (engagement * 100).toFixed(2) + '%' };
}

export function generateReport(posts) {
  if (!posts || posts.length === 0) {
    return { summary: 'No posts to analyze.', posts: [], topPosts: [], recommendation: 'Start posting to collect data.' };
  }

  const analyzed = posts.map((p) => ({ ...p, engagementRate: calculateEngagementRate(p), diagnosis: diagnosePost(p) }));
  analyzed.sort((a, b) => (b.views || 0) - (a.views || 0));

  const totalViews = analyzed.reduce((sum, p) => sum + (p.views || 0), 0);
  const avgEngagement = analyzed.reduce((sum, p) => sum + p.engagementRate, 0) / analyzed.length;

  const topPosts = analyzed.slice(0, 3).map((p) => ({
    hook: p.hook || p.caption?.slice(0, 50) || 'Unknown',
    views: p.views || 0,
    engagement: (p.engagementRate * 100).toFixed(2) + '%',
    diagnosis: p.diagnosis.label,
  }));

  const counts = {};
  for (const p of analyzed) { counts[p.diagnosis.status] = (counts[p.diagnosis.status] || 0) + 1; }

  let recommendation;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  switch (dominant) {
    case 'SCALE': recommendation = 'Most posts are performing well. Double down on winning hooks and test variations.'; break;
    case 'FIX_CTA': recommendation = 'Views are good but engagement is low. Focus on improving CTAs and slide 6 content.'; break;
    case 'FIX_HOOKS': recommendation = 'Content quality is high but reach is low. Experiment with new hook styles and posting times.'; break;
    default: recommendation = 'Performance is below baseline. Try new formats, different audience angles, and fresh hook categories.';
  }

  return {
    summary: `${analyzed.length} posts analyzed | ${totalViews.toLocaleString()} total views | ${(avgEngagement * 100).toFixed(2)}% avg engagement`,
    posts: analyzed,
    topPosts,
    recommendation,
  };
}

export function suggestNextActions(posts) {
  const report = generateReport(posts);
  const actions = [];
  for (const p of report.posts) {
    if (p.diagnosis.status === 'SCALE' && (p.views || 0) >= 50000) {
      actions.push(`DOUBLE DOWN: "${p.hook || 'top post'}" got ${p.views} views — make 3 variations immediately`);
    }
  }
  if (actions.length === 0) actions.push(report.recommendation);
  return actions;
}

export default { calculateEngagementRate, diagnosePost, generateReport, suggestNextActions };
