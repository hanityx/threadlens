import { DEFAULT_PORT } from "./lib/constants.js";
import { createServer } from "./app/create-server.js";
import { primeConversationSearchCaches } from "./domains/providers/search.js";

async function main() {
  const app = await createServer();
  const prewarmMode = String(process.env.THREADLENS_SEARCH_PREWARM || "sync")
    .trim()
    .toLowerCase();

  if (prewarmMode !== "0" && prewarmMode !== "off" && prewarmMode !== "false") {
    if (prewarmMode === "background") {
      void primeConversationSearchCaches().catch((error) => {
        app.log.warn({ err: error }, "conversation-search-prewarm-failed");
      });
    } else {
      await primeConversationSearchCaches().catch((error) => {
        app.log.warn({ err: error }, "conversation-search-prewarm-failed");
      });
    }
  }

  await app.listen({ host: "127.0.0.1", port: DEFAULT_PORT });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
