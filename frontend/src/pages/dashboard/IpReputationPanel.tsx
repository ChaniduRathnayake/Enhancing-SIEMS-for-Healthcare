import React, { useEffect, useState } from 'react';

import {
  Network,
  Search,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Globe,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

import {
  checkIpReputation,
  getLiveIpFeed,
  setAnalystVerdict,
  addAnalystNote,
  addIpToList,
  createInvestigationCase,
} from '../../services/ipReputationApi';

import type {
  MedShieldIpResult,
  AnalystVerdict,
  ReputationListType,
} from '../../services/ipReputationApi';


type UnknownRecord = Record<string, unknown>;


function asRecord(
  value: unknown
): UnknownRecord | null {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as UnknownRecord
    : null;
}


function asArray(
  value: unknown
): unknown[] {
  return Array.isArray(value) ? value : [];
}


function textValue(
  value: unknown,
  fallback = 'Unavailable'
): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  return fallback;
}


function nullableNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function formatNumber(
  value: unknown,
  suffix = ''
): string {
  const number = nullableNumber(value);

  return number === null
    ? 'Unavailable'
    : `${number.toFixed(2)}${suffix}`;
}


function riskClasses(
  band?: unknown
): string {
  const value =
    String(band || '').toLowerCase();

  switch (value) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700';

    case 'high':
      return 'border-orange-200 bg-orange-50 text-orange-700';

    case 'medium':
      return 'border-amber-200 bg-amber-50 text-amber-700';

    case 'low':
      return 'border-green-200 bg-green-50 text-green-700';

    case 'minimal':
      return 'border-green-200 bg-green-50 text-green-700';

    default:
      return 'border-gray-200 bg-gray-50 text-gray-700';
  }
}


function findValue(
  root: unknown,
  wantedKeys: string[]
): unknown {

  const wanted =
    new Set(
      wantedKeys.map(
        (key) => key.toLowerCase()
      )
    );

  const queue: unknown[] = [root];
  const visited = new Set<object>();

  while (queue.length > 0) {

    const current =
      queue.shift();

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }

      continue;
    }

    const record =
      asRecord(current);

    if (!record) continue;

    if (visited.has(record)) continue;
    visited.add(record);

    for (
      const [key, value]
      of Object.entries(record)
    ) {

      if (
        wanted.has(
          key.toLowerCase()
        )
      ) {
        return value;
      }

      if (
        Array.isArray(value) ||
        asRecord(value)
      ) {
        queue.push(value);
      }
    }
  }

  return null;
}


function friendlyDecision(
  value: unknown
): string {
  const text =
    textValue(value, 'Unavailable');

  return text
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}


const MetricCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
}> = ({
  title,
  value,
  subtitle,
}) => (
  <div className="
    rounded-xl border border-gray-200
    bg-white p-4 shadow-sm
  ">
    <div className="
      text-xs font-medium uppercase
      tracking-wide text-gray-500
    ">
      {title}
    </div>

    <div className="
      mt-2 text-2xl font-bold text-gray-900
    ">
      {value}
    </div>

    {subtitle && (
      <div className="
        mt-1 text-xs text-gray-500
      ">
        {subtitle}
      </div>
    )}
  </div>
);


const DataRow: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({
  label,
  value,
}) => (
  <div className="
    flex gap-4 border-b border-gray-100
    py-2 text-sm last:border-b-0
  ">
    <span className="
      min-w-40 text-gray-500
    ">
      {label}
    </span>

    <span className="
      break-all font-medium text-gray-900
    ">
      {value}
    </span>
  </div>
);


const SourceRow: React.FC<{
  name: string;
  available: boolean;
  detail: string;
}> = ({
  name,
  available,
  detail,
}) => (
  <div className="
    flex items-start gap-3
    rounded-lg border border-gray-100
    p-3
  ">
    {
      available
        ? (
          <ShieldCheck className="
            mt-0.5 h-5 w-5
            shrink-0 text-green-600
          " />
        )
        : (
          <AlertCircle className="
            mt-0.5 h-5 w-5
            shrink-0 text-amber-600
          " />
        )
    }

    <div>
      <div className="
        font-medium text-gray-900
      ">
        {name}
      </div>

      <div className="
        mt-0.5 text-xs text-gray-500
      ">
        {detail}
      </div>
    </div>
  </div>
);


