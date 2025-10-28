const server = require("express")();
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const swaggerJSDoc = require("swagger-jsdoc");
const port = 8001;

server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: true }));
server.use(cors({
    origin: ["http://localhost:5173", "http://localhost"],
    allowedHeaders: ['Content-Type', 'X-User-Id', 'X-User-Role'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));


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