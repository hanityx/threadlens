import { lazy, Suspense, type Ref } from "react";
import type { ThreadDetailProps } from "../components/ThreadDetail";
import type { SessionDetailProps } from "../components/SessionDetail";
import type { Messages } from "../i18n";

const ThreadDetail = lazy(async () => {
  const mod = await import("../components/ThreadDetail");
  return { default: mod.ThreadDetail };
});

const SessionDetail = lazy(async () => {
  const mod = await import("../components/SessionDetail");
  return { default: mod.SessionDetail };
});

type DetailShellProps = {
  messages: Messages;
  detailLayoutRef: Ref<HTMLElement>;
  showDetails: boolean;
  showThreadDetail: boolean;
  showSessionDetail: boolean;
  showProviders: boolean;
  threadDetailProps: ThreadDetailProps;
  sessionDetailProps: SessionDetailProps;
};

export function DetailShell(props: DetailShellProps) {
  const {
    messages,
    detailLayoutRef,
    showDetails,
    showThreadDetail,
    showSessionDetail,
    showProviders,
    threadDetailProps,
    sessionDetailProps,
  } = props;

  if (!showDetails) return null;

  return (
    <section
      ref={detailLayoutRef}
      className={`detail-layout ${showThreadDetail && showSessionDetail ? "" : "single"}`.trim()}
    >
      {showThreadDetail ? (
        <Suspense
          fallback={
            <section className="panel">
              <header>
                <h2>{messages.threadDetail.title}</h2>
                <span>{messages.common.loading}</span>
              </header>
              <div className="sub-toolbar">
                <div className="skeleton-line" />
              </div>
            </section>
          }
        >
          <ThreadDetail {...threadDetailProps} />
        </Suspense>
      ) : null}

      {showSessionDetail && !showProviders ? (
        <Suspense
          fallback={
            <section className="panel">
              <header>
                <h2>{messages.sessionDetail.title}</h2>
                <span>{messages.common.loading}</span>
              </header>
              <div className="sub-toolbar">
                <div className="skeleton-line" />
              </div>
            </section>
          }
        >
          <SessionDetail {...sessionDetailProps} />
        </Suspense>
      ) : null}
    </section>
  );
}
