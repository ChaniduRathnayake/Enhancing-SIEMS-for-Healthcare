import express from 'express';
import net from 'node:net';

const router = express.Router();

const MEDSHIELD_BASE = (
  process.env.MEDSHIELD_WINDOWS_API_URL ||
  'http://127.0.0.1:8088'
).replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 15000;


// ============================================================
// LOW LEVEL MEDSHIELD REQUEST
// ============================================================

async function fetchJson(path, options = {}) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${MEDSHIELD_BASE}${path}`,
      {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      }
    );

    const text = await response.text();

    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);

        // Compatibility with older MedShield endpoints that
        // accidentally returned JSON encoded inside a string.
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            // Keep original string.
          }
        }
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const error = new Error(
        `MedShield ${response.status}: ${
          typeof data === 'string'
            ? data
            : JSON.stringify(data)
        }`
      );

      error.status = response.status;
      error.payload = data;

      throw error;
    }

    return data;

  } finally {
    clearTimeout(timer);
  }
}


function getJson(path) {
  return fetchJson(path);
}


function postJson(path, body) {
  return fetchJson(path, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
    },

    body: JSON.stringify(body),
  });
}


function validIp(ip) {
  return net.isIP(String(ip || '').trim()) !== 0;
}


function rejectedMessage(result) {
  if (result.status !== 'rejected') return null;

  return (
    result.reason?.message ||
    'MedShield source unavailable'
  );
}


function fulfilledValue(result) {
  return result.status === 'fulfilled'
    ? result.value
    : null;
}


// ============================================================
// NORMALISE THE EXISTING LOCAL ML SUMMARY
// ============================================================

function buildMlSummary(correlation) {
  const mirsEvidence =
    correlation?.mirs_evidence || {};

  const summary =
    correlation?.summary || {};

  const events =
    Array.isArray(correlation?.events)
      ? correlation.events
      : [];

  const latestEvent =
    events.length > 0
      ? events[0]
      : null;

  const rf =
    latestEvent?.random_forest || {};

  const isolationForest =
    latestEvent?.isolation_forest || {};

  return {
    risk_band:
      mirsEvidence?.risk_band ??
      latestEvent?.risk_level ??
      null,

    latest_mirs:
      mirsEvidence?.latest_score ??
      summary?.latest_mirs ??
      latestEvent?.mirs ??
      null,

    max_mirs:
      mirsEvidence?.max_score ??
      summary?.max_mirs ??
      null,

    latest_aps:
      mirsEvidence?.latest_aps ??
      summary?.latest_aps ??
      latestEvent?.aps ??
      null,

    max_aps:
      mirsEvidence?.max_aps ??
      null,

    rf_prediction:
      rf?.prediction ?? null,

    rf_attack_probability:
      rf?.attack_probability ?? null,

    max_rf_attack_probability:
      summary?.max_rf_attack_probability ??
      null,

    if_prediction:
      isolationForest?.prediction ??
      null,

    if_anomaly_score:
      isolationForest?.anomaly_score ??
      null,

    max_if_anomaly_score:
      summary?.max_if_anomaly_score ??
      null,

    feature_coverage:
      mirsEvidence?.feature_coverage ??
      latestEvent?.ml_feature_coverage ??
      null,

    real_feature_coverage:
      mirsEvidence?.real_feature_coverage ??
      latestEvent?.ml_real_feature_coverage ??
      null,

    average_real_feature_coverage:
      summary?.average_real_feature_coverage ??
      null,

    ml_fusion_enabled:
      mirsEvidence?.ml_fusion_enabled ??
      latestEvent?.ml_fusion_enabled ??
      false,

    matched_event_count:
      correlation?.matched_event_count ??
      correlation?.records_scanned ??
      events.length,

    latest_timestamp:
      mirsEvidence?.timestamp ??
      summary?.latest_timestamp ??
      latestEvent?.timestamp ??
      null,

    mirs_breakdown:
      mirsEvidence?.breakdown || {},

    healthcare_context:
      mirsEvidence?.healthcare_context || {},

    explanations:
      mirsEvidence?.explanations || [],

    latest_flow: latestEvent
      ? {
          src_ip:
            latestEvent.src_ip ?? null,

          src_port:
            latestEvent.src_port ?? null,

          dest_ip:
            latestEvent.dest_ip ?? null,

          dest_port:
            latestEvent.dest_port ?? null,

          protocol:
            latestEvent.protocol ?? null,

          application:
            latestEvent.application ?? null,
        }
      : null,
  };
}


// ============================================================
// HEALTH
// ============================================================

router.get('/health', async (req, res) => {
  try {
    const health =
      await getJson('/api/health');

    return res.json({
      status: 'ok',
      bridge: 'medshield-ip-reputation',
      medshield_base: MEDSHIELD_BASE,
      medshield: health,
    });

  } catch (error) {
    return res.status(503).json({
      status: 'degraded',
      bridge: 'medshield-ip-reputation',
      medshield_base: MEDSHIELD_BASE,
      error: error.message,
    });
  }
});


// ============================================================
// COMPLETE IP INVESTIGATION
//
// One frontend request now retrieves:
//   external reputation
//   intelligence profile
//   reputation history
//   analyst intelligence
//   local ML correlation
//   operational assessment
//   Wazuh evidence
//
// Each evidence source fails independently.
// ============================================================

router.get('/medshield/:ip', async (req, res) => {
  const ip =
    String(req.params.ip || '').trim();

  if (!validIp(ip)) {
    return res.status(422).json({
      error: 'Invalid IP address',
      ip,
    });
  }

  const results = await Promise.allSettled([
    postJson(
      '/api/v1/reputation/lookup',
      { ip }
    ),

    getJson(
      `/api/v1/intelligence/${encodeURIComponent(ip)}`
    ),

    getJson(
      `/api/v1/intelligence/${encodeURIComponent(ip)}/history?limit=50`
    ),

    getJson(
      `/api/v1/analyst/${encodeURIComponent(ip)}`
    ),

    getJson(
      `/api/v1/correlation/${encodeURIComponent(ip)}?limit=100`
    ),

    Promise.reject(new Error('Operational assessment deferred while Wazuh is disabled')),

    Promise.reject(new Error('Wazuh evidence unavailable while Windows Wazuh is disabled')),
  ]);


  const [
    externalResult,
    intelligenceResult,
    historyResult,
    analystResult,
    correlationResult,
    operationalResult,
    wazuhResult,
  ] = results;


  const external =
    fulfilledValue(externalResult);

  const intelligence =
    fulfilledValue(intelligenceResult);

  const history =
    fulfilledValue(historyResult);

  const analyst =
    fulfilledValue(analystResult);

  const correlation =
    fulfilledValue(correlationResult);

  const operational =
    fulfilledValue(operationalResult);

  const wazuh =
    fulfilledValue(wazuhResult);


  return res.json({
    ip,

    generated_at:
      new Date().toISOString(),

    sources: {

      external_reputation: {
        available:
          externalResult.status === 'fulfilled',

        error:
          rejectedMessage(externalResult),
      },

      intelligence: {
        available:
          intelligenceResult.status === 'fulfilled',

        error:
          rejectedMessage(intelligenceResult),
      },

      history: {
        available:
          historyResult.status === 'fulfilled',

        error:
          rejectedMessage(historyResult),
      },

      analyst: {
        available:
          analystResult.status === 'fulfilled',

        error:
          rejectedMessage(analystResult),
      },

      local_correlation: {
        available:
          correlationResult.status === 'fulfilled',

        error:
          rejectedMessage(correlationResult),
      },

      operational: {
        available:
          operationalResult.status === 'fulfilled',

        error:
          rejectedMessage(operationalResult),
      },

      wazuh: {
        available:
          wazuhResult.status === 'fulfilled',

        error:
          rejectedMessage(wazuhResult),
      },
    },


    // Compact summary used by today's dashboard cards.
    medshield:
      buildMlSummary(correlation),


    // Full evidence is preserved for the stronger investigation UI.
    external_reputation:
      external,

    intelligence:
      intelligence,

    history:
      history,

    analyst:
      analyst,

    correlation:
      correlation,

    operational:
      operational,

    wazuh:
      wazuh,
  });
});


// ============================================================
// ANALYST VERDICT
//
// verdict:
// benign | suspicious | malicious | undetermined
// ============================================================

router.post('/analyst/verdict', async (req, res) => {
  try {
    const {
      ip,
      verdict,
      reason = '',
      actor = 'medisiem-analyst',
    } = req.body || {};

    if (!validIp(ip)) {
      return res.status(422).json({
        error: 'Invalid IP address',
      });
    }

    const allowed = new Set([
      'benign',
      'suspicious',
      'malicious',
      'undetermined',
    ]);

    if (!allowed.has(verdict)) {
      return res.status(422).json({
        error:
          'Verdict must be benign, suspicious, malicious, or undetermined',
      });
    }

    const data = await postJson(
      '/api/v1/analyst/verdict',
      {
        ip,
        verdict,
        reason,
        actor,
      }
    );

    return res.json(data);

  } catch (error) {
    return res
      .status(error.status || 502)
      .json({
        error: error.message,
      });
  }
});


// ============================================================
// ANALYST NOTE
// ============================================================

router.post('/analyst/note', async (req, res) => {
  try {
    const {
      ip,
      note,
      actor = 'medisiem-analyst',
    } = req.body || {};

    if (!validIp(ip)) {
      return res.status(422).json({
        error: 'Invalid IP address',
      });
    }

    if (
      typeof note !== 'string' ||
      !note.trim()
    ) {
      return res.status(422).json({
        error: 'Analyst note is required',
      });
    }

    const data = await postJson(
      '/api/v1/analyst/note',
      {
        ip,
        note: note.trim(),
        actor,
      }
    );

    return res.json(data);

  } catch (error) {
    return res
      .status(error.status || 502)
      .json({
        error: error.message,
      });
  }
});


// ============================================================
// ALLOW / WATCH / BLOCK
// ============================================================

router.post('/lists', async (req, res) => {
  try {
    const {
      ip,
      list_type,
      reason = '',
      actor = 'medisiem-analyst',
    } = req.body || {};

    if (!validIp(ip)) {
      return res.status(422).json({
        error: 'Invalid IP address',
      });
    }

    const allowed =
      new Set([
        'allow',
        'watch',
        'block',
      ]);

    if (!allowed.has(list_type)) {
      return res.status(422).json({
        error:
          'list_type must be allow, watch, or block',
      });
    }

    const data = await postJson(
      '/api/v1/lists',
      {
        ip,
        list_type,
        reason,
        actor,
      }
    );

    return res.json(data);

  } catch (error) {
    return res
      .status(error.status || 502)
      .json({
        error: error.message,
      });
  }
});


router.get('/lists', async (req, res) => {
  try {
    const type =
      req.query.list_type;

    const query =
      type
        ? `?list_type=${encodeURIComponent(type)}`
        : '';

    const data =
      await getJson(
        `/api/v1/lists${query}`
      );

    return res.json(data);

  } catch (error) {
    return res
      .status(error.status || 502)
      .json({
        error: error.message,
      });
  }
});


// ============================================================
// INVESTIGATION CASES
// ============================================================

router.post('/cases', async (req, res) => {
  try {
    const {
      ip,
      title,
      description = '',
      severity = 'Medium',
      actor = 'medisiem-analyst',
    } = req.body || {};

    if (!validIp(ip)) {
      return res.status(422).json({
        error: 'Invalid IP address',
      });
    }

    if (
      typeof title !== 'string' ||
      !title.trim()
    ) {
      return res.status(422).json({
        error: 'Case title is required',
      });
    }

    const data = await postJson(
      '/api/v1/cases',
      {
        ip,
        title: title.trim(),
        description,
        severity,
        actor,
      }
    );

    return res.json(data);

  } catch (error) {
    return res
      .status(error.status || 502)
      .json({
        error: error.message,
      });
  }
});


router.get('/cases', async (req, res) => {
  try {
    const params =
      new URLSearchParams();

    if (req.query.limit) {
      params.set(
        'limit',
        String(req.query.limit)
      );
    }

    if (req.query.status) {
      params.set(
        'status',
        String(req.query.status)
      );
    }

    const suffix =
      params.toString()
        ? `?${params.toString()}`
        : '';

    const data =
      await getJson(
        `/api/v1/cases${suffix}`
      );

    return res.json(data);

  } catch (error) {
    return res
      .status(error.status || 502)
      .json({
        error: error.message,
      });
  }
});



// ============================================================
// LIVE MEDSHIELD ML IP FEED
// ============================================================

router.get('/live-feed', async (req, res) => {
  try {
    const params = new URLSearchParams();

    const rawScanLimit =
      Number.parseInt(
        String(req.query.scan_limit ?? '1000'),
        10
      );

    const rawMaxItems =
      Number.parseInt(
        String(req.query.max_items ?? '50'),
        10
      );

    const scanLimit =
      Number.isFinite(rawScanLimit)
        ? Math.min(
            Math.max(rawScanLimit, 1),
            5000
          )
        : 1000;

    const maxItems =
      Number.isFinite(rawMaxItems)
        ? Math.min(
            Math.max(rawMaxItems, 1),
            200
          )
        : 50;

    params.set(
      'scan_limit',
      String(scanLimit)
    );

    params.set(
      'max_items',
      String(maxItems)
    );

    const result =
      await getJson(
        `/api/v1/correlation/live-feed?${params.toString()}`
      );

    return res.json(result);

  } catch (error) {

    console.error(
      '[MedShield] Live feed bridge error:',
      error.message
    );

    return res.status(503).json({
      available: false,
      status: 'medshield_live_feed_unavailable',
      error: error.message,
      items: [],
    });
  }
});


export default router;
