// index.js
//import express from "express";
//import cors from "cors";
//import dotenv from "dotenv";
//import nearbyRoutes from "./api/nearby.js"; // tu ruta nearby
//dotenv.config();

//const app = express();
//app.use(express.json());
//app.use(cors());

//app.use("/api", nearbyRoutes); // monta /api/nearby

//const PORT = process.env.PORT || 3000;
//app.listen(PORT, () => {
//  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
//});
// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nearbyRoutes from "./api/nearby.js"; // tu ruta nearby

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

app.use("/api", nearbyRoutes); // monta /api/nearby

// 🚀 Exportar app para que Vercel lo use
export default app;
