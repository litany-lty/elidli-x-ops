import { ContractError, validate } from './contracts.mjs';
import { analyzeAccount } from './account.mjs';

function fail(code, path, message) {
  throw new ContractError(code, path, message, false);
}

function values(object) {
  return Object.values(object ?? {});
}

/** Build the deterministic part of a review from persisted publication/post/snapshot records. */
export function buildReview(input, state) {
  validate('ReviewInput', input);
  const targetHandle = String(input.account.handle).replace(/^@/, '').toLowerCase();
  const stateHandle = String(state.account?.handle ?? targetHandle).replace(/^@/, '').toLowerCase();
  if (targetHandle !== stateHandle || (input.account.user_id && state.account?.user_id && input.account.user_id !== state.account.user_id)) {
    fail('IDENTITY_MISMATCH', '/account', '复盘账号与持久状态账号不一致');
  }
  const publicationIds = input.publication_ids ?? [];
  const explicitPostIds = input.post_ids ?? [];
  const publications = publicationIds.map(id => state.publications?.[id] ?? fail('MISSING_EVIDENCE', `/publication_ids/${id}`, '找不到发布记录'));
  const publishedPostIds = publications.map(item => item.post_id);
  const postIds = [...new Set([...explicitPostIds, ...publishedPostIds])];
  if (!postIds.length) fail('MISSING_EVIDENCE', '/post_ids', '复盘至少需要一个已确认发布或明确帖子');
  const posts = values(state.posts).filter(post => postIds.includes(post.post_id) || postIds.includes(post.post_key));
  const missing = postIds.filter(id => !posts.some(post => post.post_id === id || post.post_key === id));
  if (missing.length) fail('MISSING_EVIDENCE', '/post_ids', `找不到帖子记录：${missing.join(', ')}`);
  const requestedSnapshotIds = new Set(input.snapshot_ids);
  const allSnapshots = values(state.snapshots);
  const postSourceIds = new Set(posts.map(post => post.source_ref).filter(Boolean));
  const snapshots = allSnapshots.filter(snapshot => requestedSnapshotIds.size ? requestedSnapshotIds.has(snapshot.snapshot_id) :
    (posts.some(post => snapshot.entity_id === post.post_key) || snapshot.entity_type === 'account') && postSourceIds.has(snapshot.source_ref));
  const sourceIds = [...new Set([...postSourceIds, ...snapshots.map(item => item.source_ref)].filter(Boolean))];
  const sources = sourceIds.map(source_id => state.sources?.[source_id]?.record ?? state.sources?.[source_id]).filter(Boolean);
  const requestedScope = input.requested_scope ?? {
    mode: 'sample',
    selection_policy: {
      cutoff: input.analysis_cutoff,
      windows_days: [7, 28],
      age_windows: input.age_windows ?? [{ target_hours: 24, tolerance_hours: 2 }],
      group_by: ['post_type', 'primary_topic'],
      requested_metrics: input.requested_metrics ?? ['impressions', 'likes', 'replies', 'reposts', 'quotes'],
      metric_scope: input.metric_scope ?? 'public_total',
      source_selection: sourceIds
    },
    requested_outputs: ['content', 'latest', 'age_matched', 'comparison']
  };
  const accountInput = {
    schema_version: 1,
    account: input.account,
    analysis_cutoff: input.analysis_cutoff,
    requested_scope: requestedScope,
    coverage: input.coverage ?? {
      requested_start: null, requested_end: input.analysis_cutoff, observed_oldest: null, observed_newest: null,
      source_mode: 'persisted_review', status: 'sample', pages_read: 0, has_more: false, stop_reason: 'selected_publications',
      raw_item_count: posts.length, deduplicated_count: posts.length, metric_available_counts: {}
    },
    posts, snapshots, source_refs: sources, data_mode: input.data_mode ?? 'live'
  };
  const account_result = analyzeAccount(accountInput, requestedScope.selection_policy);
  const draft_links = publications.map(publication => {
    const adoption = publication.adoption_id ? state.adoptions?.[publication.adoption_id] : null;
    return {
      publication_id: publication.publication_id,
      post_id: publication.post_id,
      adoption_id: publication.adoption_id ?? null,
      draft_id: adoption?.draft_id ?? null,
      revision: adoption?.revision ?? null
    };
  });
  const source_angle_links = draft_links.map(link => {
    const draft = link.draft_id && link.revision ? state.drafts?.[link.draft_id]?.revisions?.[link.revision] : null;
    const run = values(state.runs).find(candidate => candidate.draft_refs?.some(ref => ref.draft_id === link.draft_id && ref.revision === link.revision));
    const card = run?.cards?.find(candidate => candidate.card_id === draft?.card_id) ?? run?.cards?.find(candidate => candidate.card_id === run.card_ids?.[0]) ?? null;
    const event = card ? state.events?.[card.event_id] : null;
    const claims = (card?.claim_ids ?? []).map(id => state.claims?.[id]).filter(Boolean);
    const sourceVersionIds = [...new Set([...(event?.source_version_ids ?? []), ...claims.flatMap(claim => claim.source_version_ids ?? [])])];
    return { publication_id: link.publication_id, draft_id: link.draft_id, revision: link.revision, card_id: card?.card_id ?? null,
      event_id: card?.event_id ?? null, claim_ids: card?.claim_ids ?? [], source_version_ids: sourceVersionIds, angle: card?.angle ?? null };
  });
  const limitations = [...account_result.limitations];
  if (!publications.length) limitations.push('本次按明确帖子复盘，没有已确认发布记录，无法判断采用的草稿版本');
  if (!snapshots.some(snapshot => snapshot.entity_type === 'post')) limitations.push('没有帖子指标观测，无法评估发布后表现');
  const result = {
    account: input.account,
    cutoff: input.analysis_cutoff,
    publication_links: draft_links,
    selected_observations: account_result.selection_log,
    descriptive_statistics: account_result,
    source_angle_links,
    limitations,
    finding_proposals: [],
    next_experiment: null,
    semantic_review_required: true
  };
  validate('ReviewResult', result);
  return result;
}
