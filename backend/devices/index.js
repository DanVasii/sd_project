const server = require("express")();
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const swaggerJSDoc = require("swagger-jsdoc");
const amqp = require('amqplib');
const RABBIT_HOST = process.env.RABBIT_HOST || 'rabbitmq';
const RABBIT_USER = process.env.RABBIT_USER || 'root';
const RABBIT_PASS = process.env.RABBIT_PASS || 'test';
const RABBIT_URL = `amqp://${RABBIT_USER}:${RABBIT_PASS}@${RABBIT_HOST}`;
const SYNC_QUEUE = 'sync_events_queue'; // Coada comună de sincronizare
const port = 8001;

server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: true }));
server.use(cors({
    origin: ["http://localhost:5173", "http://localhost"],
    allowedHeaders: ['Content-Type', 'X-User-Id', 'X-User-Role'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));

let channel;

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBIT_URL);
        connection.on("error", (err) => {
            console.error("RabbitMQ Connection Error:", err.message);
        });
        channel = await connection.createChannel();
        await channel.prefetch(1);
        await channel.assertQueue(SYNC_QUEUE, { durable: true });
        console.log("Devices Service connected to RabbitMQ and SYNC_QUEUE asserted.");

        // Pornește Consumer-ul după ce canalul este gata
        startSyncConsumer(); 
    } catch (error) {
        console.error("Failed to connect to RabbitMQ:", error.message);
        channel.nack(msg, false, true);
        setTimeout(connectRabbitMQ, 5000); 
    }
}

// Funcție pentru a publica evenimente (folosită pentru DEVICE_CREATED/DELETED)
function publishSyncEvent(type, data) {
    const message = { type, data, timestamp: new Date().toISOString() };
    if (channel) {
        channel.sendToQueue(SYNC_QUEUE, Buffer.from(JSON.stringify(message)), { persistent: true });
        console.log(`[SYNC PUBLISH] Event published: ${type} for ID ${data.id}`);
    } else {
        console.error("RabbitMQ channel not available. Failed to publish sync event.");
    }
}

// Funcție pentru a consuma evenimentele (folosită pentru USER_CREATED/DELETED)
async function startSyncConsumer() {
    channel.consume(SYNC_QUEUE, async (msg) => {
        if (msg !== null) {
            const event = JSON.parse(msg.content.toString());
            
            // Procesează doar evenimentele legate de USER (ignoră DEVICE-urile publicate de el însuși)
            if (event.type.startsWith('USER_')) {
                const userId = event.data.id;
                try {
                    if (event.type === 'USER_CREATED' || event.type === 'USER_UPDATED') {
                        // Inserează (sau ignoră dacă există deja) ID-ul în tabela locală `synced_users`
                        await pool.query('INSERT IGNORE INTO synced_users (user_id) VALUES (?)', [userId]);
                    } else if (event.type === 'USER_DELETED') {
                        // Șterge din tabela locală. `devices.user_id` devine NULL automat (ON DELETE SET NULL).
                        await pool.query('DELETE FROM synced_users WHERE user_id = ?', [userId]);
                    }
                    console.log(`[SYNC CONSUME] Processed ${event.type} for User ID ${userId}`);
                    channel.ack(msg);
                } catch (dbError) {
                    console.error('[SYNC ERROR] Failed to process user event:', dbError);
                    // Lăsați mesajul în coadă pentru reîncercare (nu trimiteți ack)
                }
            } else {
                // Confirmă mesajul dacă nu este un eveniment de user (pentru a-l ignora)
                channel.ack(msg);
            }
        }
    });
}

connectRabbitMQ(); 

let pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
});

server.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Devices service",
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

server.use("/api-docs", require("swagger-ui-express").serve, require("swagger-ui-express").setup(swaggerJSDoc(options)));

server.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerJSDoc(options));
});


