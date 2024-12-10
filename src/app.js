// import de modules basiques
const express = require("express")
const cookieParser = require("cookie-parser")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const db = require("./config/database")
// import pour gérer les chemins de fichiers
const cors = require("cors")

// je fais la passerelle avec mon fichier auth dans lequel j'ai mon jeton secret
const {authenticateToken, JWT_SECRET} = require("./middleware/auth")

const app = express()
const PORT = 4000

app.use(cors())
// Je parse mes données en json pour pouvoir les traiter plus facilement
app.use(express.json())
// Ligne nécessaire pour la gestion des cookies
app.use(cookieParser())

// --------------------------------------------------------------------------------------------------------------------

// Route protégée qui affiche le tableau de bord avec les habitudes de l'utilisateur
app.get("/dashboard", authenticateToken, (req, res) => {
	// D'abord, récupérer toutes les habitudes globales
	db.all(
		`SELECT h.*,
                (SELECT COUNT(DISTINCT user_id)
                 FROM habit_tracking ht
                 WHERE ht.habit_id = h.id
                   AND DATE(ht.date) = DATE('now')) as today_users, (
         SELECT COUNT (DISTINCT user_id)
         FROM habit_tracking ht
         WHERE ht.habit_id = h.id) as total_users
             , (
         SELECT COUNT (*)
         FROM habit_tracking ht
         WHERE ht.habit_id = h.id
           AND ht.completed = 1) as total_completions
             , (
         SELECT COUNT (*)
         FROM habit_tracking ht
         WHERE ht.habit_id = h.id) as total_attempts
             , (
         SELECT COUNT (DISTINCT user_id)
         FROM habit_tracking ht
         WHERE ht.habit_id = h.id
           AND strftime('%Y-%m'
             , ht.date) = strftime('%Y-%m'
             , 'now')) as monthly_users
         FROM habits h
         WHERE h.is_global = 1`,
		[],
		(err, globalHabits) => {
			if (err)
				return res
					.status(500)
					.json({ message: "Erreur lors de la récupération des habitudes globales" })

			// Ensuite, récupérer les habitudes personnelles de l'utilisateur
			db.all(
				`SELECT h.*
                 FROM habits h
                 WHERE h.user_id = ?
                   AND h.is_global = 0`,
				[req.user.id],
				(err, personalHabits) => {
					if (err)
						return res
							.status(500)
							.json({ message:
								"Erreur lors de la récupération des habitudes personnelles"
							})

					// Pour chaque habitude globale, vérifier si l'utilisateur l'a complétée aujourd'hui
					const promises = globalHabits.map((habit) => {
						return new Promise((resolve, reject) => {
							db.get(
								`SELECT completed
                                 FROM habit_tracking
                                 WHERE habit_id = ?
                                   AND user_id = ?
                                   AND DATE (date) = DATE ('now')`,
								[habit.id, req.user.id],
								(err, result) => {
									if (err) reject(err)
									habit.completedToday = result ? result.completed : false
									habit.success_rate =
										habit.total_attempts > 0
											? (
												(habit.total_completions / habit.total_attempts) *
												100
											).toFixed(2)
											: 0
									resolve()
								}
							)
						})
					})

					Promise.all(promises)
						.then(() => {
							res.json({
								username: req.user.username,
								globalHabits: globalHabits,
								personalHabits: personalHabits,
							})
						})
						.catch((error) => {
							res
								.status(500)
								.send("Erreur lors de la récupération des données")
						})
				}
			)
		}
	)
})

// --------------------------------------------------------------------------------------------------------------------

// quand je vais sur l'url register pour l'authentification ca va prendre les valeurs de mon body création initiale de valeur par le biais du formulaire HTML
app.post("/auth/register", async (req, res) => {
	const {username, password} = req.body

	try {
		db.get(
			"SELECT id FROM users WHERE username = ?",
			[username],
			async (err, user) => {
				if (err) return res.status(500).send({ message: "Erreur serveur" })
				if (user) return res.status(400).send({ message: "Nom d'utilisateur déjà pris" })

				const hashedPassword = await bcrypt.hash(password, 10)

				db.run(
					"INSERT INTO users (username, password) VALUES (?, ?)",
					[username, hashedPassword],
					function (err) {
						if (err)
							return res
								.status(500)
								.json({ message: "Erreur lors de la création du compte" })

						const token = jwt.sign({id: this.lastID, username}, JWT_SECRET, {
							expiresIn: "24h",
						})

						// ca me redirige vers le tableau de bord après inscription réussie
						res.status(200).json({ token })
					}
				)
			}
		)
	} catch (error) {
		res.status(500).json({ message: "Erreur serveur"})
	}
})

