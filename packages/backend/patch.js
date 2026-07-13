const fs = require('fs');

const file = 'd:/VIMO - Vibe Marketing Operations/packages/backend/src/agents/marketingDirector.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace runResearchWorker completely
const runResearchWorkerStart = code.indexOf('async function runResearchWorker(state: MarketingDirectorState): Promise<Partial<MarketingDirectorState>> {');
const runAnalyticsWorkerStart = code.indexOf('/* ------------------------------------------------------------------ */\n/*  Node 2 — runAnalyticsWorker');

if (runResearchWorkerStart === -1 || runAnalyticsWorkerStart === -1) {
  console.log('Could not find runResearchWorker boundaries');
  process.exit(1);
}

const newRunResearchWorker = `async function runResearchWorker(state: MarketingDirectorState): Promise<Partial<MarketingDirectorState>> {
  const start = Date.now();
  console.log(\`[Director] runResearchWorker — gathering intelligence for brand \${state.brandProfileId}...\`);

  try {
    // Import the three existing agents and call them in parallel
    const { huntTrends: origHuntTrends } = await import('./trendHunterAgent');
    const { analyzeCompetitors: origAnalyzeCompetitors } = await import('./competitorAgent');
    const { scanOpportunities: origScanOpportunities } = await import('./opportunityAgent');

    const [trendsResult, competitorResult, oppResult] = await Promise.allSettled([
      (async () => {
        await origHuntTrends(state.brandProfileId);
        return 'trend hunter complete';
      })(),
      (async () => {
        await origAnalyzeCompetitors(state.brandProfileId);
        return 'competitor analysis complete';
      })(),
      (async () => {
        await origScanOpportunities(state.brandProfileId);
        return 'opportunity scan complete';
      })(),
    ]);

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const last3Days = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const last6Days = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    // 1. Get recent trend signals for this brand
    const trends = db
      .select()
      .from(trendSignals)
      .where(
        and(
          gte(trendSignals.createdAt, last24h),
          eq(trendSignals.signalType, 'trending_topic'),
        ),
      )
      .all();

    // 2. Get competitor moves as signals
    const competitorMoves = db
      .select()
      .from(trendSignals)
      .where(
        and(
          gte(trendSignals.createdAt, last24h),
          eq(trendSignals.signalType, 'competitor_move'),
        ),
      )
      .all();

    // 3. Get growth opportunities as signals
    const growthOpps = db
      .select()
      .from(trendSignals)
      .where(
        and(
          gte(trendSignals.createdAt, last24h),
          eq(trendSignals.signalType, 'growth_opportunity'),
        ),
      )
      .all();

    // 4. Check unanswered comments > 2 hours
    const unansweredComments = db
      .select({ count: sql<number>\`COUNT(*)\` })
      .from(engagementQueue)
      .where(
        and(
          eq(engagementQueue.brandProfileId, state.brandProfileId),
          eq(engagementQueue.status, 'pending'),
          lte(engagementQueue.createdAt, twoHoursAgo)
        )
      )
      .get();
    const unansweredCount = (unansweredComments as any)?.count ?? 0;

    // 5. Follower momentum drop > 20%
    const recentSnapshots = db
      .select()
      .from(accountSnapshots)
      .where(gte(accountSnapshots.snapshotDate, last6Days.split('T')[0]))
      .orderBy(accountSnapshots.snapshotDate)
      .all();
    
    let momentumConcern = false;
    if (recentSnapshots.length >= 2) {
      const older = recentSnapshots.filter(s => s.snapshotDate < last3Days.split('T')[0]);
      const newer = recentSnapshots.filter(s => s.snapshotDate >= last3Days.split('T')[0]);
      
      const oldChange = older.length > 1 ? older[older.length-1].followersCount - older[0].followersCount : 0;
      const newChange = newer.length > 1 ? newer[newer.length-1].followersCount - newer[0].followersCount : 0;
      
      if (oldChange > 0 && newChange < oldChange * 0.8) {
        momentumConcern = true; // Drop > 20% compared to previous 3 days
      }
    }

    // 6. Completed Higgsfield jobs in last 24h
    const completedVideos = db
      .select({ count: sql<number>\`COUNT(*)\` })
      .from(higgsfieldJobs)
      .where(
        and(
          eq(higgsfieldJobs.brandProfileId, state.brandProfileId),
          eq(higgsfieldJobs.status, 'completed'),
          gte(higgsfieldJobs.completedAt, last24h)
        )
      )
      .get();
    const videoCount = (completedVideos as any)?.count ?? 0;

    // 7. Pending approvals > 6 hours
    const pendingApprovals = db
      .select({ count: sql<number>\`COUNT(*)\` })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.brandProfileId, state.brandProfileId),
          eq(approvalRequests.status, 'pending'),
          lte(approvalRequests.createdAt, sixHoursAgo)
        )
      )
      .get();
    const approvalCount = (pendingApprovals as any)?.count ?? 0;

    // 8. Unimplemented lessons in marketingMemory
    const unimplementedLessons = db
      .select({ count: sql<number>\`COUNT(*)\` })
      .from(marketingMemory)
      .where(
        and(
          eq(marketingMemory.brandProfileId, state.brandProfileId),
          gte(marketingMemory.createdAt, last7Days)
        )
      )
      .get(); // Simplification: assume all recent lessons might need review
    const lessonCount = (unimplementedLessons as any)?.count ?? 0;

    // 9. Competitor gain > 200 followers in 24h
    const compSnaps = db
      .select()
      .from(competitorSnapshots)
      .where(gte(competitorSnapshots.snapshotDate, last48h.split('T')[0]))
      .all();
    let compAlerts = 0;
    const comps = new Map<string, number[]>();
    for (const c of compSnaps) {
      if (!comps.has(c.competitorProfileId)) comps.set(c.competitorProfileId, []);
      if (c.followersCount !== null) {
        comps.get(c.competitorProfileId)!.push(c.followersCount);
      }
    }
    for (const [, counts] of comps) {
      if (counts.length >= 2) {
        if (counts[counts.length-1] - counts[0] > 200) compAlerts++;
      }
    }

    const researchReport = {
      trends: trends.map((t) => ({
        title: t.title,
        description: t.description,
        relevanceScore: t.relevanceScore,
        actionSuggestion: t.actionSuggestion,
      })),
      competitorMoves: competitorMoves.map((c) => ({
        title: c.title,
        description: c.description,
        relevanceScore: c.relevanceScore,
        actionSuggestion: c.actionSuggestion,
      })),
      opportunities: growthOpps.map((o) => ({
        title: o.title,
        description: o.description,
        relevanceScore: o.relevanceScore,
        actionSuggestion: o.actionSuggestion,
      })),
      unansweredComments: unansweredCount,
      momentumConcern,
      completedVideos: videoCount,
      pendingApprovals: approvalCount,
      unimplementedLessons: lessonCount,
      competitorAlerts: compAlerts,
      collectedAt: new Date().toISOString(),
    };

    io?.emit('director:research_complete', { complete: true });

    await logAgentAction({
      action: 'runResearchWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: JSON.stringify({ trends: trends.length, opportunities: growthOpps.length }),
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return { researchReport };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(\`[Director] runResearchWorker error:\`, msg);
    await logAgentAction({
      action: 'runResearchWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    return { researchReport: { trends: [], competitorMoves: [], opportunities: [], unansweredComments: 0, momentumConcern: false, completedVideos: 0, pendingApprovals: 0, unimplementedLessons: 0, competitorAlerts: 0, collectedAt: new Date().toISOString() } };
  }
}
`;

