import type { DataSourceInventoryRow, ProviderView } from "@/shared/types";
import { formatDateTime } from "@/shared/lib/format";
import { formatBytes } from "@/shared/lib/format";
import { dataSourceLabel, providerFromDataSource } from "@/features/providers/lib/helpers";

export interface DataSourcesListCopy {
  disclosure: string;
  detected: string;
  files: string;
  dirs: string;
  size: string;
  updated: string;
  openSessions: string;
  ok: string;
  fail: string;
}

export interface DataSourcesListProps {
  copy: DataSourcesListCopy;
  dataSourcesLoading: boolean;
  dataSourceRows: DataSourceInventoryRow[];
  detectedDataSourceCount: number;
  canOpenProviderById: (providerId: ProviderView | null) => boolean;
  onOpenProviderSessions: (providerId: ProviderView) => void;
}

export function DataSourcesList(props: DataSourcesListProps) {
  const {
    copy,
    dataSourcesLoading,
    dataSourceRows,
    detectedDataSourceCount,
    canOpenProviderById,
    onOpenProviderSessions,
  } = props;

  return (
    <details className="panel panel-disclosure">
      <summary>
        {copy.disclosure} · {copy.detected} {detectedDataSourceCount}/{dataSourceRows.length}
      </summary>
      <div className="panel-disclosure-body data-source-grid">
        {dataSourcesLoading && dataSourceRows.length === 0
          ? Array.from({ length: 6 }).map((_, idx) => (
              <div key={`data-source-skeleton-${idx}`} className="data-source-card">
                <div className="skeleton-line" />
              </div>
            ))
          : dataSourceRows.map((row) => {
              const mappedProvider = providerFromDataSource(row.source_key);
              const canJump = mappedProvider !== null && canOpenProviderById(mappedProvider);
              return (
                <article
                  key={`data-source-${row.source_key}`}
                  className={`data-source-card ${row.present ? "is-present" : "is-missing"}`}
                >
                  <div className="data-source-top">
                    <strong>{dataSourceLabel(row.source_key)}</strong>
                    <div className="data-source-top-actions">
                      {canJump ? (
                        <button
                          type="button"
                          className="inline-link-btn"
                          onClick={() => onOpenProviderSessions(mappedProvider)}
                        >
                          {copy.openSessions}
                        </button>
                      ) : null}
                      <span className={`status-pill ${row.present ? "status-active" : "status-missing"}`}>
                        {row.present ? copy.ok : copy.fail}
                      </span>
                    </div>
                  </div>
                  <div className="mono-sub data-source-path">{row.path || "-"}</div>
                  <div className="data-source-meta">
                    <span>
                      {copy.files} {row.file_count}
                    </span>
                    <span>
                      {copy.dirs} {row.dir_count}
                    </span>
                    <span>
                      {copy.size} {formatBytes(row.total_bytes)}
                    </span>
                    <span>
                      {copy.updated} {formatDateTime(row.latest_mtime)}
                    </span>
                  </div>
                </article>
              );
            })}
      </div>
    </details>
  );
}
