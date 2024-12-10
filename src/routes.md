Routes Disponibles
Routes d'Authentification

POST /auth/register : Inscription d'un nouvel utilisateur
POST /auth/login : Connexion
POST /auth/logout : Déconnexion

Routes des Habitudes

GET /habits : Liste des habitudes
POST /habits : Création d'une habitude
POST /habits/:id/update : Modification d'une habitude
POST /habits/:id/delete : Suppression d'une habitude

[Pour la liste complète des routes, voir routes.md]
Base de Données
L'application utilise SQLite3 avec trois tables principales :

users : Gestion des utilisateurs
habits : Stockage des habitudes (personnelles et globales)
habit_tracking : Suivi quotidien des habitudes