const IpReputationPanel: React.FC = () => {

  const [liveFeed, setLiveFeed] =
    useState<
      Awaited<ReturnType<typeof getLiveIpFeed>> | null
    >(null);

  const [liveFeedError, setLiveFeedError] =
    useState<string | null>(null);


  useEffect(() => {

    let active = true;

    const refreshLiveFeed =
      async () => {

        try {

          const data =
            await getLiveIpFeed(
              1000,
              50
            );

          if (!active) return;

          setLiveFeed(data);
          setLiveFeedError(null);

        } catch (error) {

          if (!active) return;

          setLiveFeedError(
            error instanceof Error
              ? error.message
              : 'Live ML IP feed unavailable'
          );
        }
      };


    void refreshLiveFeed();


    const timer =
      window.setInterval(
        () => {
          void refreshLiveFeed();
        },
        5000
      );


    return () => {

      active = false;

      window.clearInterval(
        timer
      );
    };

  }, []);


  const [ip, setIp] =
    useState('');

  const [result, setResult] =
    useState<MedShieldIpResult | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [actionLoading, setActionLoading] =
    useState(false);

  const [actionMessage, setActionMessage] =
    useState<string | null>(null);

  const [actionError, setActionError] =
    useState<string | null>(null);


  // Analyst controls
  const [verdict, setVerdict] =
    useState<AnalystVerdict>('undetermined');

  const [verdictReason, setVerdictReason] =
    useState('');

  const [analystNote, setAnalystNote] =
    useState('');

  const [listReason, setListReason] =
    useState('');


  // Case controls
  const [caseTitle, setCaseTitle] =
    useState('');

  const [caseDescription, setCaseDescription] =
    useState('');

  const [caseSeverity, setCaseSeverity] =
    useState('Medium');


  async function loadInvestigation(
    targetIp?: string
  ) {

    const trimmed =
      (targetIp ?? ip).trim();

    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setActionMessage(null);
    setActionError(null);

    try {
      const data =
        await checkIpReputation(trimmed);

      setResult(data);
      setIp(trimmed);

      if (!caseTitle.trim()) {
        setCaseTitle(
          `Investigate ${trimmed}`
        );
      }

    } catch (err) {

      setResult(null);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to query MedShield'
      );

    } finally {
      setLoading(false);
    }
  }


  async function refreshAfterAction() {
    if (!result?.ip) return;

    const data =
      await checkIpReputation(
        result.ip
      );

    setResult(data);
  }


  async function runAction(
    action: () => Promise<unknown>,
    successMessage: string
  ) {

    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);

    try {
      await action();

      setActionMessage(
        successMessage
      );

      await refreshAfterAction();

    } catch (err) {

      setActionError(
        err instanceof Error
          ? err.message
          : 'Action failed'
      );

    } finally {
      setActionLoading(false);
    }
  }


  async function saveVerdict() {
    if (!result) return;

    await runAction(
      () =>
        setAnalystVerdict(
          result.ip,
          verdict,
          verdictReason.trim()
        ),

      `Analyst verdict saved as ${verdict}.`
    );
  }


  async function saveNote() {

    if (
      !result ||
      !analystNote.trim()
    ) {
      return;
    }

    const note =
      analystNote.trim();

    await runAction(
      () =>
        addAnalystNote(
          result.ip,
          note
        ),

      'Analyst note saved.'
    );

    setAnalystNote('');
  }


  async function setList(
    listType: ReputationListType
  ) {
    if (!result) return;

    await runAction(
      () =>
        addIpToList(
          result.ip,
          listType,
          listReason.trim()
        ),

      `IP added to ${listType.toUpperCase()} list.`
    );
  }


  async function createCase() {

    if (
      !result ||
      !caseTitle.trim()
    ) {
      return;
    }

    await runAction(
      () =>
        createInvestigationCase(
          result.ip,
          caseTitle.trim(),
          caseDescription.trim(),
          caseSeverity
        ),

      'Investigation case created successfully.'
    );
  }


  const external =
    result?.external_reputation;

  const abuseScore =
    external
      ? findValue(external, [
          'abuseConfidenceScore',
          'abuse_confidence_score',
          'abuse_score',
        ])
      : null;

  const abuseReports =
    external
      ? findValue(external, [
          'totalReports',
          'total_reports',
          'abuse_reports',
        ])
      : null;

  const country =
    external
      ? findValue(external, [
          'countryCode',
          'country_code',
          'country',
        ])
      : null;

  const vtMalicious =
    external
      ? findValue(external, [
          'vt_malicious',
          'malicious_count',
          'malicious',
        ])
      : null;

  const vtSuspicious =
    external
      ? findValue(external, [
          'vt_suspicious',
          'suspicious_count',
          'suspicious',
        ])
      : null;


  const historyEnvelope =
    asRecord(
      result?.history
    );

  const historyItems =
    asArray(
      historyEnvelope?.history
    );


  const analystEnvelope =
    asRecord(
      result?.analyst
    );

  const analyst =
    asRecord(
      analystEnvelope?.analyst_intelligence
    );

  const analystNotes =
    asArray(
      analyst?.notes
    );

  const verdictHistory =
    asArray(
      analyst?.verdict_history
    );


  const operational =
    asRecord(
      result?.operational
    );

  const operationalAssessment =
    asRecord(
      operational?.operational_assessment
    );

  const operationalDimensions =
    asRecord(
      operationalAssessment?.dimensions
    );

  const operationalReasons =
    asArray(
      operationalAssessment?.reasons
    );


  const internalIntelligence =
    asRecord(
      operational?.internal_intelligence
    );

  const memberships =
    asArray(
      internalIntelligence?.memberships
    );


  const localOperational =
    asRecord(
      operational?.local_ml_context
    );


  const wazuh =
    asRecord(
      result?.wazuh
    );

  const actualWazuhAvailable =
    wazuh?.available === true &&
    wazuh?.status !== 'wazuh_unavailable';

  const wazuhAlerts =
    asArray(
      wazuh?.alerts
    );


  const intelligenceAvailable =
    Boolean(
      result?.sources?.intelligence
        ?.available
    );

  const localEvidenceCount =
    result?.medshield
      ?.matched_event_count ?? 0;

  const hasLocalMlEvidence =
    localEvidenceCount > 0;

  const evidenceDimensions =
    nullableNumber(
      operationalAssessment
        ?.evidence_dimensions
    ) ?? 0;


  const mirsBreakdown =
    result?.medshield
      ?.mirs_breakdown ?? {};

  const mirsBreakdownEntries =
    Object.entries(
      mirsBreakdown
    );


  const healthcareContext =
    result?.medshield
      ?.healthcare_context ?? {};

  const healthcareEntries =
    Object.entries(
      healthcareContext
    );


  return (
    <div className="
      space-y-6 pb-10
    ">

      {/* =====================================================
          LIVE DETECTED IP INTELLIGENCE
          ===================================================== */}

      <section className="
        rounded-xl border border-gray-200
        bg-white shadow-sm
      ">

        <div className="
          flex flex-wrap items-center
          justify-between gap-3
          border-b border-gray-100
          px-5 py-4
        ">

          <div>
            <div className="
              text-xs font-semibold uppercase
              tracking-wider text-indigo-600
            ">
              LIVE DETECTED IP INTELLIGENCE
            </div>

            <div className="
              mt-1 text-lg font-semibold
              text-gray-900
            ">
              Real-time ML IP Monitor
            </div>

            <p className="
              mt-1 text-sm text-gray-500
            ">
              Public IPs observed in Suricata flow
              telemetry and scored by MedShield ML.
            </p>
          </div>


          <div className="
            flex items-center gap-2
            rounded-full border border-green-200
            bg-green-50 px-3 py-1
            text-xs font-medium text-green-700
          ">
            <RefreshCw className="
              h-3.5 w-3.5
            " />

            Auto-refresh 5s
          </div>
        </div>


        {liveFeedError && (
          <div className="
            m-4 rounded-lg border border-amber-200
            bg-amber-50 p-3
            text-sm text-amber-700
          ">
            {liveFeedError}
          </div>
        )}


        {!liveFeed && !liveFeedError && (
          <div className="
            flex items-center gap-2
            p-5 text-sm text-gray-500
          ">
            <Loader2 className="
              h-4 w-4 animate-spin
            " />

            Loading live ML evidence...
          </div>
        )}


        {liveFeed && (
          <>

            <div className="
              grid grid-cols-2 gap-3
              border-b border-gray-100
              p-4 sm:grid-cols-4
            ">

              <div className="
                rounded-lg bg-gray-50 p-3
              ">
                <div className="
                  text-xs text-gray-500
                ">
                  Records scanned
                </div>

                <div className="
                  mt-1 text-xl font-bold
                  text-gray-900
                ">
                  {liveFeed.records_scanned}
                </div>
              </div>


              <div className="
                rounded-lg bg-gray-50 p-3
              ">
                <div className="
                  text-xs text-gray-500
                ">
                  Public IPs
                </div>

                <div className="
                  mt-1 text-xl font-bold
                  text-gray-900
                ">
                  {liveFeed.unique_public_ips}
                </div>
              </div>


              <div className="
                rounded-lg bg-gray-50 p-3
              ">
                <div className="
                  text-xs text-gray-500
                ">
                  Suspicious
                </div>

                <div className="
                  mt-1 text-xl font-bold
                  text-gray-900
                ">
                  {liveFeed.suspicious_count}
                </div>
              </div>


              <div className="
                rounded-lg bg-gray-50 p-3
              ">
                <div className="
                  text-xs text-gray-500
                ">
                  Feed Status
                </div>

                <div className="
                  mt-1 text-sm font-semibold
                  text-green-700
                ">
                  {liveFeed.available
                    ? 'Connected'
                    : 'Unavailable'}
                </div>
              </div>
            </div>


            {liveFeed.items.length === 0 ? (

              <div className="
                p-5 text-sm text-gray-500
              ">
                No public IP flow evidence has
                been ingested yet.
              </div>

            ) : (

              <div className="
                overflow-x-auto
              ">

                <table className="
                  min-w-full text-left text-sm
                ">

                  <thead className="
                    bg-gray-50 text-xs uppercase
                    tracking-wide text-gray-500
                  ">
                    <tr>
                      <th className="px-4 py-3">
                        IP
                      </th>

                      <th className="px-4 py-3">
                        Flows
                      </th>

                      <th className="px-4 py-3">
                        Latest MIRS
                      </th>

                      <th className="px-4 py-3">
                        Peak MIRS
                      </th>

                      <th className="px-4 py-3">
                        APS
                      </th>

                      <th className="px-4 py-3">
                        RF
                      </th>

                      <th className="px-4 py-3">
                        IF
                      </th>

                      <th className="px-4 py-3">
                        Peak Risk
                      </th>

                      <th className="px-4 py-3">
                        Action
                      </th>
                    </tr>
                  </thead>


                  <tbody className="
                    divide-y divide-gray-100
                  ">

                    {liveFeed.items.map(
                      (row) => (

                        <tr
                          key={row.ip}
                          className="
                            hover:bg-gray-50
                          "
                        >

                          <td className="
                            px-4 py-3
                          ">
                            <div className="
                              font-mono font-semibold
                              text-gray-900
                            ">
                              {row.ip}
                            </div>

                            <div className="
                              mt-1 whitespace-nowrap
                              text-xs text-gray-400
                            ">
                              {row.latest_timestamp ||
                                'Timestamp unavailable'}
                            </div>
                          </td>


                          <td className="
                            px-4 py-3 font-medium
                          ">
                            {row.flow_count}
                          </td>


                          <td className="
                            px-4 py-3
                          ">
                            {formatNumber(
                              row.latest_mirs
                            )}
                          </td>


                          <td className="
                            px-4 py-3
                          ">
                            {formatNumber(
                              row.max_mirs
                            )}
                          </td>


                          <td className="
                            px-4 py-3
                          ">
                            {formatNumber(
                              row.latest_aps,
                              '%'
                            )}
                          </td>


                          <td className="
                            px-4 py-3
                          ">
                            {formatNumber(
                              row.latest_rf_attack_probability,
                              '%'
                            )}
                          </td>


                          <td className="
                            px-4 py-3
                          ">
                            {formatNumber(
                              row.latest_if_anomaly_score,
                              '%'
                            )}
                          </td>


                          <td className="
                            px-4 py-3
                          ">
                            <span
                              className={`
                                inline-flex rounded-full
                                border px-2.5 py-1
                                text-xs font-semibold
                                ${riskClasses(
                                  row.risk_band
                                )}
                              `}
                            >
                              {row.risk_band}
                            </span>
                          </td>


                          <td className="
                            px-4 py-3
                          ">
                            <button
                              type="button"
                              onClick={() => {
                                setIp(row.ip);

                                void loadInvestigation(
                                  row.ip
                                );
                              }}
                              className="
                                rounded-lg bg-indigo-600
                                px-3 py-2
                                text-xs font-semibold
                                text-white
                                hover:bg-indigo-700
                              "
                            >
                              Investigate
                            </button>
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </section>


      {/* HEADER */}
      <div className="
        flex flex-wrap items-center
        gap-3
      ">
        <div className="
          rounded-lg bg-indigo-50 p-2
        ">
          <Network className="
            h-5 w-5 text-indigo-600
          " />
        </div>

        <div>
          <h2 className="
            text-lg font-semibold text-gray-900
          ">
            MedShield IP Reputation Intelligence
          </h2>

          <p className="
            text-sm text-gray-500
          ">
            Multi-source IP investigation,
            local ML correlation and analyst workflow
          </p>
        </div>
      </div>


      {/* SEARCH */}
      <div className="
        flex max-w-3xl gap-2
      ">
        <input
          type="text"
          value={ip}
          onChange={(event) =>
            setIp(event.target.value)
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter'
            ) {
              void loadInvestigation();
            }
          }}
          placeholder="Enter an IP address, e.g. 146.190.84.8"
          className="
            flex-1 rounded-lg
            border border-gray-300
            px-3 py-2
            focus:border-indigo-500
            focus:ring-2 focus:ring-indigo-500
          "
        />

        <button
          type="button"
          onClick={() =>
            void loadInvestigation()
          }
          disabled={
            loading ||
            !ip.trim()
          }
          className="
            flex items-center gap-2
            rounded-lg bg-indigo-600
            px-4 py-2 text-white
            hover:bg-indigo-700
            disabled:opacity-50
          "
        >
          {
            loading
              ? (
                <Loader2 className="
                  h-4 w-4 animate-spin
                " />
              )
              : (
                <Search className="
                  h-4 w-4
                " />
              )
          }

          Investigate
        </button>

        {result && (
          <button
            type="button"
            title="Refresh investigation"
            onClick={() =>
              void loadInvestigation(
                result.ip
              )
            }
            disabled={loading}
            className="
              rounded-lg border
              border-gray-300
              bg-white px-3 py-2
              text-gray-700
              hover:bg-gray-50
              disabled:opacity-50
            "
          >
            <RefreshCw className="
              h-4 w-4
            " />
          </button>
        )}
      </div>


      {error && (
        <div className="
          flex max-w-4xl items-center
          gap-2 rounded-lg
          border border-red-200
          bg-red-50 px-4 py-3
          text-sm text-red-700
        ">
          <AlertCircle className="
            h-4 w-4
          " />

          {error}
        </div>
      )}


      {result && (
        <>

          {/* INVESTIGATION SUMMARY */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <div className="
              flex flex-wrap
              items-start gap-4
            ">

              <div>
                <div className="
                  text-xs font-medium
                  uppercase tracking-wide
                  text-gray-500
                ">
                  Investigated IP
                </div>

                <div className="
                  mt-1 text-xl font-semibold
                  text-gray-900
                ">
                  {result.ip}
                </div>
              </div>


              <div className="
                ml-auto flex flex-wrap gap-2
              ">

                <span className={`
                  rounded-full border
                  px-3 py-1
                  text-sm font-medium
                  ${riskClasses(
                    result.medshield.risk_band
                  )}
                `}>
                  {
                    result.medshield.risk_band
                      ? `MIRS: ${result.medshield.risk_band}`
                      : 'MIRS unavailable'
                  }
                </span>


                <span className={`
                  rounded-full border
                  px-3 py-1
                  text-sm font-medium
                  ${
                    result.medshield
                      .ml_fusion_enabled
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600'
                  }
                `}>
                  ML Fusion: {
                    result.medshield
                      .ml_fusion_enabled
                      ? 'Enabled'
                      : 'Not enabled'
                  }
                </span>


                {analyst?.current_verdict ? (
                  <span className="
                    rounded-full border
                    border-indigo-200
                    bg-indigo-50
                    px-3 py-1
                    text-sm font-medium
                    text-indigo-700
                  ">
                    Analyst: {
                      friendlyDecision(
                        analyst.current_verdict
                      )
                    }
                  </span>
                ) : (
                  <span className="
                    rounded-full border
                    border-gray-200
                    bg-gray-50
                    px-3 py-1
                    text-sm font-medium
                    text-gray-600
                  ">
                    No analyst verdict
                  </span>
                )}
              </div>
            </div>
          </section>


          {/* NO LOCAL EVIDENCE NOTICE */}
          {!hasLocalMlEvidence && (
            <div className="
              rounded-xl border
              border-amber-200
              bg-amber-50 p-4
              text-sm text-amber-800
            ">
              <strong>
                No matching local ML evidence yet.
              </strong>{' '}

              The Windows database is reachable,
              but this IP currently has no correlated
              stored flow observations. ML, APS and
              MIRS values therefore remain unavailable.
            </div>
          )}


          {/* LOCAL ML */}
          <section>
            <div className="mb-3">
              <h3 className="
                font-semibold text-gray-900
              ">
                Local MedShield ML Evidence
              </h3>

              <p className="
                text-sm text-gray-500
              ">
                Random Forest, Isolation Forest,
                APS, MIRS and feature provenance
              </p>
            </div>

            <div className="
              grid grid-cols-1 gap-4
              md:grid-cols-2
              xl:grid-cols-3
            ">

              <MetricCard
                title="MIRS"
                value={formatNumber(
                  result.medshield.latest_mirs
                )}
                subtitle={`Max observed: ${
                  formatNumber(
                    result.medshield.max_mirs
                  )
                }`}
              />

              <MetricCard
                title="APS"
                value={formatNumber(
                  result.medshield.latest_aps,
                  '%'
                )}
                subtitle="Random Forest attack probability signal"
              />

              <MetricCard
                title="RF Attack Probability"
                value={formatNumber(
                  result.medshield
                    .rf_attack_probability ??
                  result.medshield
                    .max_rf_attack_probability,
                  '%'
                )}
                subtitle={
                  result.medshield
                    .rf_prediction !== null
                    ? `Prediction: ${
                        result.medshield
                          .rf_prediction
                      }`
                    : 'Prediction unavailable'
                }
              />

              <MetricCard
                title="IF Anomaly Score"
                value={formatNumber(
                  result.medshield
                    .if_anomaly_score ??
                  result.medshield
                    .max_if_anomaly_score,
                  '%'
                )}
                subtitle={
                  result.medshield
                    .if_prediction !== null
                    ? `Prediction: ${
                        result.medshield
                          .if_prediction
                      }`
                    : 'Prediction unavailable'
                }
              />

              <MetricCard
                title="Real Feature Coverage"
                value={formatNumber(
                  result.medshield
                    .real_feature_coverage,
                  '%'
                )}
                subtitle={`Supplied coverage: ${
                  formatNumber(
                    result.medshield
                      .feature_coverage,
                    '%'
                  )
                }`}
              />

              <MetricCard
                title="Local Flow Evidence"
                value={
                  String(
                    result.medshield
                      .matched_event_count ?? 0
                  )
                }
                subtitle="Matching stored flow observations"
              />
            </div>
          </section>


          {/* LATEST FLOW */}
          {result.medshield.latest_flow && (
            <section className="
              rounded-xl border
              border-gray-200
              bg-white p-5 shadow-sm
            ">
              <h3 className="
                mb-3 font-semibold
                text-gray-900
              ">
                Latest Correlated Flow
              </h3>

              <div className="
                grid grid-cols-1 gap-4
                md:grid-cols-4
              ">
                <DataRow
                  label="Source"
                  value={`${result.medshield.latest_flow.src_ip ?? 'N/A'}${
                    result.medshield.latest_flow.src_port !== null
                      ? `:${result.medshield.latest_flow.src_port}`
                      : ''
                  }`}
                />

                <DataRow
                  label="Destination"
                  value={`${result.medshield.latest_flow.dest_ip ?? 'N/A'}${
                    result.medshield.latest_flow.dest_port !== null
                      ? `:${result.medshield.latest_flow.dest_port}`
                      : ''
                  }`}
                />

                <DataRow
                  label="Protocol"
                  value={
                    result.medshield
                      .latest_flow.protocol ??
                    'N/A'
                  }
                />

                <DataRow
                  label="Application"
                  value={
                    result.medshield
                      .latest_flow.application ??
                    'N/A'
                  }
                />
              </div>
            </section>
          )}


          {/* EXTERNAL TI */}
          <section>
            <div className="mb-3">
              <h3 className="
                font-semibold text-gray-900
              ">
                External Reputation Evidence
              </h3>

              <p className="
                text-sm text-gray-500
              ">
                AbuseIPDB and VirusTotal evidence
                remains separate from local ML
              </p>
            </div>

            {!result.sources
              .external_reputation
              .available ? (

              <div className="
                rounded-lg border
                border-amber-200
                bg-amber-50 p-4
                text-sm text-amber-800
              ">
                External reputation is unavailable.

                {result.sources
                  .external_reputation
                  .error && (
                  <div className="
                    mt-1 text-xs
                  ">
                    {
                      result.sources
                        .external_reputation
                        .error
                    }
                  </div>
                )}
              </div>

            ) : (

              <div className="
                grid grid-cols-1 gap-4
                md:grid-cols-3
              ">

                <MetricCard
                  title="AbuseIPDB Score"
                  value={textValue(
                    abuseScore
                  )}
                  subtitle={`Reports: ${
                    textValue(
                      abuseReports,
                      'Unavailable'
                    )
                  }`}
                />

                <MetricCard
                  title="VirusTotal Malicious"
                  value={textValue(
                    vtMalicious
                  )}
                  subtitle={`Suspicious: ${
                    textValue(
                      vtSuspicious
                    )
                  }`}
                />

                <MetricCard
                  title="Country"
                  value={textValue(
                    country
                  )}
                  subtitle="External provider metadata"
                />
              </div>
            )}
          </section>


          {/* OPERATIONAL ASSESSMENT */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">

            <div className="
              mb-4 flex flex-wrap
              items-start gap-3
            ">
              <div>
                <h3 className="
                  font-semibold text-gray-900
                ">
                  Operational Risk Assessment
                </h3>

                <p className="
                  text-sm text-gray-500
                ">
                  External reputation, local ML,
                  Wazuh/Suricata, internal policy
                  and analyst judgment are evaluated
                  as separate dimensions.
                </p>
              </div>

              {operationalAssessment && (
                <span className={`
                  ml-auto rounded-full
                  border px-3 py-1
                  text-sm font-medium
                  ${riskClasses(
                    operationalAssessment
                      .operational_risk_level
                  )}
                `}>
                  {
                    textValue(
                      operationalAssessment
                        .operational_risk_level
                    )
                  }
                </span>
              )}
            </div>


            {!operationalAssessment ? (
              <div className="
                rounded-lg bg-gray-50 p-4
                text-sm text-gray-600
              ">
                Operational assessment unavailable.
              </div>
            ) : (
              <>
                <div className="
                  grid grid-cols-1 gap-4
                  md:grid-cols-2
                ">
                  <div>
                    <DataRow
                      label="Risk"
                      value={
                        textValue(
                          operationalAssessment
                            .operational_risk_level
                        )
                      }
                    />

                    <DataRow
                      label="Confidence"
                      value={
                        textValue(
                          operationalAssessment
                            .confidence
                        )
                      }
                    />

                    <DataRow
                      label="Evidence dimensions"
                      value={
                        String(
                          evidenceDimensions
                        )
                      }
                    />

                    <DataRow
                      label="Decision"
                      value={
                        friendlyDecision(
                          operationalAssessment
                            .decision
                        )
                      }
                    />

                    <DataRow
                      label="Cross-signal escalation"
                      value={
                        operationalAssessment
                          .cross_signal_escalation
                          ? 'Yes'
                          : 'No'
                      }
                    />
                  </div>


                  <div>
                    <DataRow
                      label="External reputation"
                      value={
                        textValue(
                          operationalDimensions
                            ?.external_reputation
                        )
                      }
                    />

                    <DataRow
                      label="Local ML / Context"
                      value={
                        textValue(
                          operationalDimensions
                            ?.local_ml_context
                        )
                      }
                    />

                    <DataRow
                      label="Wazuh / Suricata"
                      value={
                        textValue(
                          operationalDimensions
                            ?.wazuh_suricata
                        )
                      }
                    />

                    <DataRow
                      label="Internal intelligence"
                      value={
                        textValue(
                          operationalDimensions
                            ?.internal_intelligence,
                          'none'
                        )
                      }
                    />

                    <DataRow
                      label="Analyst verdict"
                      value={
                        textValue(
                          operationalDimensions
                            ?.analyst_verdict,
                          'none'
                        )
                      }
                    />
                  </div>
                </div>


                {evidenceDimensions === 0 && (
                  <div className="
                    mt-4 rounded-lg
                    border border-amber-200
                    bg-amber-50 p-3
                    text-sm text-amber-800
                  ">
                    <strong>
                      Low-evidence assessment:
                    </strong>{' '}

                    the displayed operational risk
                    is not evidence that the IP is
                    benign. There are currently zero
                    contributing evidence dimensions.
                  </div>
                )}


                {operationalReasons.length > 0 && (
                  <div className="
                    mt-4 rounded-lg
                    bg-gray-50 p-4
                  ">
                    <div className="
                      mb-2 text-sm font-medium
                      text-gray-900
                    ">
                      Why MedShield reached this decision
                    </div>

                    <ul className="
                      list-disc space-y-1
                      pl-5 text-sm text-gray-600
                    ">
                      {operationalReasons.map(
                        (reason, index) => (
                          <li key={index}>
                            {
                              textValue(
                                reason,
                                'No detail'
                              )
                            }
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}


                {operationalAssessment
                  .recommended_action && (
                  <div className="
                    mt-4 rounded-lg
                    border border-indigo-100
                    bg-indigo-50 p-4
                  ">
                    <div className="
                      text-xs font-medium
                      uppercase tracking-wide
                      text-indigo-600
                    ">
                      Recommended action
                    </div>

                    <div className="
                      mt-1 text-sm
                      text-indigo-900
                    ">
                      {
                        textValue(
                          operationalAssessment
                            .recommended_action
                        )
                      }
                    </div>
                  </div>
                )}
              </>
            )}
          </section>


          {/* MIRS BREAKDOWN / HEALTHCARE CONTEXT */}
          <div className="
            grid grid-cols-1 gap-4
            xl:grid-cols-2
          ">

            <section className="
              rounded-xl border
              border-gray-200
              bg-white p-5 shadow-sm
            ">
              <h3 className="
                font-semibold text-gray-900
              ">
                MIRS Evidence Breakdown
              </h3>

              <p className="
                mt-1 text-sm text-gray-500
              ">
                Evidence dimensions and weighting
                supplied by the correlation engine.
              </p>

              {mirsBreakdownEntries.length === 0 ? (
                <div className="
                  mt-4 rounded-lg
                  bg-gray-50 p-4
                  text-sm text-gray-500
                ">
                  No MIRS breakdown is available
                  for this investigation yet.
                </div>
              ) : (
                <div className="
                  mt-4 space-y-2
                ">
                  {mirsBreakdownEntries.map(
                    ([name, value]) => (
                      <div
                        key={name}
                        className="
                          rounded-lg border
                          border-gray-100 p-3
                        "
                      >
                        <div className="
                          text-sm font-medium
                          text-gray-900
                        ">
                          {
                            friendlyDecision(name)
                          }
                        </div>

                        <pre className="
                          mt-2 overflow-auto
                          whitespace-pre-wrap
                          text-xs text-gray-600
                        ">
                          {
                            typeof value === 'object'
                              ? JSON.stringify(
                                  value,
                                  null,
                                  2
                                )
                              : textValue(value)
                          }
                        </pre>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>


            <section className="
              rounded-xl border
              border-gray-200
              bg-white p-5 shadow-sm
            ">
              <h3 className="
                font-semibold text-gray-900
              ">
                Healthcare Context
              </h3>

              <p className="
                mt-1 text-sm text-gray-500
              ">
                Healthcare-specific context is
                shown only when the backend provides it.
              </p>

              {healthcareEntries.length === 0 ? (
                <div className="
                  mt-4 rounded-lg
                  bg-gray-50 p-4
                  text-sm text-gray-500
                ">
                  Healthcare context unavailable
                  for this investigation.
                </div>
              ) : (
                <div className="mt-4">
                  {healthcareEntries.map(
                    ([name, value]) => (
                      <DataRow
                        key={name}
                        label={
                          friendlyDecision(name)
                        }
                        value={
                          typeof value === 'object'
                            ? JSON.stringify(value)
                            : textValue(value)
                        }
                      />
                    )
                  )}
                </div>
              )}
            </section>
          </div>


          {/* INTERNAL INTELLIGENCE */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <div className="
              mb-4 flex flex-wrap
              items-start gap-3
            ">
              <div>
                <h3 className="
                  font-semibold text-gray-900
                ">
                  Internal Intelligence Controls
                </h3>

                <p className="
                  text-sm text-gray-500
                ">
                  Organization-specific allow,
                  watch and block decisions remain
                  separate from external reputation.
                </p>
              </div>

              <div className="
                ml-auto text-sm text-gray-500
              ">
                Current: {
                  textValue(
                    internalIntelligence
                      ?.effective_status,
                    'none'
                  )
                }
              </div>
            </div>


            {memberships.length > 0 && (
              <div className="
                mb-4 flex flex-wrap gap-2
              ">
                {memberships.map(
                  (membership, index) => (
                    <span
                      key={index}
                      className="
                        rounded-full
                        bg-gray-100
                        px-3 py-1
                        text-xs font-medium
                        text-gray-700
                      "
                    >
                      {
                        typeof membership === 'object'
                          ? JSON.stringify(
                              membership
                            )
                          : textValue(
                              membership
                            )
                      }
                    </span>
                  )
                )}
              </div>
            )}


            <input
              type="text"
              value={listReason}
              onChange={(event) =>
                setListReason(
                  event.target.value
                )
              }
              placeholder="Reason for allow/watch/block decision"
              className="
                mb-3 w-full rounded-lg
                border border-gray-300
                px-3 py-2 text-sm
                focus:border-indigo-500
                focus:ring-2 focus:ring-indigo-500
              "
            />


            <div className="
              flex flex-wrap gap-2
            ">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  void setList('allow')
                }
                className="
                  rounded-lg border
                  border-green-300
                  bg-green-50
                  px-4 py-2 text-sm
                  font-medium text-green-700
                  hover:bg-green-100
                  disabled:opacity-50
                "
              >
                Allow
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  void setList('watch')
                }
                className="
                  rounded-lg border
                  border-amber-300
                  bg-amber-50
                  px-4 py-2 text-sm
                  font-medium text-amber-700
                  hover:bg-amber-100
                  disabled:opacity-50
                "
              >
                Watch
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  void setList('block')
                }
                className="
                  rounded-lg border
                  border-red-300
                  bg-red-50
                  px-4 py-2 text-sm
                  font-medium text-red-700
                  hover:bg-red-100
                  disabled:opacity-50
                "
              >
                Block
              </button>
            </div>
          </section>


          {/* ANALYST INTELLIGENCE */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <div className="mb-4">
              <h3 className="
                font-semibold text-gray-900
              ">
                Analyst Intelligence
              </h3>

              <p className="
                text-sm text-gray-500
              ">
                Human judgment is persisted
                separately from automated evidence.
              </p>
            </div>


            <div className="
              grid grid-cols-1 gap-5
              xl:grid-cols-2
            ">

              {/* VERDICT */}
              <div className="
                rounded-lg border
                border-gray-200 p-4
              ">
                <div className="
                  mb-3 text-sm font-medium
                  text-gray-900
                ">
                  Analyst Verdict
                </div>

                <DataRow
                  label="Current verdict"
                  value={
                    analyst?.current_verdict
                      ? friendlyDecision(
                          analyst
                            .current_verdict
                        )
                      : 'No analyst verdict'
                  }
                />

                <DataRow
                  label="Verdict history"
                  value={
                    String(
                      analyst
                        ?.verdict_count ?? 0
                    )
                  }
                />


                <select
                  value={verdict}
                  onChange={(event) =>
                    setVerdict(
                      event.target.value as AnalystVerdict
                    )
                  }
                  className="
                    mt-4 w-full
                    rounded-lg border
                    border-gray-300
                    px-3 py-2 text-sm
                  "
                >
                  <option value="undetermined">
                    Undetermined
                  </option>

                  <option value="benign">
                    Benign
                  </option>

                  <option value="suspicious">
                    Suspicious
                  </option>

                  <option value="malicious">
                    Malicious
                  </option>
                </select>


                <textarea
                  value={verdictReason}
                  onChange={(event) =>
                    setVerdictReason(
                      event.target.value
                    )
                  }
                  rows={3}
                  placeholder="Reason for analyst verdict"
                  className="
                    mt-3 w-full
                    rounded-lg border
                    border-gray-300
                    px-3 py-2 text-sm
                  "
                />


                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() =>
                    void saveVerdict()
                  }
                  className="
                    mt-3 rounded-lg
                    bg-indigo-600
                    px-4 py-2 text-sm
                    font-medium text-white
                    hover:bg-indigo-700
                    disabled:opacity-50
                  "
                >
                  Save Verdict
                </button>
              </div>


              {/* NOTE */}
              <div className="
                rounded-lg border
                border-gray-200 p-4
              ">
                <div className="
                  mb-3 text-sm font-medium
                  text-gray-900
                ">
                  Investigation Note
                </div>

                <DataRow
                  label="Stored notes"
                  value={
                    String(
                      analyst
                        ?.note_count ?? 0
                    )
                  }
                />

                <textarea
                  value={analystNote}
                  onChange={(event) =>
                    setAnalystNote(
                      event.target.value
                    )
                  }
                  rows={5}
                  placeholder="Add analyst investigation notes..."
                  className="
                    mt-4 w-full
                    rounded-lg border
                    border-gray-300
                    px-3 py-2 text-sm
                  "
                />

                <button
                  type="button"
                  disabled={
                    actionLoading ||
                    !analystNote.trim()
                  }
                  onClick={() =>
                    void saveNote()
                  }
                  className="
                    mt-3 rounded-lg
                    bg-gray-900
                    px-4 py-2 text-sm
                    font-medium text-white
                    hover:bg-gray-800
                    disabled:opacity-50
                  "
                >
                  Add Note
                </button>
              </div>
            </div>


            {/* STORED NOTES */}
            {analystNotes.length > 0 && (
              <div className="mt-5">
                <div className="
                  mb-2 text-sm font-medium
                  text-gray-900
                ">
                  Recent Notes
                </div>

                <div className="
                  space-y-2
                ">
                  {analystNotes
                    .slice(0, 10)
                    .map(
                    (entry, index) => {

                      const item =
                        asRecord(entry);

                      return (
                        <div
                          key={index}
                          className="
                            rounded-lg
                            bg-gray-50 p-3
                            text-sm
                          "
                        >
                          <div className="
                            text-gray-900
                          ">
                            {
                              textValue(
                                item?.note ??
                                entry
                              )
                            }
                          </div>

                          <div className="
                            mt-1 text-xs
                            text-gray-500
                          ">
                            {
                              textValue(
                                item?.actor,
                                'analyst'
                              )
                            }

                            {
                              item?.timestamp
                                ? ` Â· ${
                                    textValue(
                                      item.timestamp
                                    )
                                  }`
                                : ''
                            }
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            )}


            {/* VERDICT HISTORY */}
            {verdictHistory.length > 0 && (
              <details className="
                mt-5 rounded-lg
                border border-gray-200
                p-3
              ">
                <summary className="
                  cursor-pointer
                  text-sm font-medium
                  text-gray-700
                ">
                  Analyst verdict history
                </summary>

                <pre className="
                  mt-3 max-h-64
                  overflow-auto
                  whitespace-pre-wrap
                  text-xs text-gray-600
                ">
                  {
                    JSON.stringify(
                      verdictHistory,
                      null,
                      2
                    )
                  }
                </pre>
              </details>
            )}
          </section>


          {/* CASE CREATION */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <h3 className="
              font-semibold text-gray-900
            ">
              Create Investigation Case
            </h3>

            <p className="
              mt-1 text-sm text-gray-500
            ">
              Persist this IP investigation
              as a MedShield case for follow-up.
            </p>


            <div className="
              mt-4 grid grid-cols-1
              gap-3 md:grid-cols-3
            ">
              <input
                type="text"
                value={caseTitle}
                onChange={(event) =>
                  setCaseTitle(
                    event.target.value
                  )
                }
                placeholder="Case title"
                className="
                  rounded-lg border
                  border-gray-300
                  px-3 py-2 text-sm
                  md:col-span-2
                "
              />

              <select
                value={caseSeverity}
                onChange={(event) =>
                  setCaseSeverity(
                    event.target.value
                  )
                }
                className="
                  rounded-lg border
                  border-gray-300
                  px-3 py-2 text-sm
                "
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>


            <textarea
              value={caseDescription}
              onChange={(event) =>
                setCaseDescription(
                  event.target.value
                )
              }
              rows={3}
              placeholder="Case description"
              className="
                mt-3 w-full
                rounded-lg border
                border-gray-300
                px-3 py-2 text-sm
              "
            />


            <button
              type="button"
              disabled={
                actionLoading ||
                !caseTitle.trim()
              }
              onClick={() =>
                void createCase()
              }
              className="
                mt-3 rounded-lg
                bg-indigo-600
                px-4 py-2 text-sm
                font-medium text-white
                hover:bg-indigo-700
                disabled:opacity-50
              "
            >
              Create Case
            </button>
          </section>


          {/* HISTORY */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <div className="
              flex flex-wrap
              items-center gap-3
            ">
              <div>
                <h3 className="
                  font-semibold text-gray-900
                ">
                  Reputation History
                </h3>

                <p className="
                  text-sm text-gray-500
                ">
                  Historical MedShield
                  reputation observations.
                </p>
              </div>

              <span className="
                ml-auto rounded-full
                bg-gray-100 px-3 py-1
                text-xs font-medium
                text-gray-700
              ">
                {
                  textValue(
                    historyEnvelope?.count,
                    String(
                      historyItems.length
                    )
                  )
                } records
              </span>
            </div>


            {historyItems.length === 0 ? (
              <div className="
                mt-4 rounded-lg
                bg-gray-50 p-4
                text-sm text-gray-500
              ">
                No historical observations
                are stored for this IP yet.
              </div>
            ) : (
              <div className="
                mt-4 overflow-x-auto
              ">
                <table className="
                  min-w-full text-left
                  text-sm
                ">
                  <thead>
                    <tr className="
                      border-b border-gray-200
                      text-xs uppercase
                      text-gray-500
                    ">
                      <th className="px-3 py-2">
                        Observed
                      </th>

                      <th className="px-3 py-2">
                        Score
                      </th>

                      <th className="px-3 py-2">
                        Risk
                      </th>

                      <th className="px-3 py-2">
                        Source
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {historyItems
                      .slice(0, 20)
                      .map(
                      (entry, index) => {

                        const item =
                          asRecord(entry);

                        return (
                          <tr
                            key={
                              textValue(
                                item?._id,
                                String(index)
                              )
                            }
                            className="
                              border-b
                              border-gray-100
                            "
                          >
                            <td className="
                              px-3 py-2
                            ">
                              {
                                textValue(
                                  item?.observed_at ??
                                  item?.timestamp ??
                                  item?.created_at
                                )
                              }
                            </td>

                            <td className="
                              px-3 py-2
                            ">
                              {
                                textValue(
                                  item
                                    ?.reputation_score
                                )
                              }
                            </td>

                            <td className="
                              px-3 py-2
                            ">
                              {
                                textValue(
                                  item?.risk_level
                                )
                              }
                            </td>

                            <td className="
                              px-3 py-2
                            ">
                              {
                                textValue(
                                  item?.source,
                                  'MedShield'
                                )
                              }
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>


          {/* WAZUH EVIDENCE */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <div className="
              flex flex-wrap
              items-start gap-3
            ">
              <div>
                <h3 className="
                  font-semibold text-gray-900
                ">
                  Wazuh / Suricata Evidence
                </h3>

                <p className="
                  text-sm text-gray-500
                ">
                  Alert evidence is treated as
                  a separate correlation dimension.
                </p>
              </div>

              <span className={`
                ml-auto rounded-full
                border px-3 py-1
                text-xs font-medium
                ${
                  actualWazuhAvailable
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
                }
              `}>
                {
                  actualWazuhAvailable
                    ? 'Evidence available'
                    : 'Wazuh unavailable'
                }
              </span>
            </div>


            {!actualWazuhAvailable ? (
              <div className="
                mt-4 rounded-lg
                border border-gray-200
                bg-gray-50 p-4
                text-sm text-gray-600
              ">
                Wazuh evidence is currently unavailable.
                The API endpoint is reachable, but the
                Wazuh data source itself is not connected.

                <div className="
                  mt-2 text-xs text-gray-500
                ">
                  Local ML and external reputation
                  remain valid separate evidence sources.
                </div>
              </div>
            ) : (
              <>
                <div className="
                  mt-4 grid grid-cols-1
                  gap-4 md:grid-cols-3
                ">
                  <MetricCard
                    title="Matched Alerts"
                    value={
                      textValue(
                        wazuh
                          ?.matched_alert_count,
                        '0'
                      )
                    }
                  />

                  <MetricCard
                    title="Status"
                    value={
                      friendlyDecision(
                        wazuh?.status
                      )
                    }
                  />

                  <MetricCard
                    title="Alert Documents"
                    value={
                      String(
                        wazuhAlerts.length
                      )
                    }
                  />
                </div>

                {wazuhAlerts.length > 0 && (
                  <details className="
                    mt-4 rounded-lg
                    border border-gray-200
                    p-3
                  ">
                    <summary className="
                      cursor-pointer
                      text-sm font-medium
                      text-gray-700
                    ">
                      Recent Wazuh alert evidence
                    </summary>

                    <pre className="
                      mt-3 max-h-72
                      overflow-auto
                      whitespace-pre-wrap
                      text-xs text-gray-600
                    ">
                      {
                        JSON.stringify(
                          wazuhAlerts.slice(0, 10),
                          null,
                          2
                        )
                      }
                    </pre>
                  </details>
                )}
              </>
            )}
          </section>


          {/* INTELLIGENCE PROFILE */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <h3 className="
              font-semibold text-gray-900
            ">
              Stored Intelligence Profile
            </h3>

            {!intelligenceAvailable ? (
              <div className="
                mt-3 rounded-lg
                bg-gray-50 p-4
                text-sm text-gray-600
              ">
                No stored MedShield intelligence
                profile exists for this IP yet.

                {result.sources
                  .intelligence
                  .error && (
                  <div className="
                    mt-1 text-xs text-gray-500
                  ">
                    {
                      result.sources
                        .intelligence
                        .error
                    }
                  </div>
                )}
              </div>
            ) : (
              <pre className="
                mt-3 max-h-72
                overflow-auto
                rounded-lg bg-gray-950
                p-4 text-xs text-gray-100
              ">
                {
                  JSON.stringify(
                    result.intelligence,
                    null,
                    2
                  )
                }
              </pre>
            )}
          </section>


          {/* SERVICE / EVIDENCE AVAILABILITY */}
          <section className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <h3 className="
              mb-4 font-semibold
              text-gray-900
            ">
              Evidence Availability
            </h3>

            <div className="
              grid grid-cols-1 gap-3
              md:grid-cols-2
              xl:grid-cols-3
            ">

              <SourceRow
                name="External Threat Intelligence"
                available={
                  result.sources
                    .external_reputation
                    .available
                }
                detail={
                  result.sources
                    .external_reputation
                    .available
                    ? 'Provider response available'
                    : result.sources
                        .external_reputation
                        .error ??
                      'Unavailable'
                }
              />

              <SourceRow
                name="Local ML Correlation"
                available={
                  hasLocalMlEvidence
                }
                detail={
                  result.sources
                    .local_correlation
                    .available
                    ? (
                      hasLocalMlEvidence
                        ? `${localEvidenceCount} matching flow observations`
                        : 'Correlation service available; no matching local evidence'
                    )
                    : result.sources
                        .local_correlation
                        .error ??
                      'Correlation service unavailable'
                }
              />

              <SourceRow
                name="Stored Intelligence"
                available={
                  intelligenceAvailable
                }
                detail={
                  intelligenceAvailable
                    ? 'Stored profile available'
                    : 'No stored profile yet'
                }
              />

              <SourceRow
                name="Reputation History"
                available={
                  historyItems.length > 0
                }
                detail={
                  result.sources
                    .history
                    .available
                    ? (
                      historyItems.length > 0
                        ? `${historyItems.length} historical observations`
                        : 'History service available; no observations yet'
                    )
                    : result.sources
                        .history
                        .error ??
                      'Unavailable'
                }
              />

              <SourceRow
                name="Analyst Intelligence"
                available={
                  Boolean(
                    analyst?.current_verdict
                  ) ||
                  analystNotes.length > 0
                }
                detail={
                  result.sources
                    .analyst
                    .available
                    ? (
                      analyst?.current_verdict
                        ? `Current verdict: ${friendlyDecision(
                            analyst.current_verdict
                          )}`
                        : 'Analyst service available; no verdict or notes yet'
                    )
                    : result.sources
                        .analyst
                        .error ??
                      'Unavailable'
                }
              />

              <SourceRow
                name="Operational Assessment"
                available={
                  Boolean(
                    operationalAssessment
                  )
                }
                detail={
                  operationalAssessment
                    ? `${
                        textValue(
                          operationalAssessment
                            .operational_risk_level
                        )
                      } risk Â· ${
                        textValue(
                          operationalAssessment
                            .confidence
                        )
                      } confidence`
                    : 'Unavailable'
                }
              />

              <SourceRow
                name="Wazuh Evidence"
                available={
                  actualWazuhAvailable
                }
                detail={
                  actualWazuhAvailable
                    ? `${textValue(
                        wazuh?.matched_alert_count,
                        '0'
                      )} matching alerts`
                    : 'Endpoint reachable; Wazuh data source unavailable'
                }
              />
            </div>
          </section>


          {/* ACTION RESULT */}
          {(actionMessage ||
            actionError ||
            actionLoading) && (
            <div className={`
              rounded-lg border
              px-4 py-3 text-sm
              ${
                actionError
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-green-200 bg-green-50 text-green-700'
              }
            `}>
              {
                actionLoading
                  ? 'Applying analyst action...'
                  : actionError ??
                    actionMessage
              }
            </div>
          )}


          {/* RAW EVIDENCE */}
          <details className="
            rounded-xl border
            border-gray-200
            bg-white p-5 shadow-sm
          ">
            <summary className="
              cursor-pointer
              font-medium text-gray-700
            ">
              Raw investigation evidence
            </summary>

            <pre className="
              mt-4 max-h-96
              overflow-auto
              rounded-lg bg-gray-950
              p-4 text-xs text-gray-100
            ">
              {
                JSON.stringify(
                  result,
                  null,
                  2
                )
              }
            </pre>
          </details>

        </>
      )}
    </div>
  );
};


export default IpReputationPanel;