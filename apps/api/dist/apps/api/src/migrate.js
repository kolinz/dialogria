import { migrate, sqlite } from "./db.js";
migrate();
console.log("Database schema is up to date (v1).");
sqlite.close();
