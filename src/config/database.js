// import du goat sqlite3 <3
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./jadoresqlite3.db", (err) => {
  if (err) {
    console.error("erreur de connexion à la database:", err);
  } else {
    console.log("connecté à la databse");
    initDatabase();
  }
});

// j'ai mis "CREATE TABLE IF NOT EXISTS nomtable" au début de chaque table comme ca je n'ai pas besoin de supprimer mon fichier de config de table à terme, rien ne sera écrasé si je relance mon fichier de config
function initDatabase() {
  db.serialize(() => {
    // table avec les infos des utilisateurs
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Table contenant les informations relative aux habits ou habitudes avec clé étrangère vers la table user
    // Ajout de la colonne is_global pour différencier les habitudes globales des personnelles
    db.run(`CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      is_global BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Table me permettant la gestion du suivi des habitudes avec clé étrangère vers la table habit et user
    db.run(`CREATE TABLE IF NOT EXISTS habit_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT 0,
      date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (habit_id) REFERENCES habits (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Insertion des habitudes globales si elles n'existent pas déjà
    db.get(
      "SELECT COUNT(*) as count FROM habits WHERE is_global = 1",
      [],
      (err, row) => {
        if (err) {
          console.error(
            "Erreur lors de la vérification des habitudes globales:",
            err
          );
          return;
        }

        // Si aucune habitude globale n'existe, on les crée
        if (row.count === 0) {
          const globalHabits = [
            {
              title: "Méditation quotidienne",
              description: "Prendre 10 minutes pour méditer et se recentrer",
            },
            {
              title: "Boire de l'eau",
              description: "Boire au moins 2L d'eau par jour",
            },
            {
              title: "Activité physique",
              description: "30 minutes d'exercice physique",
            },
          ];

          // Insertion des habitudes globales
          const stmt = db.prepare(
            "INSERT INTO habits (title, description, is_global) VALUES (?, ?, 1)"
          );
          globalHabits.forEach((habit) => {
            stmt.run([habit.title, habit.description], (err) => {
              if (err) {
                console.error(
                  "Erreur lors de l'insertion d'une habitude globale:",
                  err
                );
              }
            });
          });
          stmt.finalize();
        }
      }
    );
  });
}

// j'exporte db pour pouvoir l'importer dans mon app.js
module.exports = db;
