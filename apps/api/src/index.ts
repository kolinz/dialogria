import { createRealtimeServer } from "./server.js";
import { config } from "./config.js";
import { startWorker } from "./media.js";
import { bootstrapAdmin } from "./bootstrap-admin.js";
await bootstrapAdmin();
const { server, io } = createRealtimeServer();
startWorker();
server.listen(config.PORT, config.HOST, () =>
  console.log(`Dialogria API http://${config.HOST}:${config.PORT}`),
);
process.on("SIGTERM", () => {
  io.close();
  server.close();
});
