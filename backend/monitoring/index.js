const server = require("express")();
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const amqp = require('amqplib');
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const port = 8003;

// -------------------- Configurare DB --------------------
let pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
});

// -------------------- Configurare RabbitMQ --------------------
const RABBIT_HOST = process.env.RABBIT_HOST || 'rabbitmq';
const RABBIT_USER = process.env.RABBIT_USER || 'root';
const RABBIT_PASS = process.env.RABBIT_PASS || 'test';
const RABBIT_URL = `amqp://${RABBIT_USER}:${RABBIT_PASS}@${RABBIT_HOST}`;

// Coada pentru datele de consum
const DATA_QUEUE = 'device_data_queue'; 
// Coada pentru evenimentele de sincronizare
const SYNC_QUEUE = 'sync_events_queue'; 

let channel;

// Funcție pentru a salva sau actualiza datele agregate în DB
async function saveHourlyConsumption(deviceId, timestamp, consumption) {
    // Extrage începutul orei (ex: 2025-11-17 22:00:00)
    const date = new Date(timestamp);
    date.setMinutes(0, 0, 0); // Setează la începutul orei
    const hourStart = date.toISOString().slice(0, 19).replace('T', ' ');

    try {
        // Folosim INSERT...ON DUPLICATE KEY UPDATE pentru a adăuga valoarea nouă la cea existentă
        const query = `
            INSERT INTO hourly_consumption (device_id, timestamp, energy_consumed) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            energy_consumed = energy_consumed + VALUES(energy_consumed)
        `;
        await pool.query(query, [deviceId, hourStart, consumption]);
        console.log(`[DB] Updated hourly sum for Device ${deviceId} at ${hourStart}: +${consumption} kWh`);
    } catch (e) {
        console.error('DB Error on hourly aggregation:', e);
    }
}

// Funcție pentru a conecta la RabbitMQ și a porni Consumer-ii
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBIT_URL);
        connection.on("error", (err) => {
            console.error("RabbitMQ Connection Error:", err.message);
        });
        channel = await connection.createChannel();
        // Asigură existența ambelor cozi
        await channel.assertQueue(DATA_QUEUE, { durable: true });
        await channel.assertQueue(SYNC_QUEUE, { durable: true });
        console.log("Monitoring Service connected to RabbitMQ and all queues asserted.");

        // Pornește ambii consumeri
        startDataConsumer(); 
        startSyncConsumer();
        
    } catch (error) {
        console.error("Failed to connect to RabbitMQ:", error.message);
        setTimeout(connectRabbitMQ, 5000); 
    }
}


// Consumer 1: Procesează Datele de Consum (Data Collection Broker)
async function startDataConsumer() {
    channel.consume(DATA_QUEUE, (msg) => {
        if (msg !== null) {
            const event = JSON.parse(msg.content.toString());
            const { deviceId, measurement_value, timestamp } = event;
            
            if (deviceId && measurement_value !== undefined) {
                // Salvează valoarea (10 min) direct în DB, lăsând DB-ul să facă agregarea (sumare).
                saveHourlyConsumption(deviceId, timestamp, measurement_value);
            }

            channel.ack(msg);
        }
    });
}

// Consumer 2: Procesează Evenimentele de Sincronizare (Synchronization Broker)
async function startSyncConsumer() {
    channel.consume(SYNC_QUEUE, (msg) => {
        if (msg !== null) {
            const event = JSON.parse(msg.content.toString());
            
            // Procesează doar evenimentele legate de DISPOZITIVE
            if (event.type.startsWith('DEVICE_')) {
                const deviceId = event.data.id;
                
                if (event.type === 'DEVICE_DELETED') {
                    // Când un dispozitiv este șters, ștergem și datele istorice din monitoring_db.
                    pool.query('DELETE FROM hourly_consumption WHERE device_id = ?', [deviceId])
                        .then(() => console.log(`[SYNC CONSUME] Device Deleted: Cleared historical data for ID ${deviceId}`))
                        .catch(e => console.error(`[SYNC DB ERROR] Failed to delete data for ID ${deviceId}:`, e));
                } else if (event.type === 'DEVICE_CREATED') {
                    console.log(`[SYNC CONSUME] Device Registered: Ready to collect data for ID ${deviceId}`);
                }
            }
            
            channel.ack(msg);
        }
    });
}


// Inițializare servicii la pornirea aplicației
connectRabbitMQ(); 

// -------------------- Express Server Setup --------------------
server.use(bodyParser.json());
server.use(cors({
    origin: "http://localhost:5173",
    methods: ["GET"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
server.use(bodyParser.urlencoded({ extended: true }));

// Swagger Setup
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Monitoring Service API",
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
    security: [{ bearerAuth: [] }]
  },
  apis: ["./index.js"],
};

server.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerJSDoc(options)));
server.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerJSDoc(options));
});


server.get("/", (req, res) => {
  res.send("Monitoring Service is running");
});


/**
 * @openapi
 * /historical_consumption/{deviceId}/{date}:
 * get:
 * summary: Get hourly consumption for a specific device on a specific day
 * description: Returns the aggregated energy consumption per hour (kWh) for a given device and day.
 * tags:
 * - Monitoring
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: deviceId
 * required: true
 * schema:
 * type: integer
 * description: ID of the device to retrieve data for.
 * - in: path
 * name: date
 * required: true
 * schema:
 * type: string
 * format: date
 * example: 2025-11-17
 * description: Date to retrieve data for, in YYYY-MM-DD format.
 * responses:
 * 200:
 * description: Hourly consumption data returned successfully.
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * consumption:
 * type: array
 * items:
 * type: object
 * properties:
 * timestamp:
 * type: string
 * format: date-time
 * example: "2025-11-17T09:00:00.000Z"
 * energy_consumed:
 * type: number
 * format: float
 * example: 2.5
 * 500:
 * description: Internal Server Error
 */
server.get("/historical_consumption/:deviceId/:date", async (req, res) => {
    // În implementarea completă, aici se face o verificare de autorizare (dacă utilizatorul logat are acces la acest deviceId)
    
    const { deviceId, date } = req.params;
    
    // Filtrează datele pentru DeviceID și ziua respectivă (YYYY-MM-DD)
    const startDate = `${date} 00:00:00`;
    const endDate = `${date} 23:59:59`;

    const query = `
        SELECT 
            timestamp, 
            SUM(energy_consumed) as energy_consumed
        FROM hourly_consumption 
        WHERE device_id = ? AND timestamp BETWEEN ? AND ?
        GROUP BY timestamp
        ORDER BY timestamp ASC
    `;
    
    try {
        const [results] = await pool.query(query, [deviceId, startDate, endDate]);
        return res.status(200).json({ consumption: results });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Internal server error" });
    }
});


server.listen(port, () => {
  console.log(`Monitoring Service running on port ${port}`);
});