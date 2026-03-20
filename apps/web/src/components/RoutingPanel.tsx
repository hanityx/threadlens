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

  const orderedNodes = useMemo(() => {
    const order: Record<string, number> = {
      entry: 0,
      config: 1,
      instruction: 2,
      workspace: 3,
      runtime: 4,
    };
    return [...(data?.nodes ?? [])].sort((a, b) => {
      const ao = order[a.kind] ?? 99;
      const bo = order[b.kind] ?? 99;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });
  }, [data?.nodes]);

  const kindLabel = (kind: string) => {
    if (kind === "entry") return messages.routing.kindEntry;
    if (kind === "config") return messages.routing.kindConfig;
    if (kind === "instruction") return messages.routing.kindInstruction;
    if (kind === "workspace") return messages.routing.kindWorkspace;
    return messages.routing.kindRuntime;
  };

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
          <h3>{messages.routing.flowMap}</h3>
          {(orderedNodes ?? []).length === 0 ? (
            <p className="sub-hint">{messages.routing.noNodes}</p>
          ) : (
            <div className="routing-node-grid">
              {orderedNodes.map((node) => (
                <article key={node.id} className={`routing-node-card kind-${node.kind}`}>
                  <div className="routing-node-top">
                    <strong>{node.label}</strong>
                    <span className="routing-kind-chip">{kindLabel(node.kind)}</span>
                  </div>
                  <div className="routing-node-meta mono-sub">{node.id}</div>
                  {node.detail ? <p className="sub-hint">{node.detail}</p> : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="impact-list">
          <h3>{messages.routing.flowEdges}</h3>
          {(data?.edges ?? []).length === 0 ? (
            <p className="sub-hint">{messages.routing.noEdges}</p>
          ) : (
            <ul>
              {(data?.edges ?? []).map((edge) => (
                <li key={`${edge.from}-${edge.to}-${edge.reason}`}>
                  <div className="routing-edge-flow">
                    <strong>{nodeLabel.get(edge.from) ?? edge.from}</strong>
                    <span className="routing-arrow">→</span>
                    <strong>{nodeLabel.get(edge.to) ?? edge.to}</strong>
                  </div>
                  <span>{edge.reason}</span>
                </li>
              ))}
            </ul>
          )}
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
