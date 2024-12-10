// déclaration d'une constante contenant ma clé pour décrypter mon jwt

const jwt = require("jsonwebtoken");

const JWT_SECRET = "minel<3";

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  // gestion des demandes non authentifiées si la valeur de token n'est pas la bonne
  const token = authorization && authorization.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "besoin de se connecter" });
  }
  // erreur si le token n'est plus bon
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "le token n'est plus valide" });
    }
    req.user = user;
    next();
  });
}

module.exports = {
  authenticateToken,
  JWT_SECRET,
};
