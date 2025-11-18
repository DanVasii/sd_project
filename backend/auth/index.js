const server = require("express")();
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const swaggerJSDoc = require("swagger-jsdoc");
const amqp = require('amqplib');
const port = 8000;

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Auth Service API",
      version: "1.0.0",
    },
    components: { // 👈 ADD components for security
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        }
      }
    },
    security: [ // 👈 Define security globally, then override per endpoint
      {
        bearerAuth: []
      }
    ]
  },
  apis: ["./index.js"],
};

server.use(bodyParser.json());
server.use(cookieParser());
server.use(cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-User-Id", "X-User-Role"],
    credentials: true
}));
server.use(bodyParser.urlencoded({ extended: true }));

let pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
});

server.use("/api-docs", require("swagger-ui-express").serve, require("swagger-ui-express").setup(swaggerJSDoc(options)));

server.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerJSDoc(options));
});


const RABBIT_HOST = process.env.RABBIT_HOST || 'rabbitmq';
const RABBIT_USER = process.env.RABBIT_USER || 'root';
const RABBIT_PASS = process.env.RABBIT_PASS || 'test';
const RABBIT_URL = `amqp://${RABBIT_USER}:${RABBIT_PASS}@${RABBIT_HOST}`;
const SYNC_QUEUE = 'sync_events_queue'; // Coada dedicată sincronizării

let channel;

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBIT_URL);
        connection.on("error", (err) => {
            console.error("RabbitMQ Connection Error:", err.message);
        });
        channel = await connection.createChannel();
        // Asigurăm că există coada de sincronizare, durabilă
        await channel.assertQueue(SYNC_QUEUE, { durable: true });
        console.log("Auth Service connected to RabbitMQ and SYNC_QUEUE asserted.");
    } catch (error) {
        console.error("Failed to connect to RabbitMQ:", error.message);
        // Reîncercare după 5 secunde
        setTimeout(connectRabbitMQ, 5000); 
    }
}

function publishSyncEvent(type, data) {
    const message = { type, data, timestamp: new Date().toISOString() };
    if (channel) {
        channel.sendToQueue(SYNC_QUEUE, Buffer.from(JSON.stringify(message)), { persistent: true });
        console.log(`[SYNC PUBLISH] Event published: ${type} for User ID ${data.id}`);
    } else {
        console.error("RabbitMQ channel not available. Failed to publish sync event.");
    }
}

connectRabbitMQ(); 

server.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

server.get("/", (req, res) => {
  res.send("Auth Service is running");
});

const checkJWTMiddleware = (req, res, next) => {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    console.log("Checking token:", token);

    if (!token) {
        return res.sendStatus(401); 
    }
    try {
      const decoded = jwt.verify(token, "your_jwt_secret");
      req.user = { id: decoded.userId, role: decoded.role };
      //set the headers 
      res.setHeader("X-User-Id", decoded.userId);
      res.setHeader("X-User-Role", decoded.role);
      next();
    } catch (err) {
      console.log("Token verification failed:", err);
      return res.sendStatus(401);
    }
};

/**
 * @openapi
 * /verify:
 *   get:
 *    description: Verify JWT token
 *    responses: 
 *     200:
 *      description: Token is valid
 *    401:
 *     description: Token is invalid or missing
 */
server.all("/verify", checkJWTMiddleware, (req, res) => {
    res.sendStatus(200);
});

/** 
 * @openapi
 * /login:
 *  post:
 *   description: Login user and return JWT token
 *   requestBody:
 *    required: true
 *    content:
 *     application/json:
 *      schema:
 *       type: object
 *       properties:
 *        username:
 *         type: string
 *        password:
 *         type: string
 *   responses:
 *    200:
 *     description: Login successful
 *     content:
 *      application/json:
 *       schema:
 *        type: object
 *        properties:
 *         message:
 *          type: string
 *         user:
 *          type: object
 *          properties:
 *           id:
 *            type: integer
 *           role:
 *            type: string
 *           token:
 *            type: string
 *    400:
 *     description: Username and password are required
 *    401:
 *     description: Invalid username or password
 *    500:
 *     description: Internal server error
 */
server.post("/login", async (req, res) => {
  const {username, password} = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try{

    const [results, fields] = await pool.query("SELECT id, role, password FROM users WHERE username = ?", [username]);

    if (results.length === 0) {
      return res.status(401).json({ error: "Username does not exist" });
    }

    const isMatch = await bcrypt.compare(password, results[0].password);
    
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    //set the jwt cookie
    let token = jwt.sign({ userId: results[0].id, role: results[0].role }, "your_jwt_secret", { expiresIn: "1h" });


    return res.status(200).json({ message: "Login successful", user: { id: results[0].id, role: results[0].role, token: token } });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }

}); 