code = code.substring(0, runResearchWorkerStart) + newRunResearchWorker + '\n' + code.substring(runAnalyticsWorkerStart);

// Replace synthesize
const synthesizeStart = code.indexOf('async function synthesize(state: Partial<MarketingDirectorState>): Promise<Partial<MarketingDirectorState>> {');
const graphWiringStart = code.indexOf('/* ------------------------------------------------------------------ */\n/*  Graph Wiring');

if (synthesizeStart === -1 || graphWiringStart === -1) {
  console.log('Could not find synthesize boundaries');
  process.exit(1);
}

const newSynthesize = `async function synthesize(state: Partial<MarketingDirectorState>): Promise<Partial<MarketingDirectorState>> {
  const start = Date.now();
  console.log(\`[Director] synthesize — Marketing Director analyzing all reports...\`);

  try {
    const brandRow = db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, state.brandProfileId!))
      .get();

    const brandContext = brandRow
      ? JSON.stringify({
          name: brandRow.name,
          industry: brandRow.industry,
          audience: brandRow.audience,
        })
      : 'Unknown brand';

    const prompt = \`You are the proactive Marketing Director for this brand. Your team has given you the following reports.
Research: \${JSON.stringify(state.researchReport)}
Content opportunities: \${JSON.stringify(state.contentOpportunities)}
Brand context: \${brandContext}

Your job: produce a prioritized list of Opportunities based on these signals.
For each opportunity, output:
- type (enum: trend_to_capitalize, competitor_alert, engagement_needed, momentum_concern, content_ready, video_ready, approval_waiting, unimplemented_lesson)
- title (short, specific, no jargon)
- description (one sentence explaining what VIMO found)
- potentialImpact (e.g. "+14% engagement" or "+80 followers/week" - be specific, derive from historical data)
- urgency (enum: act_now, act_today, act_this_week)
- actionLabel (e.g. "Create content", "Reply to comments", "Schedule video", "Approve posts")
- actionType (enum: navigate, execute, approve_all)
- actionPayload (object - data needed to execute: for navigate, the route; for execute, the function and params; for approve_all, the request type)

Return JSON:
{
  "executiveSummary": "string",
  "opportunities": [
    {
      "type": "...",
      "title": "...",
      "description": "...",
      "potentialImpact": "...",
      "urgency": "...",
      "actionLabel": "...",
      "actionType": "...",
      "actionPayload": {}
    }
  ]
}\`;

    const text = await callWithProviderChain(
      'marketing director synthesis',
      async (provider, modelId) => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        return t;
      },
      () =>
        JSON.stringify({
          executiveSummary: 'Routine check complete.',
          opportunities: []
        }),
    );

    const parsed = JSON.parse(text.trim().replace(/^\\s*\`\`\`json\\s*/i, '').replace(/\\s*\`\`\`\\s*$/i, ''));

    const directorSummary = parsed.executiveSummary || '';
    const opps: Opportunity[] = (parsed.opportunities || []).map((o: any) => ({
      id: crypto.randomUUID(),
      type: o.type,
      title: o.title,
      description: o.description,
      potentialImpact: o.potentialImpact,
      urgency: o.urgency,
      actionLabel: o.actionLabel,
      actionType: o.actionType,
      actionPayload: o.actionPayload || {},
      isActedOn: false,
      detectedAt: new Date().toISOString()
    }));

    const now = new Date();
    
    // Purge unacted-on opportunities older than 48 hours for this brand
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    db.delete(opportunities)
      .where(
        and(
          eq(opportunities.brandProfileId, state.brandProfileId!),
          eq(opportunities.isActedOn, 0),
          lte(opportunities.createdAt, fortyEightHoursAgo)
        )
      ).run();

    // Insert new opportunities
    for (const opp of opps) {
      db.insert(opportunities).values({
        id: opp.id,
        brandProfileId: state.brandProfileId!,
        type: opp.type,
        title: opp.title,
        description: opp.description,
        potentialImpact: opp.potentialImpact,
        urgency: opp.urgency,
        actionLabel: opp.actionLabel,
        actionType: opp.actionType,
        actionPayloadJson: JSON.stringify(opp.actionPayload),
        isActedOn: 0,
        detectedAt: opp.detectedAt,
        actedOnAt: null,
        createdAt: now.toISOString()
      }).run();
    }

    // Save director session to DB
    const sessionId = state.sessionId || crypto.randomUUID();

    await db.insert(directorSessions).values({
      id: sessionId,
      brandProfileId: state.brandProfileId!,
      trigger: state.trigger!,
      researchReportJson: state.researchReport ? JSON.stringify(state.researchReport) : null,
      analyticsInsightsJson: state.analyticsInsights ? JSON.stringify(state.analyticsInsights) : null,
      contentOpportunitiesJson: state.contentOpportunities ? JSON.stringify(state.contentOpportunities) : null,
      engagementStatsJson: state.engagementStats ? JSON.stringify(state.engagementStats) : null,
      directorSummary,
      recommendedActionsJson: JSON.stringify([]), // legacy field
      morningBriefingJson: null,
      createdAt: now.toISOString(),
    });

    console.log(\`[Director] synthesize — Saved session \${sessionId} with \${opps.length} opportunities\`);

    // Emit socket event
    io?.emit('director:session_complete', {
      sessionId,
      directorSummary,
      opportunities: opps,
    });

    await logAgentAction({
      action: 'synthesize',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: \`Saved director session \${sessionId} with \${opps.length} opportunities\`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return {
      directorSummary,
      generatedOpportunities: opps,
      completedAt: now.toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(\`[Director] synthesize error:\`, msg);
    await logAgentAction({
      action: 'synthesize',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    return {
      directorSummary: 'The Marketing Director encountered an error while synthesizing results. Please try again.',
      generatedOpportunities: [],
      completedAt: new Date().toISOString(),
    };
  }
}
`;

