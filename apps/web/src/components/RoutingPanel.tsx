import { useMemo } from "react";
import type { ExecutionGraphData } from "@codex/shared-contracts";
import type { Messages } from "../i18n";

type Props = {
  messages: Messages;
  data: ExecutionGraphData | null | undefined;
  loading: boolean;
};

export function RoutingPanel({ messages, data, loading }: Props) {
  const nodeLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const node of data?.nodes ?? []) m.set(node.id, node.label);
    return m;
  }, [data]);

  return (
    <section className="panel">
      <header>
        <h2>{messages.routing.title}</h2>
        <span>{data?.generated_at ? new Date(data.generated_at).toLocaleString() : "-"}</span>
      </header>
      <div className="impact-body">
        {loading ? <div className="skeleton-line" /> : null}

        <div className="impact-kv">
          <span>{messages.routing.config}</span>
          <strong className="mono-sub">{data?.evidence?.codex_config_path ?? "-"}</strong>
        </div>
        <div className="impact-kv">
          <span>{messages.routing.globalState}</span>
          <strong className="mono-sub">{data?.evidence?.global_state_path ?? "-"}</strong>
        </div>
        {data?.evidence?.notify_hook ? (
          <div className="impact-kv">
            <span>{messages.routing.notifyHook}</span>
            <strong className="mono-sub">{data.evidence.notify_hook}</strong>
          </div>
        ) : null}
        {data?.evidence?.developer_instructions_excerpt ? (
          <p className="sub-hint">{data.evidence.developer_instructions_excerpt}</p>
        ) : null}

        <div className="impact-list">
          <h3>{messages.routing.flowEdges}</h3>
          <ul>
            {(data?.edges ?? []).map((edge) => (
              <li key={`${edge.from}-${edge.to}-${edge.reason}`}>
                <strong>{nodeLabel.get(edge.from) ?? edge.from}</strong>
                <span>
                  {edge.reason} {"->"} {nodeLabel.get(edge.to) ?? edge.to}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="impact-list">
          <h3>{messages.routing.findings}</h3>
          {(data?.findings ?? []).length === 0 ? (
            <p className="sub-hint">{messages.routing.noFindings}</p>
          ) : (
            <ul>
              {(data?.findings ?? []).map((finding) => (
                <li key={finding}>
                  <strong>•</strong>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
