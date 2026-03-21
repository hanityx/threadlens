import { DEFAULT_PORT } from "./lib/constants.js";
import { createServer } from "./app/create-server.js";

createServer()
  .then((app) => app.listen({ host: "127.0.0.1", port: DEFAULT_PORT }))
  .then(() => {
    // no-op
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