// --------------------------------------------------------------------------------------------------------------------

// gestion des comptes existants avec la route login maintenant
app.post("/auth/login", async (req, res) => {

	const {username, password} = req.body

	try {
		db.get(
			"SELECT * FROM users WHERE username = ?",
			[username],
			async (err, user) => {
				if (err) return res.status(500).json({ message: "Erreur serveur"})
				if (!user) return res.status(401).json({ message: "Identifiants invalides"})

				const validPassword = await bcrypt.compare(password, user.password)
				if (!validPassword)
					return res.status(401).json({ message: "Identifiants invalides"})

				const token = jwt.sign(
					{id: user.id, username: user.username},
					JWT_SECRET,
					{expiresIn: "24h"}
				)
				// Redirection vers le tableau de bord après connexion réussie
				res.status(200).json({ token })
			}
		)
	} catch (error) {
		res.status(500).json({ message: "Erreur serveur"})
	}
})

// --------------------------------------------------------------------------------------------------------------------

//ajouter une habitude ne marche uniquement si l'utilisateur est connecté par le biais de authenticatetoken
app.post("/habits", authenticateToken, (req, res) => {
	const {title, description} = req.body

	if (!title) return res.status(400).json({ message: 'le titre est requis' })

	db.run(
		"INSERT INTO habits (user_id, title, description) VALUES (?, ?, ?)",
		[req.user.id, title, description],
		function (err) {
			if (err)
				return res.status(500).json({ message: "Erreur lors de la création de l'habitude" })
			// Redirection vers le tableau de bord après ajout d'une habitude
			res.status(200).json({ title, description })
		}
	)
})

// --------------------------------------------------------------------------------------------------------------------

// schéma inverse, on ajoute plus on liste les valeurs enregistrées avec get
app.get("/habits", authenticateToken, (req, res) => {
	db.all(
		"SELECT * FROM habits WHERE user_id = ?",
		[req.user.id],
		(err, habits) => {
			if (err)
				return res
					.status(500)
					.json({error: "Erreur lors de la récupération des habitudes"})
			res.json(habits)
		}
	)
})

// --------------------------------------------------------------------------------------------------------------------

// Ici j'utilise post au lieu de put pour la compatibilité avec le formulaire html qui ne gère que post et get pour gérer la mise a jour d'habitude
app.put("/habits/:id", authenticateToken, (req, res) => {
	const {title, description} = req.body
	const habitId = req.params.id

	if (!title) return res.status(400).send("Le titre est requis")

	db.run(
		"UPDATE habits SET title = ?, description = ? WHERE id = ? AND user_id = ?",
		[title, description, habitId, req.user.id],
		function (err) {
			if (err) return res.status(500).json({ message: "Erreur lors de la modification"})
			if (this.changes === 0)
				return res.status(404).json({ message: "Habitude non trouvée" })
			// Redirection vers le tableau de bord après modification
			res.status(200).json({ id: req.params.id, title, description })
		}
	)
})

// --------------------------------------------------------------------------------------------------------------------

// Pareil, post au lieu de delete pour la suppression
app.delete("/habits/:id", authenticateToken, (req, res) => {
	const habitId = req.params.id

	db.run(
		"DELETE FROM habits WHERE id = ? AND user_id = ?",
		[habitId, req.user.id],
		function (err) {
			if (err) return res.status(500).json({ message: "Erreur lors de la suppression" })
			if (this.changes === 0)
				return res.status(404).json({ message: "Habitude non trouvée"})
			// Redirection vers le tableau de bord après suppression
			res.status(200).json({ id: req.params.id })
		}
	)
})

