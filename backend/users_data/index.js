const server = require("express")();
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const swaggerJSDoc = require("swagger-jsdoc");
const amqp = require('amqplib');

const port = 8002;

server.use(bodyParser.json());
server.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
server.use(bodyParser.urlencoded({ extended: true }));

let pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
});

const RABBIT_HOST = process.env.RABBIT_HOST || 'rabbitmq'; 
const RABBIT_USER = process.env.RABBIT_USER || 'root'; 
const RABBIT_PASS = process.env.RABBIT_PASS || 'test';
const RABBIT_URL = `amqp://${RABBIT_USER}:${RABBIT_PASS}@${RABBIT_HOST}`;
const SYNC_EXCHANGE = 'sync_events_exchange';
let channel;

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBIT_URL);
        connection.on("error", (err) => {
            console.error("RabbitMQ Connection Error:", err.message);
        });
        channel = await connection.createChannel();
        await channel.prefetch(1);
        await channel.assertExchange(SYNC_EXCHANGE, 'fanout', { durable: true });
        const q = await channel.assertQueue('users_data_sync_queue', { durable: true });
        await channel.bindQueue(q.queue, SYNC_EXCHANGE, '');

        console.log("Users Data Service connected to RabbitMQ sync consumer.");

        startSyncConsumer(q.queue);
        
    } catch (error) {
        console.error("Failed to connect to RabbitMQ:", error.message);
        setTimeout(connectRabbitMQ, 5000); 
    }
}

async function startSyncConsumer(queueName) {
    channel.consume(queueName, async (msg) => {
        if (msg !== null) {
            console.log("Primit mesaj de sincronizare:", msg.content.toString());
            
            
            try {
                const event = JSON.parse(msg.content.toString());
            const { id, name, email, avatar_url } = event.data;
                if (event.type === 'USER_CREATED') {
                    await pool.query(
                        "INSERT INTO users (user_id, name, email, avatar_url) VALUES (?, ?, ?, ?)", 
                        [id, name, email, avatar_url]
                    );
                    console.log(`[SYNC CONSUME] User profile created for ID: ${id}`);
                } else if (event.type === 'USER_UPDATED') {
                    await pool.query(
                        "UPDATE users SET name = ?, email = ?, avatar_url = ? WHERE user_id = ?",
                        [name, email, avatar_url, id]
                    );
                    console.log(`[SYNC CONSUME] User profile updated for ID: ${id}`);
                } else if (event.type === 'USER_DELETED') {
                    await pool.query("DELETE FROM users WHERE user_id = ?", [id]);
                    console.log(`[SYNC CONSUME] User profile deleted for ID: ${id}`);
                }
                
                channel.ack(msg); 
            } catch (dbError) {
                console.error(`[SYNC DB ERROR] Failed to process `, dbError.message);
                // Nu trimite ACK; mesajul va fi reîncercat
                
            }
        }
    });
}

connectRabbitMQ(); 

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Users data service",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        }
      }
    },
    security: [ 
      {
        bearerAuth: []
      }
    ]
  },
  apis: ["./index.js"],
};


server.use("/api-docs", require("swagger-ui-express").serve, require("swagger-ui-express").setup(swaggerJSDoc(options)));

server.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerJSDoc(options));
});


server.get("/test", (req, res) => {
  res.send("Users Data backend is running");
});

/**
 * @openapi
 * /users:
 *   get:
 *     summary: Returns a list of all users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       created_at:
 *                         type: string
 */
server.get("/users", async (req, res) => {
    const user_role = req.headers["x-user-role"];
    if (user_role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
    }
    
    try {
        const [rows] = await pool.query("SELECT user_id, name, created_at FROM users");
        res.json({ users: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
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
 *           type: string
 *         description: ID of the user
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user_id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 avatar_url:
 *                   type: string
 *                 created_at:
 *                   type: string
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: User not found
 */
server.get("/user/:id", async (req, res) => {
    const user_role = req.headers["x-user-role"];
    if (user_role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
    }
    const userId = req.params.id;
    try {
        const [rows] = await pool.query("SELECT user_id, name, email, avatar_url, created_at FROM users WHERE user_id = ?", [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json({ user: rows[0] });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
    }   
});

/**
 * @openapi
 * /user/{id}:
 *   put:
 *     summary: Update user by ID (admin only)
 *     description: Updates name, email, and avatar URL of the specified user. Requires admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               avatar_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Name and email are required
 *       403:
 *         description: Forbidden — admin only
 *       500:
 *         description: Internal Server Error
 */

server.put("/user/:id", async (req, res) => {
    const user_role = req.headers["x-user-role"];
    if (user_role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
    }
    const userId = req.params.id;
    const { name, email, avatar_url } = req.body;

    if (!name || !email) {
        return res.status(400).json({ message: "Name and email are required" });
    }
    try {
        await pool.query("UPDATE users SET name = ?, email = ?, avatar_url = ? WHERE user_id = ?", [name, email, avatar_url, userId]);
        res.json({ message: "User updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

/**
 * @openapi
 * /user/{id}:
 *   post:
 *     summary: Create user by ID (admin only)
 *     description: Creates a new user with the given ID. Requires admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to create
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               avatar_url:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Name and email are required
 *       403:
 *         description: Forbidden — admin only
 *       500:
 *         description: Internal Server Error
 */
server.post("/user/:id", async (req, res) => {
    const user_role = req.headers["x-user-role"];
    if (user_role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
    }
    const userId = req.params.id;
    const { name, email, avatar_url } = req.body;
    if (!name || !email) {
        return res.status(400).json({ message: "Name and email are required" });
    }
    try {
        await pool.query("INSERT INTO users (user_id, name, email, avatar_url) VALUES (?, ?, ?, ?)", [userId, name, email, avatar_url]);
        res.status(201).json({ message: "User created successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

/**
 * @openapi
 * /user/{id}:
 *   delete:
 *     summary: Delete user by ID (admin only)
 *     description: Deletes the specified user. Requires admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       403:
 *         description: Forbidden — admin only
 *       500:
 *         description: Internal Server Error
 */
server.delete("/user/:id", async (req, res) => {
    const user_role = req.headers["x-user-role"];
    if (user_role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
    }
    const userId = req.params.id;
    try {
        await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
        res.json({ message: "User deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

server.listen(port, () => {
    console.log(`Users Data backend running on port ${port}`);
});