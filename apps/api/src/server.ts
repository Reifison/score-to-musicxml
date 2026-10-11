import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { createServices } from "./container.js";

const services = createServices();
const app = createApp(services);

if (env.REDIS_URL) {
  const reconcile = () => { void services.reconciler.runOnce().catch((error) => console.error("Queue reconciliation failed; will retry", error)); };
  reconcile();
  setInterval(reconcile, 30_000).unref();
}

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