code = code.substring(0, synthesizeStart) + newSynthesize + '\n' + code.substring(graphWiringStart);

// Append generateMorningBriefing at the end
const generateMorningBriefingCode = \`
export async function generateMorningBriefing(brandProfileId: string): Promise<MorningBriefing | null> {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  let greeting = 'Good morning.';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon.';
  else if (hour >= 17) greeting = 'Good evening.';
  else if (day === 1) greeting = 'Good Monday morning.';

  const pendingOpps = db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.brandProfileId, brandProfileId),
        eq(opportunities.isActedOn, 0)
      )
    )
    .all();

  if (pendingOpps.length === 0) {
    return null; // No briefing needed if no ops
  }

  const mappedOpps: Opportunity[] = pendingOpps.map(r => ({
    id: r.id,
    type: r.type as any,
    title: r.title,
    description: r.description,
    potentialImpact: r.potentialImpact,
    urgency: r.urgency as any,
    actionLabel: r.actionLabel,
    actionType: r.actionType as any,
    actionPayload: JSON.parse(r.actionPayloadJson || '{}'),
    isActedOn: Boolean(r.isActedOn),
    detectedAt: r.detectedAt
  }));

  greeting += \` VIMO found \${mappedOpps.length} opportunit\${mappedOpps.length === 1 ? 'y' : 'ies'} while you were away.\`;

  const briefing: MorningBriefing = {
    greeting,
    opportunityCount: mappedOpps.length,
    opportunities: mappedOpps,
    potentialTotalImpact: 'Multiple improvements across engagement and reach.', // Simpler combined logic
    generatedAt: now.toISOString()
  };

  const latestSession = db
    .select()
    .from(directorSessions)
    .where(eq(directorSessions.brandProfileId, brandProfileId))
    .orderBy(desc(directorSessions.createdAt))
    .limit(1)
    .get();

  if (latestSession) {
    db.update(directorSessions)
      .set({ morningBriefingJson: JSON.stringify(briefing) })
      .where(eq(directorSessions.id, latestSession.id))
      .run();
  }

  return briefing;
}
\`;

code += '\\n' + generateMorningBriefingCode;

fs.writeFileSync(file, code);
console.log('Successfully patched marketingDirector.ts');