/**
 * @openapi
 * /my_devices:
 *   get:
 *     summary: Get devices for the logged-in client
 *     description: Returns all devices belonging to the user identified by X-User-Id header. Only accessible to clients.
 *     tags:
 *       - Devices
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-User-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the user
 *       - in: header
 *         name: X-User-Role
 *         schema:
 *           type: string
 *         required: true
 *         description: Role of the user, must be "client"
 *     responses:
 *       200:
 *         description: List of devices for the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 devices:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Device'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

server.get("/my_devices", async (req, res)=>{
    const userId = req.headers['x-user-id'];
    const role = req.headers['x-user-role'];

    if (role !== 'client') {
        return res.sendStatus(403);
    }
    
    if (!userId) {
        return res.sendStatus(401);
    }

    console.log("Fetching devices for user ID:", userId);
    try{

        const [results] = await pool.query("SELECT * from devices where user_id = ?", [userId]);

        return res.status(200).json({ devices: results });

    }catch(e){
        console.error(e);
        return res.status(500).json({ error: "Internal server error" });
    }
 
})

/**
 * @openapi
 * /devices:
 *   get:
 *     summary: Get all devices
 *     description: Returns all devices. Only accessible to admin users.
 *     tags:
 *       - Devices
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-User-Role
 *         schema:
 *           type: string
 *         required: true
 *         description: Role of the user, must be "admin"
 *     responses:
 *       200:
 *         description: List of all devices
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 devices:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Device'
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
server.get("/devices", async (req, res) => {

    const role = req.headers['x-user-role'];

    if (role !== 'admin') {
        return res.sendStatus(403);
    }
    
    try{
        const [results] = await pool.query("SELECT id, name, max_consumption, image_url, created_at, user_id FROM devices");
        return res.status(200).json({ devices: results });
    }catch(e){
        console.error(e);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * @openapi
 * /device:
 *   post:
 *     summary: Add a new device
 *     description: Admins can add a new device.
 *     tags:
 *       - Devices
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-User-Role
 *         schema:
 *           type: string
 *         required: true
 *         description: Role of the user, must be "admin"
 *     requestBody:
 *       description: Device details
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - max_consumption
 *             properties:
 *               name:
 *                 type: string
 *               max_consumption:
 *                 type: number
 *               image_url:
 *                 type: string
 *     responses:
 *       201:
 *         description: Device created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deviceId:
 *                   type: integer
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

server.post("/device", async (req, res) => {
    const {name, max_consumption, image_url} = req.body;

    const role = req.headers['x-user-role'];
    
    if (role !== 'admin') {
        return res.sendStatus(403);
    }
    
    if (!name || !max_consumption) {
        return res.status(400).json({ error: "Name and max_consumption are required" });
    }

    try{
        const [result] = await pool.query(
            "INSERT INTO devices (name, max_consumption, image_url) VALUES (?, ?, ?)",
            [name, max_consumption, image_url || null]
        );

        let deviceId = result.insertId;

        publishSyncEvent('DEVICE_CREATED', { 
            id: deviceId, 
            name: name,
            max_consumption: max_consumption 
        });

        return res.status(201).json({ message: "Device added successfully", deviceId: result.insertId });

    }catch(e){
        console.error(e);
        return res.status(500).json({ error: "Internal server error" });
    }

});
/**
 * @openapi
 * /device/{id}:
 *   delete:
 *     summary: Delete a device
 *     description: Admins can delete a device by ID.
 *     tags:
 *       - Devices
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-User-Role
 *         schema:
 *           type: string
 *         required: true
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the device to delete
 *     responses:
 *       200:
 *         description: Device deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Device not found
 *       500:
 *         description: Internal server error
 */
server.delete("/device/:id", async (req, res) => {
    const deviceId = req.params.id;

    const role = req.headers['x-user-role'];
    
    if (role !== 'admin') {
        return res.sendStatus(403);
    }

    try{
        const [result] = await pool.query("DELETE FROM devices WHERE id = ?", [deviceId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Device not found" });
        }

        publishSyncEvent('DEVICE_DELETED', { 
            id: parseInt(deviceId) 
        });

        return res.status(200).json({ message: "Device deleted successfully" });
    }catch(e){
        console.error(e);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * @openapi
 * /device/{id}:
 *   put:
 *     summary: Update a device
 *     description: Admins can update a device by ID.
 *     tags:
 *       - Devices
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the device to update
 *     requestBody:
 *       description: Device update details
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - max_consumption
 *             properties:
 *               name:
 *                 type: string
 *               max_consumption:
 *                 type: number
 *               image_url:
 *                 type: string
 *               user_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Device updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       404:
 *         description: Device not found
 *       500:
 *         description: Internal server error
 */
server.put("/device/:id", async (req, res) => {
    const deviceId = req.params.id;
    const {name, max_consumption, image_url, user_id} = req.body;  

    if (!name || !max_consumption) {
        return res.status(400).json({ error: "Name and max_consumption are required" });
    }
    
    try{
        const [result] = await pool.query(
            "UPDATE devices SET name = ?, max_consumption = ?, image_url = ?, user_id = ? WHERE id = ?",
            [name, max_consumption, image_url || null, user_id || null, deviceId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Device not found" });
        }
        return res.status(200).json({ message: "Device updated successfully" });
    }catch(e){
        console.error(e);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * @openapi
 * components:
 *   schemas:
 *     Device:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         max_consumption:
 *           type: number
 *         image_url:
 *           type: string
 *         user_id:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 */
server.listen(port, () => {
    console.log(`Devices backend running on port ${port}`);
});