const API_BASE =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  `http://${window.location.hostname}:5000/api`;


export type AnalystVerdict =
  | 'benign'
  | 'suspicious'
  | 'malicious'
  | 'undetermined';


export type ReputationListType =
  | 'allow'
  | 'watch'
  | 'block';


export interface MedShieldFlow {
  src_ip: string | null;
  src_port: number | null;

  dest_ip: string | null;
  dest_port: number | null;

  protocol: string | null;
  application: string | null;
}


export interface MedShieldMetrics {
  risk_band: string | null;

  latest_mirs: number | null;
  max_mirs: number | null;

  latest_aps: number | null;
  max_aps: number | null;

  rf_prediction: string | number | null;
  rf_attack_probability: number | null;
  max_rf_attack_probability: number | null;

  if_prediction: string | number | null;
  if_anomaly_score: number | null;
  max_if_anomaly_score: number | null;

  feature_coverage: number | null;
  real_feature_coverage: number | null;
  average_real_feature_coverage: number | null;

  ml_fusion_enabled: boolean;

  matched_event_count: number | null;
  latest_timestamp: string | null;

  mirs_breakdown: Record<string, unknown>;
  healthcare_context: Record<string, unknown>;

  explanations: unknown[];

  latest_flow: MedShieldFlow | null;
}


export interface EvidenceStatus {
  available: boolean;
  error: string | null;
}


export interface MedShieldIpResult {
  ip: string;
  generated_at: string;

  sources: {
    external_reputation: EvidenceStatus;
    intelligence: EvidenceStatus;
    history: EvidenceStatus;
    analyst: EvidenceStatus;
    local_correlation: EvidenceStatus;
    operational: EvidenceStatus;
    wazuh: EvidenceStatus;
  };

  medshield: MedShieldMetrics;

  external_reputation: unknown;
  intelligence: unknown;
  history: unknown;
  analyst: unknown;
  correlation: unknown;
  operational: unknown;
  wazuh: unknown;
}


async function requestJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {

  const response =
    await fetch(
      `${API_BASE}${path}`,
      {
        ...options,

        headers: {
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      }
    );

  const text =
    await response.text();

  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body
        ? String(
            (body as { error?: unknown }).error
          )
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);

    throw new Error(
      message ||
      `Request failed (${response.status})`
    );
  }

  return body as T;
}


// ============================================================
// FULL INVESTIGATION
// ============================================================

export function checkIpReputation(
  ip: string
): Promise<MedShieldIpResult> {

  return requestJson<MedShieldIpResult>(
    `/ip-reputation/medshield/${
      encodeURIComponent(ip)
    }`
  );
}


// ============================================================
// ANALYST VERDICT
// ============================================================

export function setAnalystVerdict(
  ip: string,
  verdict: AnalystVerdict,
  reason = '',
  actor = 'medisiem-analyst'
): Promise<unknown> {

  return requestJson(
    '/ip-reputation/analyst/verdict',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        ip,
        verdict,
        reason,
        actor,
      }),
    }
  );
}


// ============================================================
// ANALYST NOTE
// ============================================================

export function addAnalystNote(
  ip: string,
  note: string,
  actor = 'medisiem-analyst'
): Promise<unknown> {

  return requestJson(
    '/ip-reputation/analyst/note',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        ip,
        note,
        actor,
      }),
    }
  );
}


// ============================================================
// ALLOW / WATCH / BLOCK
// ============================================================

export function addIpToList(
  ip: string,
  listType: ReputationListType,
  reason = '',
  actor = 'medisiem-analyst'
): Promise<unknown> {

  return requestJson(
    '/ip-reputation/lists',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        ip,
        list_type: listType,
        reason,
        actor,
      }),
    }
  );
}


export function getIntelligenceLists(
  listType?: ReputationListType
): Promise<unknown> {

  const suffix =
    listType
      ? `?list_type=${encodeURIComponent(listType)}`
      : '';

  return requestJson(
    `/ip-reputation/lists${suffix}`
  );
}


// ============================================================
// CASE MANAGEMENT
// ============================================================

export function createInvestigationCase(
  ip: string,
  title: string,
  description = '',
  severity = 'Medium',
  actor = 'medisiem-analyst'
): Promise<unknown> {

  return requestJson(
    '/ip-reputation/cases',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        ip,
        title,
        description,
        severity,
        actor,
      }),
    }
  );
}


export function getInvestigationCases(
  limit = 100,
  status?: string
): Promise<unknown> {

  const params =
    new URLSearchParams();

  params.set(
    'limit',
    String(limit)
  );

  if (status) {
    params.set(
      'status',
      status
    );
  }

  return requestJson(
    `/ip-reputation/cases?${params.toString()}`
  );
}


// ============================================================
// LIVE MEDSHIELD ML IP FEED
// ============================================================

export interface LiveIpFeedItem {
  ip: string;

  flow_count: number;
  source_matches: number;
  destination_matches: number;

  latest_timestamp: string | null;

  latest_risk_level: string | null;

  latest_mirs: number | null;
  max_mirs: number | null;

  latest_aps: number | null;
  max_aps: number | null;

  latest_rf_prediction:
    string | number | null;

  latest_rf_attack_probability:
    number | null;

  max_rf_attack_probability:
    number | null;

  latest_if_prediction:
    string | number | null;

  latest_if_anomaly_score:
    number | null;

  max_if_anomaly_score:
    number | null;

  ml_fusion_observed: boolean;

  latest_real_feature_coverage:
    number | null;

  latest_supplied_feature_coverage:
    number | null;

  risk_band: string;

  suspicious: boolean;

  latest_flow: {
    src_ip: string | null;
    src_port: number | null;
    dest_ip: string | null;
    dest_port: number | null;
    protocol: string | null;
    application: string | null;
    flow_id: string | number | null;
  } | null;
}


export interface LiveIpFeedResponse {
  available: boolean;
  status: string;

  records_scanned: number;

  unique_public_ips: number;
  returned_count: number;
  suspicious_count: number;

  items: LiveIpFeedItem[];
}


export async function getLiveIpFeed(
  scanLimit = 1000,
  maxItems = 50
): Promise<LiveIpFeedResponse> {

  const params =
    new URLSearchParams();

  params.set(
    'scan_limit',
    String(scanLimit)
  );

  params.set(
    'max_items',
    String(maxItems)
  );

  const response = await fetch(
    `${API_BASE}/ip-reputation/live-feed?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }
  );

  const text =
    await response.text();

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {

    const detail =
      typeof body === 'string'
        ? body
        : JSON.stringify(body);

    throw new Error(
      `Live IP feed failed (${response.status}): ${detail}`
    );
  }

  return body as LiveIpFeedResponse;
}