// --------------------------------------------------------------------------------------------------------------------

// route pour obtenir le tracking d'une habitude en fonction de son id
app.post("/tracking/:habitId", authenticateToken, (req, res) => {
	const {habitId} = req.params
	const {completed, date} = req.body

	if (!date) return res.status(400).send("La date est requise")

	db.run(
		"INSERT INTO habit_tracking (habit_id, user_id, completed, date) VALUES (?, ?, ?, ?)",
		[habitId, req.user.id, completed ? 1 : 0, date],
		function (err) {
			if (err)
				return res.status(500).json({ message: "Erreur lors de l'enregistrement du suivi" })
			// Redirection vers le tableau de bord après enregistrement du suivi
			res.status(200).json({ id: habitId, completed, date })
		}
	)
})

// --------------------------------------------------------------------------------------------------------------------

app.get("/tracking/:habitId/history", authenticateToken, (req, res) => {
	const {habitId} = req.params

	// On récupère d'abord les infos de l'habitude
	db.get(
		"SELECT * FROM habits WHERE id = ? AND user_id = ?",
		[habitId, req.user.id],
		(err, habit) => {
			if (err)
				return res
					.status(500)
					.json({ message: "Erreur lors de la récupération de l'habitude"})
			if (!habit) return res.status(404).json({ message: "Habitude non trouvée"})

			// Puis on récupère tout l'historique de suivi pour cette habitude
			db.all(
				`SELECT
                     date, completed, created_at
                 FROM habit_tracking
                 WHERE habit_id = ? AND user_id = ?
                 ORDER BY date DESC`,
				[habitId, req.user.id],
				(err, trackings) => {
					if (err)
						return res
							.status(500)
							.json({ message: "Erreur lors de la récupération de l'historique" })
					res.status(200).json({
						habit,
						trackings,
						formatDate: (date) => new Date(date).toLocaleDateString()})
				}
			)
		}
	)
})

// --------------------------------------------------------------------------------------------------------------------

//routes permettant la gestion d'un rapport pour les habitudes en fonction du mois et de l'année
app.get("/reports/monthly", authenticateToken, (req, res) => {
	let {month, year} = req.query

	if (!month || !year) {
		// Si pas de mois/année spécifiés, on utilise le mois en cours, je me suis permis de demandé à gpt de m'aider la dessus parce que je suis pas encore au point
		const now = new Date()
		year = now.getFullYear().toString()
		month = (now.getMonth() + 1).toString().padStart(2, "0")
	}

	const startDate = `${year}-${month}-01`
	// On calcule le dernier jour du mois correctement
	const lastDay = new Date(year, month, 0).getDate()
	const endDate = `${year}-${month}-${lastDay}`

	const query = `
        SELECT h.id,
               h.title,
               COUNT(ht.id)                                                        as total_days,
               SUM(CASE WHEN ht.completed = 1 THEN 1 ELSE 0 END)                   as completed_days,
               ROUND(CAST(SUM(CASE WHEN ht.completed = 1 THEN 1 ELSE 0 END) AS FLOAT) /
                     CAST(COUNT(ht.id) AS FLOAT) * 100, 2)                         as success_rate,
               GROUP_CONCAT(CASE WHEN ht.completed = 1 THEN ht.date ELSE NULL END) as completed_dates
        FROM habits h
                 LEFT JOIN habit_tracking ht ON h.id = ht.habit_id
            AND ht.date BETWEEN ? AND ?
        WHERE h.user_id = ?
        GROUP BY h.id
	`

	db.all(query, [startDate, endDate, req.user.id], (err, results) => {
		if (err)
			return res.status(500).json({ message: "Erreur lors de la génération du rapport" })

		const monthName = new Date(`${year}-${month}-01`).toLocaleString("fr-FR", {
			month: "long",
		})

		res.status(200).json({
			results,
			month: monthName,
			year,
			startDate,
			endDate,
			formatDate: (date) => new Date(date).toLocaleDateString(),
		})
	})
})

// --------------------------------------------------------------------------------------------------------------------

// définition du port au lancement du server
app.listen(PORT, () => {
	console.log(`http://localhost:${PORT}/`)
})