/**
 * @openapi
 * /register:
 *  post:
 *   description: Register a new user (admin only)
 *   requestBody:
 *    required: true
 *    content:
 *     application/json:
 *      schema:
 *       type: object
 *       properties:
 *        username:
 *         type: string
 *        password:
 *         type: string
 *        role:
 *         type: string
 *   responses:
 *     201:
 *      description: User registered successfully
 *      content:
 *       application/json:
 *        schema:
 *         type: object
 *         properties:
 *          message:
 *           type: string
 *          id:
 *           type: integer
 *     400:
 *      description: Username, password, and role are required
 *     403:
 *      description: Forbidden
 *     409:
 *      description: Username already exists
 *     500:
 *      description: Internal server error
 */
server.post("/register", checkJWTMiddleware, async (req, res) => {

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const {username, password, role, name, email, avatar_url} = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Username, password, and role are required" });
  }

  if (role !== "admin" && role !== "client") {
    return res.status(400).json({ error: "Role must be either 'admin' or 'client'" });
  }

  try{
    //first check if username exists
    const [existingUsers] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 8);
    const [results] = await pool.query("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hashedPassword, role]);
    const userId = results.insertId;

    publishSyncEvent('USER_CREATED', { 
            id: userId, 
            role: role,
            name: name,
            email: email,
            avatar_url: avatar_url || null
        });

    console.log("Registered new user with ID:", results.insertId);
    return res.status(201).json({ message: "User registered successfully", id: results.insertId });

  }catch(e){
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }

});

/**
 * @openapi
 * /user/{id}:
 *   delete:
 *     summary: Delete a user (admin only)
 *     description: Deletes the user with the given id. Requires a valid JWT and admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User deleted successfully
 *       401:
 *         description: Unauthorized - missing or invalid JWT
 *       403:
 *         description: Forbidden - authenticated user is not an admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Forbidden
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error
 */
server.delete("/user/:id", checkJWTMiddleware, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const userId = req.params.id;
  try{
    await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    if (result.affectedRows > 0) {
      publishSyncEvent('USER_DELETED', { 
        id: parseInt(userId) 
      });
    }

    return res.status(200).json({ message: "User deleted successfully" });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  } 
});

/**
 * @openapi
 * /user/{id}:
 *   get:
 *     summary: Get user by ID (admin only)
 *     description: Returns user details for the specified user ID. Requires a valid JWT and admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to retrieve
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     role:
 *                       type: string
 *                   example:
 *                     id: 1
 *                     username: alice
 *                     role: admin
 *       401:
 *         description: Unauthorized - missing or invalid JWT
 *       403:
 *         description: Forbidden - authenticated user is not an admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Forbidden
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: User not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error
 */
server.get("/user/:id", checkJWTMiddleware, async (req, res) => {
  
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const userId = req.params.id;
  try{
    const [results] = await pool.query("SELECT id, username, role FROM users WHERE id = ?", [userId]);
    if (results.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.status(200).json({ user: results[0] });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }
});


/**
 * @openapi
 * /user/{id}:
 *  put: 
 *   description: Update user details (admin only)
 *   parameters:
 *    - in: path
 *      name: id
 *      required: true
 *      schema:
 *       type: integer
 *       description: ID of the user to update
 *   requestBody:
 *    required: true
 *    content:
 *     application/json:
 *      schema:
 *       type: object
 *       properties:
 *        username:
 *         type: string
 *        password:
 *         type: string
 *        role:
 *         type: string
 *   responses:
 *    200:
 *     description: User updated successfully
 *    400:
 *     description: Username and role are required 
 *    403:
 *     description: Forbidden
*/
server.put("/user/:id", checkJWTMiddleware, async (req, res) => {
  
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const userId = req.params.id;
  const {username, password, role, name, email, avatar_url} = req.body;

  if (!username || !role) {
    return res.status(400).json({ error: "Username and role are required" });
  }
  if (role !== "admin" && role !== "client") {
    return res.status(400).json({ error: "Role must be either 'admin' or 'client'" });
  }
  try{
    let query = "UPDATE users SET username = ?, role = ?";
    let params = [username, role];
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 8);
      query += ", password = ?";
      params.push(hashedPassword);
    }
    query += " WHERE id = ?";
    params.push(userId);

    await pool.query(query, params);

    publishSyncEvent('USER_UPDATED', { 
        id: parseInt(userId), 
        role: role,
        name: name,
        email: email,
        avatar_url: avatar_url || null
    });
      
    return res.status(200).json({ message: "User updated successfully" });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }
});


server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});