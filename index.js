import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Ruta simple de prueba
app.get("/", (req, res) => {
  res.send("Servidor backend funcionando 🚀");
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
